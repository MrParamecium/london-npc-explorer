import { UNAUTHORIZED_ERROR_RESPONSE } from "@/lib/auth/contracts";
import {
  dialogueRecordsToProviderMessages,
  memoryRecordToPrompt,
  serializeDialogueRecords,
  type DialogueContext,
  type DialogueMessageRecord,
  type PersistDialogueExchangeInput,
} from "@/lib/db/queries/dialogues";
import { EntityIdSchema } from "@/lib/domain/primitives";
import type { RequestThrottle } from "@/lib/observability/request-throttle";

import {
  ChatRequestSchema,
  ChatResponseSchema,
  DialogueHistoryResponseSchema,
} from "./contracts";
import {
  DialogueProviderError,
  type DialogueProvider,
} from "./dialogue-provider";
import { buildNpcDialogueSystemPrompt } from "./system-prompt";

const MAX_REQUEST_BYTES = 64 * 1024;

type SharedDialogueDependencies = {
  getAuthenticatedUserId: () => Promise<string | null>;
  ensureUser: (userId: string) => Promise<string>;
  ensureDialogue: (
    ownerId: string,
    npcId: string,
  ) => Promise<DialogueContext | null>;
  listMessages: (
    conversationId: string,
    limit: number,
  ) => Promise<DialogueMessageRecord[]>;
};

type ChatDependencies = SharedDialogueDependencies & {
  persistExchange: (
    input: PersistDialogueExchangeInput,
  ) => Promise<{ userMessageId: string; npcMessageId: string }>;
  getProvider: () => DialogueProvider;
  throttle: RequestThrottle;
};

type ChatRouteContext = { params: Promise<{ npcId: string }> };

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function apiError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
) {
  return noStore({ error: { code, message, retryable } }, { status });
}

async function authenticatedDialogue(
  dependencies: SharedDialogueDependencies,
  context: ChatRouteContext,
) {
  const userId = await dependencies.getAuthenticatedUserId();
  if (!userId) {
    return {
      ok: false,
      response: noStore(UNAUTHORIZED_ERROR_RESPONSE, { status: 401 }),
    } as const;
  }

  const { npcId } = await context.params;
  if (!EntityIdSchema.safeParse(npcId).success) {
    return {
      ok: false,
      response: apiError(
        400,
        "invalid_request",
        "Enter a valid NPC identifier.",
        false,
      ),
    } as const;
  }

  try {
    const ownerId = await dependencies.ensureUser(userId);
    const dialogue = await dependencies.ensureDialogue(ownerId, npcId);
    if (!dialogue) {
      return {
        ok: false,
        response: apiError(404, "not_found", "NPC not found.", false),
      } as const;
    }
    return { ok: true, ownerId, npcId, dialogue } as const;
  } catch {
    return {
      ok: false,
      response: apiError(
        503,
        "internal_error",
        "Dialogue is temporarily unavailable.",
        true,
      ),
    } as const;
  }
}

export function createChatHistoryHandler(
  dependencies: SharedDialogueDependencies,
) {
  return async function chatHistoryHandler(
    _request: Request,
    context: ChatRouteContext,
  ) {
    const authenticated = await authenticatedDialogue(dependencies, context);
    if (!authenticated.ok) return authenticated.response;

    try {
      const records = await dependencies.listMessages(
        authenticated.dialogue.conversation.id,
        40,
      );
      const response = DialogueHistoryResponseSchema.parse({
        messages: serializeDialogueRecords(records),
      });
      return noStore(response);
    } catch {
      return apiError(
        503,
        "internal_error",
        "Dialogue history is temporarily unavailable.",
        true,
      );
    }
  };
}

export function createChatHandler(dependencies: ChatDependencies) {
  return async function chatHandler(
    request: Request,
    context: ChatRouteContext,
  ) {
    const userId = await dependencies.getAuthenticatedUserId();
    if (!userId) return noStore(UNAUTHORIZED_ERROR_RESPONSE, { status: 401 });

    const throttleDecision = dependencies.throttle.check(userId);
    if (!throttleDecision.allowed) {
      return noStore(
        {
          error: {
            code: "rate_limited",
            message: "Too many dialogue requests. Try again shortly.",
            retryable: true,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(throttleDecision.retryAfterSeconds),
          },
        },
      );
    }

    const { npcId } = await context.params;
    if (!EntityIdSchema.safeParse(npcId).success) {
      return apiError(
        400,
        "invalid_request",
        "Enter a valid NPC identifier.",
        false,
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return apiError(
        415,
        "unsupported_media_type",
        "Send the conversation as JSON.",
        false,
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return apiError(
        413,
        "request_too_large",
        "The conversation is too large.",
        false,
      );
    }

    let body: unknown;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return apiError(
          413,
          "request_too_large",
          "The conversation is too large.",
          false,
        );
      }
      body = JSON.parse(rawBody);
    } catch {
      return apiError(
        400,
        "invalid_request",
        "Send a valid conversation.",
        false,
      );
    }

    const parsedRequest = ChatRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return apiError(
        400,
        "invalid_request",
        "Send a valid conversation ending with a user message.",
        false,
      );
    }
    const userMessage = parsedRequest.data.messages.at(-1)!;

    let ownerId: string;
    let dialogue: DialogueContext;
    let savedMessages: DialogueMessageRecord[];
    try {
      ownerId = await dependencies.ensureUser(userId);
      const ownedDialogue = await dependencies.ensureDialogue(ownerId, npcId);
      if (!ownedDialogue) {
        return apiError(404, "not_found", "NPC not found.", false);
      }
      dialogue = ownedDialogue;
      savedMessages = await dependencies.listMessages(
        dialogue.conversation.id,
        39,
      );
    } catch {
      return apiError(
        503,
        "internal_error",
        "Dialogue is temporarily unavailable.",
        true,
      );
    }

    try {
      const completion = await dependencies.getProvider().complete({
        systemPrompt: buildNpcDialogueSystemPrompt(
          dialogue.npc,
          memoryRecordToPrompt(dialogue.memory),
        ),
        messages: [
          ...dialogueRecordsToProviderMessages(savedMessages),
          { role: "user", content: userMessage.content },
        ],
      });
      const response = ChatResponseSchema.parse({
        reply: completion.reply,
        metadata: {
          provider: completion.provider,
          model: completion.model,
          usage: completion.usage,
        },
      });
      await dependencies.persistExchange({
        ownerId,
        npcId,
        conversationId: dialogue.conversation.id,
        currentMemory: {
          id: dialogue.memory.id,
          version: dialogue.memory.version,
          summary: dialogue.memory.summary,
          facts: dialogue.memory.facts,
        },
        userContent: userMessage.content,
        reply: response.reply,
        providerMetadata: response.metadata,
      });
      return noStore(response);
    } catch (error) {
      if (error instanceof DialogueProviderError) {
        if (error.code === "provider_timeout") {
          return apiError(
            504,
            "provider_timeout",
            "The NPC took too long to respond. Try again.",
            true,
          );
        }

        return apiError(
          503,
          "provider_unavailable",
          "The NPC cannot respond right now.",
          error.retryable,
        );
      }

      return apiError(
        503,
        "internal_error",
        "Dialogue is temporarily unavailable.",
        true,
      );
    }
  };
}
