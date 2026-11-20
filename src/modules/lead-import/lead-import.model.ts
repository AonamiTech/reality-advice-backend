export const IMPORT_STATUSES = ['PREVIEW', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'] as const;
export type LeadImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_ROW_STATUSES = ['INVALID', 'PENDING', 'PROCESSING', 'IMPORTED', 'DUPLICATE', 'FAILED'] as const;
export type LeadImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export interface LeadImportCounts {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  processedRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
}
