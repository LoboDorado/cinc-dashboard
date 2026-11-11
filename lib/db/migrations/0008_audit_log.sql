-- `actor_username`/`server_name` are denormalized snapshots so attribution
-- survives account/server deletion (ON DELETE SET NULL on the FKs below).
-- `action` covers object-level calls (HTTP method), grant lifecycle
-- (role_grant.create/revoke), collector linkage changes
-- (collector_server_link.create/revoke), and break-glass recovery
-- (dashboard_account.break_glass_reset).
CREATE TABLE audit_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    actor_account_id uuid REFERENCES dashboard_accounts(id) ON DELETE SET NULL,
    actor_username text NOT NULL,
    server_id uuid REFERENCES registered_servers(id) ON DELETE SET NULL,
    server_name text,
    org text,
    action text NOT NULL,
    resource_path text,
    outcome text NOT NULL,
    status_code integer,
    request_id text
);

CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_account_id);
CREATE INDEX audit_log_server_idx ON audit_log (server_id);
