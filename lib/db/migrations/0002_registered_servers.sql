-- A Cinc/Chef Infra Server the dashboard manages. `webui_key_encrypted` holds
-- an AES-256-GCM blob (see lib/db/secretbox.ts), never the raw PEM.
-- `impersonation_username` is the one shared, pre-provisioned admin-level
-- identity the dashboard signs every request to this server as -- see
-- CLAUDE.md's Security invariants once Phase 2/4 land for why.
CREATE TABLE registered_servers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    base_url text NOT NULL,
    ca_cert text,
    webui_key_encrypted bytea NOT NULL,
    impersonation_username text NOT NULL,
    tls_no_verify boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
