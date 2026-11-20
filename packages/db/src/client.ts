import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export function postgresOptions(databaseUrl: string, max: number): postgres.Options<Record<string, never>> {
  const hostname = databaseHostname(databaseUrl);
  const neonHost = hostname.endsWith(".neon.tech");
  return {
    max,
    // Neon's pooled endpoint is PgBouncer. Prepared statements are not safe there.
    prepare: !hostname.includes("-pooler"),
    ssl: neonHost ? "require" : undefined,
  };
}

function databaseHostname(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    const at = databaseUrl.lastIndexOf("@");
    if (at < 0) return "";
    return databaseUrl.slice(at + 1).split("/")[0]?.split("?")[0] ?? "";
  }
}

export function createDb(databaseUrl: string): { db: Database; sql: postgres.Sql } {
  const sql = postgres(databaseUrl, postgresOptions(databaseUrl, 10));
  const db = drizzle(sql, { schema });
  return { db, sql };
}
