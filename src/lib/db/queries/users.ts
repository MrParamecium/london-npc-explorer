import "server-only";

import { ClerkUserIdSchema } from "@/lib/domain/primitives";

import type { Database } from "../client";
import { appUsers } from "../schema";

export async function ensureAppUser(database: Database, ownerId: string) {
  const id = ClerkUserIdSchema.parse(ownerId);

  await database
    .insert(appUsers)
    .values({ id })
    .onConflictDoNothing({ target: appUsers.id });

  return id;
}
