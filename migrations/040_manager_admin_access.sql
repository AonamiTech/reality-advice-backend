-- A manager can additionally be granted organisation-wide Admin access without
-- losing the MANAGER role, manager scope, or manager portal.
ALTER TABLE users
  ADD COLUMN admin_access boolean NOT NULL DEFAULT false;

CREATE INDEX users_admin_access_idx
  ON users (admin_access)
  WHERE admin_access = true AND deleted_at IS NULL;
