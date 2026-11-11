-- A Cinc Collector instance. `bearer_token_encrypted` holds an AES-256-GCM
-- blob (see lib/db/secretbox.ts). Not yet queried by the dashboard -- this is
-- storage/registration only until the Collector integration (tracked
-- separately) lands.
CREATE TABLE registered_collectors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    base_url text NOT NULL,
    bearer_token_encrypted bytea NOT NULL,
    ca_cert text,
    tls_no_verify boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
