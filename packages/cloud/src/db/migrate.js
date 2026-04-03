import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, testConnection } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function migrate() {
  const connected = await testConnection();
  if (!connected) {
    console.error("[MIGRATE] Cannot connect to database. Set DATABASE_URL in .env");
    process.exit(1);
  }

  // Ensure schema_migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get applied migrations
  const { rows } = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  const applied = new Set(rows.map((r) => r.version));

  // Read migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (applied.has(version)) {
      console.log(`[MIGRATE] Skipping ${file} (already applied)`);
      continue;
    }

    console.log(`[MIGRATE] Applying ${file}...`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");

    try {
      await pool.query("BEGIN");
      await pool.query(sql);
      await pool.query(
        "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
        [version, file]
      );
      await pool.query("COMMIT");
      console.log(`[MIGRATE] Applied ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`[MIGRATE] Failed on ${file}:`, err.message);
      process.exit(1);
    }
  }

  console.log("[MIGRATE] All migrations applied.");
  await pool.end();
}

migrate();
