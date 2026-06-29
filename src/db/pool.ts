import pg from "pg";
import config from "../config.js";
import log from "../logger.js";

const CTX = "db/pool";

const pool = new pg.Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err: Error) => {
  log.error(CTX, "Unexpected pool error", err.message);
});

/**
 * Run a parameterized query against the pool.
 */
export async function query(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult> {
  const start = Date.now();
  const result = await pool.query(text, params);
  log.debug(CTX, `query (${Date.now() - start}ms): ${text.slice(0, 80)}`);
  return result;
}

/** Test that the pool can connect. Throws on failure. */
export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    log.info(CTX, "Database connection verified");
  } finally {
    client.release();
  }
}

/** Drain the pool (for graceful shutdown). */
export async function closePool(): Promise<void> {
  await pool.end();
  log.info(CTX, "Database pool closed");
}

export default pool;
