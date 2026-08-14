import { describe, expect, it, vi } from "vitest";

import {
  DialogueProviderError,
  type DialogueCompletionInput,
} from "./dialogue-provider";
import { MoonshotDialogueProvider } from "./moonshot-provider";

const input: DialogueCompletionInput = {
  systemPrompt: "Stay in character as Maya.",
  messages: [
    { role: "user", content: "Is the train always this late?" },
    { role: "assistant", content: "Only when I have somewhere to be." },
    { role: "user", content: "Where are you heading?" },
  ],
};

describe("Moonshot dialogue provider", () => {
  it("sends the structured Kimi request and maps usage metadata", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      Response.json({
        id: "chatcmpl_fake",
        model: "kimi-k3",
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                speech: "To Dalston, if the boards are telling the truth.",
                action: "She glances up at the departure board.",
                emotion: "wryly_impatient",
                memory_update: null,
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 410,
          completion_tokens: 51,
          total_tokens: 461,
          cached_tokens: 0,
        },
      }),
    );
    const provider = new MoonshotDialogueProvider({
      apiKey: "fake-moonshot-key",
      model: "kimi-k3",
      fetch: fetchImplementation,
    });

    const result = await provider.complete(input);

    expect(result.provider).toBe("moonshot");
    expect(result.usage).toEqual({
      promptTokens: 410,
      completionTokens: 51,
      totalTokens: 461,
      costUsd: null,
    });
    const [, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.messages).toEqual([
      { role: "system", content: input.systemPrompt },
      ...input.messages,
    ]);
    expect(body.model).toBe("kimi-k3");
    expect(body.reasoning_effort).toBe("low");
    expect(body.temperature).toBe(1);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer fake-moonshot-key",
    );
  });

  it("classifies aborted requests as timeouts without exposing the cause", async () => {
    const fetchImplementation = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("secret upstream timeout", "AbortError"));
          });
        }),
    );
    const provider = new MoonshotDialogueProvider({
      apiKey: "fake-moonshot-key",
      model: "kimi-k3",
      fetch: fetchImplementation as typeof fetch,
      timeoutMs: 1,
    });

    await expect(provider.complete(input)).rejects.toMatchObject({
      code: "provider_timeout",
      message: "The dialogue provider timed out.",
    } satisfies Partial<DialogueProviderError>);
  });

  it("rejects malformed structured replies", async () => {
    const provider = new MoonshotDialogueProvider({
      apiKey: "fake-moonshot-key",
      model: "kimi-k3",
      fetch: vi.fn().mockResolvedValue(
        Response.json({
          model: "kimi-k3",
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: "not json" },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 2,
            total_tokens: 12,
          },
        }),
      ),
    });

    await expect(provider.complete(input)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
