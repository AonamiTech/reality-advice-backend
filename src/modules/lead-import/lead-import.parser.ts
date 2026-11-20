import XLSX from 'xlsx';
import { createLeadSchema } from '../leads/lead.validation';
import type { NewLeadInput } from '../leads/lead.service';
import { PROPERTY_SOURCES, MANUAL_LEAD_SUB_SOURCES } from '../properties/property.model';
import { ENQUIRY_TYPES, LEAD_TYPES } from '../leads/lead.model';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;

export interface LeadImportFile {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

export interface LeadImportRow {
  rowNumber: number;
  payload: Record<string, unknown>;
  errors: { field: string; message: string }[];
}

export interface ParsedLeadImport {
  format: 'CSV' | 'XLSX';
  rows: LeadImportRow[];
}

const columns: Record<string, keyof NewLeadInput> = {
  name: 'name',
  fullname: 'name',
  mobile: 'mobile',
  phone: 'mobile',
  contactnumber: 'mobile',
  email: 'email',
  emailid: 'email',
  property: 'propertyName',
  propertyname: 'propertyName',
  project: 'propertyName',
  projectname: 'propertyName',
  source: 'source',
  leadsource: 'source',
  manualsubsource: 'manualSubSource',
  leadtype: 'leadType',
  type: 'leadType',
  enquiry: 'enquiryType',
  enquirytype: 'enquiryType',
  budget: 'budget',
  price: 'budget',
  requirement: 'requirement',
  message: 'message',
  notes: 'message',
  externalleadid: 'externalLeadId',
};

const canonical = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (value: unknown) => {
  const result = String(value ?? '').trim();
  return result === '' ? undefined : result;
};

function normalizeMoney(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  const raw = String(value).trim().replace(/^INR/i, '').replace(/^\u00e2\u0082\u00b9|^₹/, '').replace(/[,$\s]/g, '');
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isFinite(number) ? number : value;
}

function normalizeRow(values: unknown[], headers: string[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const target = columns[canonical(header)];
    if (!target) return;
    const value = target === 'budget' ? normalizeMoney(values[index]) : text(values[index]);
    if (value !== undefined) row[target] = target === 'source' || target === 'manualSubSource' || target === 'leadType' || target === 'enquiryType'
      ? String(value).toUpperCase()
      : value;
  });
  return row;
}

function extractRows(file: LeadImportFile): { format: 'CSV' | 'XLSX'; matrix: unknown[][] } {
  if (file.buffer.length > MAX_IMPORT_BYTES) throw new Error('File must be at most 10 MB');
  const extension = file.filename.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'xlsx') throw new Error('Only CSV and XLSX files are supported');
  const workbook = XLSX.read(file.buffer, { type: 'buffer', raw: false, cellFormula: false, cellHTML: false });
  const first = workbook.SheetNames[0];
  if (!first) throw new Error('The file does not contain a worksheet');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[first], { header: 1, defval: '', raw: false, blankrows: false });
  return { format: extension === 'csv' ? 'CSV' : 'XLSX', matrix };
}

export function parseLeadImportFile(file: LeadImportFile): ParsedLeadImport {
  const { format, matrix } = extractRows(file);
  if (matrix.length < 1) throw new Error('The file must contain a header row');
  const headers = matrix[0].map((value) => String(value ?? '').trim());
  const seen = new Set<string>();
  const unknown: string[] = [];
  const mapped = headers.map((header) => {
    const key = canonical(header);
    const target = columns[key];
    if (!target && header) unknown.push(header);
    if (target) seen.add(target);
    return target;
  });
  if (unknown.length) throw new Error(`Unknown columns: ${[...new Set(unknown)].join(', ')}`);
  const required = ['name', 'mobile', 'propertyName', 'source'] as const;
  const missing = required.filter((key) => !seen.has(key));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);
  const data = matrix.slice(1).filter((values) => values.some((value) => String(value ?? '').trim() !== ''));
  if (data.length === 0) throw new Error('The file must contain at least one data row');
  if (data.length > MAX_IMPORT_ROWS) throw new Error(`The file may contain at most ${MAX_IMPORT_ROWS} data rows`);
  const rows = data.map((values, index) => {
    const rawPayload = normalizeRow(values, headers);
    const parsed = createLeadSchema.safeParse(rawPayload);
    return {
      rowNumber: index + 2,
      payload: parsed.success ? parsed.data : rawPayload,
      errors: parsed.success ? [] : parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    };
  });
  return { format, rows };
}

export const importColumnNames = Object.keys(columns);
export const importEnums = { PROPERTY_SOURCES, MANUAL_LEAD_SUB_SOURCES, ENQUIRY_TYPES, LEAD_TYPES };
