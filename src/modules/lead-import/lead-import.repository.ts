import { pool } from '../../database/pool';
import type { Db } from '../../database/transaction';
import type { LeadImportRowStatus, LeadImportStatus } from './lead-import.model';

export interface ImportRowInput {
  rowNumber: number;
  payload: unknown;
  validationErrors: unknown;
  status: LeadImportRowStatus;
}

export interface ImportRowRecord extends ImportRowInput {
  id: string;
  leadId: string | null;
  duplicateLeadId: string | null;
  error: string | null;
}

export interface ImportRecord {
  id: string;
  createdBy: string | null;
  filename: string;
  format: 'CSV' | 'XLSX';
  status: LeadImportStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  processedRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

const mapImport = (row: any): ImportRecord => ({
  id: row.id, createdBy: row.created_by, filename: row.filename, format: row.format, status: row.status,
  totalRows: row.total_rows, validRows: row.valid_rows, invalidRows: row.invalid_rows, processedRows: row.processed_rows,
  importedRows: row.imported_rows, duplicateRows: row.duplicate_rows, failedRows: row.failed_rows, error: row.error,
  createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at, completedAt: row.completed_at,
});

const mapRow = (row: any): ImportRowRecord => ({
  id: row.id, rowNumber: row.row_number, payload: row.payload, validationErrors: row.validation_errors,
  status: row.status, leadId: row.lead_id, duplicateLeadId: row.duplicate_lead_id, error: row.error,
});

export async function createImport(db: Db, input: { createdBy: string; filename: string; format: 'CSV' | 'XLSX'; totalRows: number; validRows: number; invalidRows: number }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO lead_imports (created_by, filename, format, total_rows, valid_rows, invalid_rows)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.createdBy, input.filename, input.format, input.totalRows, input.validRows, input.invalidRows],
  );
  return rows[0].id;
}

export async function insertRows(db: Db, importId: string, rows: ImportRowInput[]): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO lead_import_rows (import_id, row_number, payload, validation_errors, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
      [importId, row.rowNumber, JSON.stringify(row.payload), JSON.stringify(row.validationErrors), row.status],
    );
  }
}

export async function findImport(id: string, db: Db = pool): Promise<ImportRecord | null> {
  const result = await db.query('SELECT * FROM lead_imports WHERE id = $1', [id]);
  return result.rows[0] ? mapImport(result.rows[0]) : null;
}

export async function listRows(importId: string, db: Db = pool): Promise<ImportRowRecord[]> {
  const result = await db.query('SELECT * FROM lead_import_rows WHERE import_id = $1 ORDER BY row_number', [importId]);
  return result.rows.map(mapRow);
}

export async function markProcessing(db: Db, importId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE lead_imports SET status = 'PROCESSING', started_at = COALESCE(started_at, now()), updated_at = now()
     WHERE id = $1 AND status = 'PREVIEW' RETURNING id`,
    [importId],
  );
  return result.rowCount === 1;
}

export async function pendingRows(importId: string, db: Db = pool): Promise<ImportRowRecord[]> {
  const result = await db.query(
    `SELECT * FROM lead_import_rows WHERE import_id = $1 AND status = 'PENDING' ORDER BY row_number FOR UPDATE SKIP LOCKED`,
    [importId],
  );
  return result.rows.map(mapRow);
}

export async function claimNextRow(importId: string, db: Db = pool): Promise<ImportRowRecord | null> {
  const result = await db.query(
    `WITH next_row AS (
       SELECT id FROM lead_import_rows WHERE import_id = $1 AND status = 'PENDING' ORDER BY row_number LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     UPDATE lead_import_rows r SET status = 'PROCESSING', updated_at = now()
     FROM next_row WHERE r.id = next_row.id RETURNING r.*`,
    [importId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function markRow(db: Db, id: string, update: { status: LeadImportRowStatus; leadId?: string | null; duplicateLeadId?: string | null; error?: string | null }): Promise<void> {
  await db.query(
    `UPDATE lead_import_rows SET status = $2, lead_id = COALESCE($3, lead_id), duplicate_lead_id = COALESCE($4, duplicate_lead_id), error = $5, updated_at = now() WHERE id = $1`,
    [id, update.status, update.leadId ?? null, update.duplicateLeadId ?? null, update.error ?? null],
  );
}

export async function completeImport(db: Db, importId: string, status: Exclude<LeadImportStatus, 'PREVIEW' | 'PROCESSING'>, error?: string | null): Promise<void> {
  await db.query(
    `UPDATE lead_imports i SET status = $2, processed_rows = (SELECT count(*) FROM lead_import_rows r WHERE r.import_id = i.id AND r.status IN ('IMPORTED', 'DUPLICATE', 'FAILED')),
       imported_rows = (SELECT count(*) FROM lead_import_rows r WHERE r.import_id = i.id AND r.status = 'IMPORTED'),
       duplicate_rows = (SELECT count(*) FROM lead_import_rows r WHERE r.import_id = i.id AND r.status = 'DUPLICATE'),
       failed_rows = (SELECT count(*) FROM lead_import_rows r WHERE r.import_id = i.id AND r.status = 'FAILED'),
       error = $3, updated_at = now(), completed_at = now() WHERE i.id = $1`,
    [importId, status, error ?? null],
  );
}
