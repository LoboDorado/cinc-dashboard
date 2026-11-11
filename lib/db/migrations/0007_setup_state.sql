-- Single-row table backing the first-run setup token: `id` is always `true`,
-- so a second INSERT without deleting the first violates the primary key --
-- the standard Postgres singleton-table idiom. Only the token's hash is
-- stored; the raw token is printed to stdout/logs once by
-- ensureSetupToken() and never persisted.
CREATE TABLE setup_state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    token_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz
);
