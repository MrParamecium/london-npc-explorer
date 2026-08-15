import {
  ensureCurrentAppUser,
  getAuthenticatedUserId,
} from "@/lib/auth/current-app-user";
import {
  createChatHandler,
  createChatHistoryHandler,
} from "@/lib/ai/chat-handler";
import { createMoonshotDialogueProvider } from "@/lib/ai/moonshot-provider";
import { createDatabase } from "@/lib/db/client";
import {
  ensureDialogueForOwner,
  listDialogueMessages,
  persistDialogueExchange,
} from "@/lib/db/queries/dialogues";
import { InMemoryRequestThrottle } from "@/lib/observability/request-throttle";

export const dynamic = "force-dynamic";

const throttle = new InMemoryRequestThrottle({
  clientLimit: 20,
  globalLimit: 200,
  windowMs: 60_000,
});

const dialogueDependencies = {
  getAuthenticatedUserId,
  ensureUser: ensureCurrentAppUser,
  ensureDialogue: (ownerId: string, npcId: string) =>
    ensureDialogueForOwner(createDatabase(), ownerId, npcId),
  listMessages: (conversationId: string, limit: number) =>
    listDialogueMessages(createDatabase(), conversationId, limit),
};

export const GET = createChatHistoryHandler(dialogueDependencies);

export const POST = createChatHandler({
  ...dialogueDependencies,
  persistExchange: (input) => persistDialogueExchange(createDatabase(), input),
  getProvider: createMoonshotDialogueProvider,
  throttle,
});
