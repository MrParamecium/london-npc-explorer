import "server-only";

import { auth } from "@clerk/nextjs/server";

import { createDatabase } from "@/lib/db/client";
import { ensureAppUser } from "@/lib/db/queries/users";

export async function getAuthenticatedUserId() {
  const { userId } = await auth();
  return userId;
}

export async function ensureCurrentAppUser(userId: string) {
  return ensureAppUser(createDatabase(), userId);
}
