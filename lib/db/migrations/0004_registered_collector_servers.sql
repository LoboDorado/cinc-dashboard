-- Many-to-many: a Collector can cover multiple servers, and a server's data
-- could in principle reach more than one Collector. Admin-entered only, not
-- verified against what a Collector actually reports (see "Out of scope" in
-- the plan).
CREATE TABLE registered_collector_servers (
    collector_id uuid NOT NULL REFERENCES registered_collectors(id) ON DELETE CASCADE,
    server_id uuid NOT NULL REFERENCES registered_servers(id) ON DELETE CASCADE,
    PRIMARY KEY (collector_id, server_id)
);
