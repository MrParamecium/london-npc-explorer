import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/config/env";

import * as schema from "./schema";

export function createNeonQuery(connectionString = env.databaseUrl) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required for database operations. Mock UI mode can run without it.",
    );
  }

  return neon(connectionString);
}

export function createDatabase(connectionString = env.databaseUrl) {
  const client = createNeonQuery(connectionString);
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDatabase>;
