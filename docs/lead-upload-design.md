# Lead Upload Design

## Intent

Allow an authenticated Admin to upload a CSV or XLSX file, preview row-level validation results, and explicitly confirm the import. Imported rows must use the existing lead creation service so property matching, stub creation, executive assignment, round-robin, activity history, notifications, and duplicate external-lead handling remain consistent with normal lead creation.

## Approach

Use a staged import rather than creating leads during the upload request. The upload request parses and validates the file, persists a durable import and its normalized rows, and returns a preview. A separate confirmation request processes only valid pending rows and records row-level results. Repeating confirmation is idempotent because completed rows are not processed again.

Direct synchronous parsing/creation was rejected because a large file can time out or leave the caller without a durable preview. Sending base64 JSON was rejected because it increases payload size and does not provide native CSV/XLSX upload semantics.

## Scope

- Admin-only backend APIs; no frontend implementation in this task.
- CSV and XLSX, first worksheet for XLSX.
- Maximum 5,000 data rows and 10 MB file size.
- Required columns: `name`, `mobile`, `propertyName`, `source`.
- Optional columns: `email`, `manualSubSource`, `leadType`, `enquiryType`, `budget`, `requirement`, `message`, `externalLeadId`.
- Column names are case-insensitive and whitespace/underscore/hyphen variants are normalized.
- Existing `createLead()` remains the only lead creation path after confirmation.
- Duplicate detection uses the existing `(source, externalLeadId)` rule only; mobile/property similarity is not treated as a duplicate.

## API

- `POST /api/v1/admin/leads/imports` — multipart field `file`; parse and validate, returning an import ID and preview counts/errors.
- `GET /api/v1/admin/leads/imports/:id` — retrieve preview/status and row results.
- `POST /api/v1/admin/leads/imports/:id/confirm` — import valid pending rows; invalid rows remain reported and are not created.

The existing `/api/v1/admin/leads` route is unchanged.

## Persistence

Add `lead_imports` for the owner, original filename, format, status, counts, and timestamps. Add `lead_import_rows` for row number, normalized payload JSON, validation errors, row status, created lead ID, duplicate lead ID, and processing error. Unique `(import_id, row_number)` prevents duplicate staged rows.

Import processing locks the import and pending rows, marks the import processing, calls `createLead()` sequentially to preserve property round-robin order, and updates each row result. A second confirmation sees completed rows and does not create duplicate leads.

## Error behavior

Malformed file, unsupported extension/type, missing headers, and row-limit violations return validation errors without creating an import. Row-level invalid data is returned in the preview and does not block valid rows from being imported after confirmation. Provider/database errors are stored on the row and surfaced in the import summary without deleting successful rows.

## Security and compatibility

Routes inherit Admin authentication from `adminRouter`. File content is not logged. Parsed values are validated with the existing lead schema. Existing webhook, manual lead, assignment, history, and notification behavior is not changed. No teams or new assignment logic are introduced.
