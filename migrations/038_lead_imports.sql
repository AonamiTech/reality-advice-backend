-- Up Migration
CREATE TABLE lead_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  filename text NOT NULL,
  format text NOT NULL CHECK (format IN ('CSV', 'XLSX')),
  status text NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')),
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  valid_rows integer NOT NULL CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL CHECK (invalid_rows >= 0),
  processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  imported_rows integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  duplicate_rows integer NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
  failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX lead_imports_created_by_created_idx ON lead_imports (created_by, created_at DESC);

CREATE TABLE lead_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES lead_imports (id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number >= 2),
  payload jsonb NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('INVALID', 'PENDING', 'PROCESSING', 'IMPORTED', 'DUPLICATE', 'FAILED')),
  lead_id uuid REFERENCES leads (id) ON DELETE SET NULL,
  duplicate_lead_id uuid REFERENCES leads (id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, row_number)
);
CREATE INDEX lead_import_rows_import_status_idx ON lead_import_rows (import_id, status, row_number);

-- Down Migration
DROP TABLE IF EXISTS lead_import_rows;
DROP TABLE IF EXISTS lead_imports;
