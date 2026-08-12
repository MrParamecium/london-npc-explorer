import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import { createSyncCurrentUserHandler } from "@/lib/auth/sync-current-user-handler";

export const POST = createSyncCurrentUserHandler({
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
});
