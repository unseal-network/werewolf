import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DbClient = PostgresJsDatabase<typeof schema>;

/**
 * Create a Drizzle client backed by the `postgres` driver. The caller owns
 * the underlying connection pool lifetime — call `await sql.end()` when
 * shutting down. For long-lived processes the default settings are fine.
 */
export function createDbClient(databaseUrl: string): {
  db: DbClient;
  sql: ReturnType<typeof postgres>;
} {
  const sql = postgres(databaseUrl, {
    // Keep the pool small — most game-room writes are short-lived upserts.
    max: 10,
    idle_timeout: 30,
    // Surface real errors instead of silently swallowing them.
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
