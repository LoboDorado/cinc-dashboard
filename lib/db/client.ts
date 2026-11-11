// Server-only Postgres pool for the dashboard's own admin-plane data (console
// accounts, registered servers/collectors, role grants, audit log). Separate
// from, and unrelated to, cinc-collector's SereneDB -- this app's database
// exists only to run the dashboard itself, never Cinc Server/Collector data.
import "server-only";
import { Pool } from "pg";
import { getConfig } from "../config";

let pool: Pool | null = null;

/** The shared connection pool, created lazily from CINC_DASHBOARD_DATABASE_URL. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getConfig().dashboardDatabaseUrl });
  }
  return pool;
}

/** Test-only: drop the memoized pool so a new connection string takes effect. */
export function resetPool(): void {
  pool = null;
}
