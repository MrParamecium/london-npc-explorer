import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/config/env";

import * as schema from "./schema";

export function createDatabase(connectionString = env.databaseUrl) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required for database operations. Mock UI mode can run without it.",
    );
  }

  const sql = neon(connectionString);
  return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDatabase>;
