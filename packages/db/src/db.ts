import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
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

/**
 * 确保数据库存在并运行所有 pending migrations。
 * 在应用启动时调用一次即可。
 *
 * 流程：
 * 1. 直接连接目标库，尝试运行 migrations（已存在时直接成功）
 * 2. 若失败原因是"数据库不存在"，则尝试通过 postgres 管理库创建
 * 3. 创建后重新运行 migrations
 * 4. 若权限不足无法创建，抛出带操作指引的明确错误
 */
export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");

  if (!dbName) {
    throw new Error(`Invalid DATABASE_URL: no database name found in "${databaseUrl}"`);
  }

  const migrationsFolder = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../drizzle"
  );

  const runMigrations = async () => {
    const migrationSql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    try {
      const db = drizzle(migrationSql, { schema });
      await migrate(db, {
        migrationsFolder,
        migrationsSchema: "public",
        migrationsTable: "__drizzle_migrations",
      });
      console.log(`[db] Migrations applied to "${dbName}"`);
    } finally {
      await migrationSql.end();
    }
  };

  // ── Step 1: 直接尝试连接目标库并 migrate ─────────────────────────────
  try {
    await runMigrations();
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 仅在"数据库不存在"时进入创建流程，其他错误直接抛出
    if (!msg.includes("does not exist") && !msg.includes("database") ) {
      throw err;
    }
    // 继续往下走创建流程
  }

  // ── Step 2: 目标库不存在，尝试通过管理库创建 ─────────────────────────
  if (!/^[\w-]+$/.test(dbName)) {
    throw new Error(`Unsafe database name: "${dbName}"`);
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const adminSql = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`[db] Created database "${dbName}"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("permission denied") || msg.includes("already exists")) {
      // already exists：并发启动时另一进程已创建，忽略
      if (!msg.includes("already exists")) {
        throw new Error(
          `[db] Cannot create database "${dbName}": permission denied.\n` +
          `Please run the following SQL as a superuser:\n` +
          `  CREATE DATABASE "${dbName}";\n` +
          `  GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO <your_user>;`
        );
      }
    } else {
      throw err;
    }
  } finally {
    await adminSql.end();
  }

  // ── Step 3: 创建成功后重新运行 migrations ────────────────────────────
  await runMigrations();
}
