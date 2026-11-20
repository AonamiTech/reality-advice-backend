# Lead Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Admin-only staged CSV/XLSX lead upload with preview, row-level validation, idempotent confirmation, and reuse of the existing lead creation workflow.

**Architecture:** Parse files into normalized staged import rows, persist them in PostgreSQL, and process confirmed rows sequentially through `lead.service.createLead()`. Keep the existing lead routes and assignment engine unchanged.

**Tech Stack:** Existing Express 5, TypeScript, PostgreSQL/node-pg-migrate, Zod, Node test runner; add only compatible CSV/XLSX parsing and multipart dependencies if the repository has no existing equivalent.

**Spec:** `docs/lead-upload-design.md`

## Global Constraints

- Admin-only backend feature; do not modify the frontend.
- Required upload fields are `name`, `mobile`, `propertyName`, and `source`.
- Supported sources are the existing `99ACRES`, `MAGICBRICKS`, and `MANUAL` values.
- Reuse `lead.service.createLead()` for every confirmed row.
- Do not introduce team routing, a second assignment engine, or mobile/property duplicate heuristics.
- Maximum 5,000 data rows and 10 MB per upload.
- Do not log uploaded customer data or file contents.

## Review Focus

- CSV quoted commas/newlines and UTF-8 handling — parser and integration tests.
- XLSX formulas/blank rows and first-sheet selection — parser tests.
- Duplicate confirmation and repeated external lead IDs — idempotency integration test.
- Partial import failures — row status and summary integration test.
- Oversized/malformed files and unknown headers — upload validation tests.

### Task 1: Parser and row validation

**Files:**
- Create: `src/modules/lead-import/lead-import.parser.ts`
- Create: `src/modules/lead-import/lead-import.validation.ts`
- Test: `tests/lead-import-parser.test.ts`

**Interfaces:**
- Produces `parseLeadImportFile(file): ParsedLeadImport` with normalized headers, rows, format, and row validation errors.
- Consumes the existing `createLeadSchema` and lead/property enum definitions.

- [x] Write failing parser tests for CSV, XLSX, quoted values, normalized headers, missing headers, invalid rows, blank rows, and row limits.
- [x] Run the parser tests and verify they fail before implementation.
- [x] Implement bounded CSV/XLSX parsing and map each row to the existing lead input shape without inventing duplicate rules.
- [x] Run parser tests and verify they pass.

### Task 2: Import persistence and migration

**Files:**
- Create: `migrations/038_lead_imports.sql`
- Create: `src/modules/lead-import/lead-import.model.ts`
- Create: `src/modules/lead-import/lead-import.repository.ts`
- Test: `tests/lead-import-repository.test.ts`

**Interfaces:**
- Repository methods create an import, insert rows, load a preview, lock pending rows, and update row/import statuses.
- Tables expose durable row-level validation, duplicate, success, and failure results.

- [x] Write integration coverage for import/row creation, status updates, and durable preview retrieval.
- [x] Add the forward/down migration with foreign keys, indexes, JSONB payload/errors, and status checks.
- [x] Implement repository methods using parameterized SQL and existing transaction conventions.
- [x] Run migration/integration tests and verify they pass.

### Task 3: Admin import service and routes

**Files:**
- Create: `src/modules/lead-import/lead-import.service.ts`
- Create: `src/modules/lead-import/lead-import.controller.ts`
- Create: `src/modules/lead-import/lead-import.routes.ts`
- Modify: `src/modules/admin/admin.routes.ts`
- Test: `tests/lead-import.test.ts`

**Interfaces:**
- `POST /admin/leads/imports` returns `{ importId, status, summary, rows }`.
- `GET /admin/leads/imports/:id` returns the durable preview/status.
- `POST /admin/leads/imports/:id/confirm` processes valid pending rows and returns updated counts/results.

- [x] Write integration tests for Admin authorization, upload preview, invalid-row reporting, confirmation, and status retrieval.
- [x] Register the router under the existing Admin authentication boundary.
- [x] Implement service orchestration: parse, persist preview, confirm with row locking, call `createLead()` sequentially, and record duplicate/success/failure outcomes.
- [x] Run import integration tests and verify existing assignment/history behavior is preserved.

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Test: existing regression suite

- [x] Document supported columns, sample CSV, multipart request, preview/confirm flow, limits, error formats, and idempotency.
- [x] Run `npm run migrate:test`, focused import tests, `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check`.
- [x] Confirm no existing webhook, manual lead, assignment, round-robin, or history tests regress.

