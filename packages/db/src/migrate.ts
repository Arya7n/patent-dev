import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { postgresOptions } from "./client";

function migrationUrl(): string {
  // Neon migrations need the direct endpoint. The pooled URL is for the API and worker.
  const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_DATABASE_URL;
  if (direct && !direct.includes("localhost") && !direct.includes("127.0.0.1")) return direct;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return databaseUrl;
}

async function main() {
  const databaseUrl = migrationUrl();
  const sql = postgres(databaseUrl, postgresOptions(databaseUrl, 1));
  await sql`create table if not exists schema_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )`;
  const dir = path.join(__dirname, "..", "drizzle");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await sql<{ id: string }[]>`select id from schema_migrations where id = ${file}`;
    if (applied.length > 0) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    const statements = body
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    await sql`insert into schema_migrations (id) values (${file})`;
    console.log(`applied ${file}`);
  }
  await sql.end();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "migration failed";
  console.error(message);
  process.exit(1);
});
