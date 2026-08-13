import "server-only";

import { z } from "zod";

import { AgentReplySchema } from "@/lib/agent/contracts";
import { env } from "@/lib/config/env";

import {
  DialogueProviderError,
  type DialogueCompletion,
  type DialogueCompletionInput,
  type DialogueProvider,
} from "./dialogue-provider";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 25_000;

const OpenRouterResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().trim().min(1),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string(),
        }),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    cost: z.number().finite().nonnegative().optional(),
  }),
});

const AGENT_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    speech: { type: "string", minLength: 1, maxLength: 2_000 },
    action: { type: "string", minLength: 1, maxLength: 1_000 },
    emotion: {
      type: "string",
      pattern: "^[a-z]+(?:_[a-z]+)*$",
      maxLength: 80,
    },
    memory_update: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 1_000 },
        { type: "null" },
      ],
    },
  },
  required: ["speech", "action", "emotion", "memory_update"],
} as const;

type OpenRouterProviderOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  endpoint?: string;
};

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isTimeoutStatus(status: number) {
  return status === 408 || status === 504;
}

export class OpenRouterDialogueProvider implements DialogueProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private readonly endpoint: string;

  constructor(options: OpenRouterProviderOptions) {
    this.apiKey = z.string().trim().min(1).parse(options.apiKey);
    this.model = z.string().trim().min(1).max(160).parse(options.model);
    this.fetchImplementation = options.fetch ?? fetch;
    this.timeoutMs = z
      .number()
      .int()
      .positive()
      .max(120_000)
      .parse(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.endpoint = z
      .string()
      .url()
      .parse(options.endpoint ?? OPENROUTER_CHAT_COMPLETIONS_URL);
  }

  async complete(input: DialogueCompletionInput): Promise<DialogueCompletion> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: input.systemPrompt },
            ...input.messages,
          ],
          max_completion_tokens: 700,
          temperature: 0.7,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "npc_dialogue_reply",
              strict: true,
              schema: AGENT_REPLY_JSON_SCHEMA,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new DialogueProviderError(
          isTimeoutStatus(response.status)
            ? "provider_timeout"
            : "provider_unavailable",
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }

      const parsedResponse = OpenRouterResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsedResponse.success) {
        throw new DialogueProviderError("invalid_response");
      }

      const choice = parsedResponse.data.choices[0];
      if (!choice || choice.finish_reason === "error") {
        throw new DialogueProviderError("provider_unavailable");
      }

      let replyPayload: unknown;
      try {
        replyPayload = JSON.parse(choice.message.content);
      } catch {
        throw new DialogueProviderError("invalid_response");
      }

      const reply = AgentReplySchema.safeParse(replyPayload);
      if (!reply.success) {
        throw new DialogueProviderError("invalid_response");
      }

      const usage = parsedResponse.data.usage;
      return {
        reply: reply.data,
        provider: "openrouter",
        model: parsedResponse.data.model,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          costUsd: usage.cost ?? null,
        },
      };
    } catch (error) {
      if (error instanceof DialogueProviderError) throw error;
      if (isAbortError(error) || controller.signal.aborted) {
        throw new DialogueProviderError("provider_timeout");
      }
      throw new DialogueProviderError("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createOpenRouterDialogueProvider() {
  if (!env.openRouterApiKey) {
    throw new DialogueProviderError("provider_unavailable", false);
  }

  return new OpenRouterDialogueProvider({
    apiKey: env.openRouterApiKey,
    model: env.openRouterModel,
  });
}
