-- Dashboard-owned login identities: local (password) or LDAP-linked. Decoupled
-- from any single registered Cinc Server's own user objects.
CREATE TABLE dashboard_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE,
    display_name text NOT NULL,
    auth_source text NOT NULL CHECK (auth_source IN ('local', 'ldap')),
    password_hash text,
    ldap_dn text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (auth_source = 'local' AND password_hash IS NOT NULL AND ldap_dn IS NULL)
        OR (auth_source = 'ldap' AND ldap_dn IS NOT NULL AND password_hash IS NULL)
    )
);
