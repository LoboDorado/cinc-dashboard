// Applies every not-yet-run migration in lib/db/migrations/ to the dashboard's
// own Postgres database, in filename order, each in its own transaction.
// Forward-only: there are no "down" migrations.
//
// Uses the SAME env as the app: CINC_DASHBOARD_DATABASE_URL
//
//   node scripts/migrate.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../lib/db/migrations");

const connectionString = process.env.CINC_DASHBOARD_DATABASE_URL;
if (!connectionString) {
  console.error("usage: CINC_DASHBOARD_DATABASE_URL=… node scripts/migrate.mjs");
  process.exit(2);
}

const pool = new Pool({ connectionString });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ranCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
      ranCount++;
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${e.message}`, { cause: e });
    } finally {
      client.release();
    }
  }

  console.log(ranCount === 0 ? "database already up to date" : `applied ${ranCount} migration(s)`);
} finally {
  await pool.end();
}
