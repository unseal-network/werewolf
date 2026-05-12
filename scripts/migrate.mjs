import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationsDir = path.join(root, "packages/db/drizzle");
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/werewolf";
const dbRequire = createRequire(path.join(root, "packages/db/package.json"));
const { default: postgres } = await import(dbRequire.resolve("postgres"));

const sql = postgres(databaseUrl, {
  max: 1,
  onnotice: () => {},
});

async function migrationAlreadyApplied(id) {
  const rows = await sql`
    select 1
    from werewolf_migrations
    where id = ${id}
    limit 1
  `;
  return rows.length > 0;
}

async function markApplied(id) {
  await sql`
    insert into werewolf_migrations (id)
    values (${id})
    on conflict (id) do nothing
  `;
}

async function baselineInitialMigrationIfNeeded(id) {
  if (!id.startsWith("0000_")) return false;
  const rows = await sql`select to_regclass('public.game_rooms') as table_name`;
  if (!rows[0]?.table_name) return false;
  await markApplied(id);
  console.log(`[migrate] Baseline existing schema for ${id}`);
  return true;
}

async function main() {
  await sql`
    create table if not exists werewolf_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const id = path.basename(file, ".sql");
    if (await migrationAlreadyApplied(id)) {
      console.log(`[migrate] Skip already applied ${id}`);
      continue;
    }

    if (await baselineInitialMigrationIfNeeded(id)) {
      continue;
    }

    const body = await readFile(path.join(migrationsDir, file), "utf8");
    const statements = body
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
      await tx`
        insert into werewolf_migrations (id)
        values (${id})
      `;
    });
    console.log(`[migrate] Applied ${id}`);
  }
}

try {
  await main();
} finally {
  await sql.end({ timeout: 5 });
}
