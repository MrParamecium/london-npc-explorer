import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import { createChatHandler } from "@/lib/ai/chat-handler";
import { createMoonshotDialogueProvider } from "@/lib/ai/moonshot-provider";
import { createDatabase } from "@/lib/db/client";
import { getProfileNpcForOwner } from "@/lib/db/queries/profile-npcs";
import { InMemoryRequestThrottle } from "@/lib/observability/request-throttle";

export const dynamic = "force-dynamic";

const throttle = new InMemoryRequestThrottle({
  clientLimit: 20,
  globalLimit: 200,
  windowMs: 60_000,
});

export const POST = createChatHandler({
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
  getNpc: (ownerId, npcId) =>
    getProfileNpcForOwner(createDatabase(), ownerId, npcId),
  getProvider: createMoonshotDialogueProvider,
  throttle,
});
