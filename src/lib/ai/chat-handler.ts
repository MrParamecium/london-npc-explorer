import { UNAUTHORIZED_ERROR_RESPONSE } from "@/lib/auth/contracts";
import { EntityIdSchema } from "@/lib/domain/primitives";
import type { ProfileNpcRecord } from "@/lib/db/queries/profile-npcs";
import type { RequestThrottle } from "@/lib/observability/request-throttle";

import { ChatRequestSchema, ChatResponseSchema } from "./contracts";
import {
  DialogueProviderError,
  type DialogueProvider,
} from "./dialogue-provider";
import { buildNpcDialogueSystemPrompt } from "./system-prompt";

const MAX_REQUEST_BYTES = 64 * 1024;

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

export function createChatHandler(dependencies: {
  getAuthenticatedUserId: () => Promise<string | null>;
  ensureUser: (userId: string) => Promise<string>;
  getNpc: (ownerId: string, npcId: string) => Promise<ProfileNpcRecord | null>;
  getProvider: () => DialogueProvider;
  throttle: RequestThrottle;
}) {
  return async function chatHandler(
    request: Request,
    context: { params: Promise<{ npcId: string }> },
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

    let npc: ProfileNpcRecord | null;
    try {
      const ownerId = await dependencies.ensureUser(userId);
      npc = await dependencies.getNpc(ownerId, npcId);
    } catch {
      return apiError(
        503,
        "internal_error",
        "Dialogue is temporarily unavailable.",
        true,
      );
    }

    if (!npc) {
      return apiError(404, "not_found", "NPC not found.", false);
    }

    try {
      const completion = await dependencies.getProvider().complete({
        systemPrompt: buildNpcDialogueSystemPrompt(npc),
        messages: parsedRequest.data.messages,
      });
      const response = ChatResponseSchema.parse({
        reply: completion.reply,
        metadata: {
          provider: completion.provider,
          model: completion.model,
          usage: completion.usage,
        },
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
