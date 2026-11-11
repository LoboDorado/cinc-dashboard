-- One row per (account, role, scope) grant -- an account can hold several at
-- once. `server_id`/`org` encode scope: both null = platform, server_id only =
-- server, both set = org. That consistency is enforced in the one grant-
-- creation path (lib/admin/grants.ts), not here, to keep the check in one
-- typed place instead of duplicated in SQL.
--
-- Note: Postgres treats NULL as distinct in a UNIQUE constraint, so this does
-- not stop the same platform-scope role being granted twice to one account
-- (server_id/org are both null on every such row) -- a harmless redundancy,
-- not a security gap, since authorization only checks for *any* matching
-- grant.
CREATE TABLE role_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_account_id uuid NOT NULL REFERENCES dashboard_accounts(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN (
        'platform_admin', 'platform_read_only',
        'server_admin', 'server_object_manager', 'server_viewer',
        'org_admin', 'org_object_manager', 'org_viewer'
    )),
    server_id uuid REFERENCES registered_servers(id) ON DELETE CASCADE,
    org text,
    granted_by uuid REFERENCES dashboard_accounts(id) ON DELETE SET NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (dashboard_account_id, role, server_id, org)
);

CREATE INDEX role_grants_account_idx ON role_grants (dashboard_account_id);
CREATE INDEX role_grants_server_idx ON role_grants (server_id);
