import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import { createDatabase } from "@/lib/db/client";
import { getProfileNpcForOwner } from "@/lib/db/queries/profile-npcs";
import { createProfileDetailHandler } from "@/lib/generation/profile-detail-handler";

export const dynamic = "force-dynamic";

export const GET = createProfileDetailHandler({
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
  get: (ownerId, npcId) =>
    getProfileNpcForOwner(createDatabase(), ownerId, npcId),
});
