import pg from "pg";

const { Pool } = pg;

/**
 * Database URL priority:
 * 1. SUPABASE_DB_URL — Supabase pooler connection string (for production)
 * 2. DATABASE_URL — direct PostgreSQL (local dev or self-hosted)
 */
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "postgresql://localhost:5432/swiftserve";

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: connectionString.includes("supabase") || connectionString.includes("ssl=true") ? true : false,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

/** Test database connection, returns true/false */
export async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("[DB] PostgreSQL connected");
    return true;
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    return false;
  }
}

/**
 * Helper: run a query with parameterized values.
 * Usage: const { rows } = await query("SELECT * FROM staff WHERE id = $1", [id]);
 */
export async function query(text, params) {
  return pool.query(text, params);
}

export default pool;
