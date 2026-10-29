import { Pool, types, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// Return DATE columns as plain 'YYYY-MM-DD' strings. The default parser builds a JS Date
// at local midnight, which shifts calendar dates by a day in non-UTC timezones.
types.setTypeParser(1082, (v) => v);
// BIGINT ids comfortably fit in a JS number for this application.
types.setTypeParser(20, (v) => Number(v));
// NUMERIC stays a string (pg default) so money is never routed through floating point.

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalForDb.__pgPool = pool;
  }
  return globalForDb.__pgPool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
