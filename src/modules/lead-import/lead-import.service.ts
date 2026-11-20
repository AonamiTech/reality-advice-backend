import { withTransaction } from '../../database/transaction';
import { pool } from '../../database/pool';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { parseLeadImportFile, type LeadImportFile } from './lead-import.parser';
import * as repo from './lead-import.repository';
import type { LeadImportRowStatus } from './lead-import.model';
import { createLead } from '../leads/lead.service';
import { createLeadSchema } from '../leads/lead.validation';

const safeError = (error: unknown) => error instanceof Error ? error.message : 'Lead creation failed';

const counts = (record: repo.ImportRecord) => ({
  totalRows: record.totalRows,
  validRows: record.validRows,
  invalidRows: record.invalidRows,
  processedRows: record.processedRows,
  importedRows: record.importedRows,
  duplicateRows: record.duplicateRows,
  failedRows: record.failedRows,
});

export async function getImport(id: string) {
  const record = await repo.findImport(id);
  if (!record) throw new NotFoundError('Lead import not found');
  return { ...record, counts: counts(record), rows: await repo.listRows(id) };
}

export async function preview(file: LeadImportFile, adminId: string) {
  let parsed;
  try {
    parsed = parseLeadImportFile(file);
  } catch (error) {
    throw new ValidationError([{ field: 'file', message: safeError(error) }]);
  }
  const validRows = parsed.rows.filter((row) => row.errors.length === 0);
  const importId = await withTransaction(async (tx) => {
    const id = await repo.createImport(tx, {
      createdBy: adminId,
      filename: file.filename.slice(0, 255),
      format: parsed.format,
      totalRows: parsed.rows.length,
      validRows: validRows.length,
      invalidRows: parsed.rows.length - validRows.length,
    });
    await repo.insertRows(tx, id, parsed.rows.map((row) => ({
      rowNumber: row.rowNumber,
      payload: row.payload,
      validationErrors: row.errors,
      status: row.errors.length ? 'INVALID' as const : 'PENDING' as const,
    })));
    return id;
  });
  return getImport(importId);
}

export async function confirm(id: string, adminId: string) {
  const record = await repo.findImport(id);
  if (!record) throw new NotFoundError('Lead import not found');
  if (record.status === 'COMPLETED' || record.status === 'COMPLETED_WITH_ERRORS' || record.status === 'FAILED') return getImport(id);
  const claimed = await repo.markProcessing(pool, id);
  if (!claimed) return getImport(id);

  while (true) {
    const row = await repo.claimNextRow(id);
    if (!row) break;
    const parsed = createLeadSchema.safeParse(row.payload);
    if (!parsed.success) {
      await repo.markRow(pool, row.id, { status: 'FAILED', error: 'Staged row validation failed during confirmation' });
      continue;
    }
    try {
      const result = await createLead(parsed.data, adminId);
      if (result.created) await repo.markRow(pool, row.id, { status: 'IMPORTED', leadId: result.lead.id });
      else await repo.markRow(pool, row.id, { status: 'DUPLICATE', duplicateLeadId: result.lead.id });
    } catch (error) {
      await repo.markRow(pool, row.id, { status: 'FAILED', error: safeError(error).slice(0, 500) });
    }
  }

  const remaining = await repo.findImport(id);
  if (!remaining) throw new NotFoundError('Lead import not found');
  const status: LeadImportRowStatus[] = (await repo.listRows(id)).map((row) => row.status);
  await repo.completeImport(pool, id, status.includes('FAILED') || status.includes('INVALID') ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED');
  return getImport(id);
}
