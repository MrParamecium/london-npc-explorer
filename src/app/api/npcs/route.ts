import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import { createDatabase } from "@/lib/db/client";
import { listProfileNpcsForOwner } from "@/lib/db/queries/profile-npcs";
import { createProfileHistoryHandler } from "@/lib/generation/profile-history-handler";

export const dynamic = "force-dynamic";

export const GET = createProfileHistoryHandler({
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
  list: (input) => listProfileNpcsForOwner(createDatabase(), input),
});
