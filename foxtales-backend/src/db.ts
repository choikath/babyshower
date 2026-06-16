import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { env } from "./env.js";

/**
 * A single pooled connection to Postgres. In production this is the Supabase
 * database connection string (use the connection *pooler* URL — port 6543 —
 * for serverless/short-lived containers).
 */
let poolSingleton: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (poolSingleton) return poolSingleton;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  poolSingleton = new pg.Pool({
    connectionString: env.DATABASE_URL,
    // Supabase requires TLS; allow self-signed in the pooler chain.
    ssl: env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
    max: 10,
  });
  return poolSingleton;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}
