-- Up Migration
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'PRE_CONNECT';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'NOT_CONNECTED';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'HOLD';

-- Down Migration
-- PostgreSQL enum values are intentionally retained; removing values is unsafe for existing data.
