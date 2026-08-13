import { describe, expect, it, vi } from "vitest";

import type { ProfileNpcRecord } from "@/lib/db/queries/profile-npcs";

import { createChatHandler } from "./chat-handler";
import {
  DialogueProviderError,
  type DialogueProvider,
} from "./dialogue-provider";

const npcId = "44444444-4444-4444-8444-444444444444";
const npc = {
  id: npcId,
  ownerId: "user_2dialogueOwner",
  canonicalProfile: {
    schemaVersion: 2,
    identity: { fictionalName: "Maya Shah", age: 33 },
    character: { speechStyle: "warm and direct" },
  },
  currentState: { mood: "restless", currentTask: "waiting for a train" },
  narrative: "Maya works at a neighbourhood library.",
} as unknown as ProfileNpcRecord;

const context = { params: Promise.resolve({ npcId }) };
const messages = [
  { role: "user" as const, content: "Morning. Are you waiting long?" },
  {
    role: "assistant" as const,
    content: "Long enough to regret leaving early.",
  },
  { role: "user" as const, content: "Where are you headed?" },
];

function request(body: unknown = { messages }) {
  return new Request(`http://localhost/api/chat/${npcId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createDependencies(provider: DialogueProvider) {
  return {
    getAuthenticatedUserId: vi.fn().mockResolvedValue("user_2dialogueOwner"),
    ensureUser: vi.fn().mockResolvedValue("user_2dialogueOwner"),
    getNpc: vi.fn().mockResolvedValue(npc),
    getProvider: () => provider,
    throttle: { check: vi.fn().mockReturnValue({ allowed: true }) },
  };
}

describe("chat handler", () => {
  it("authenticates, owner-scopes the NPC, and passes the full history", async () => {
    const complete = vi.fn().mockResolvedValue({
      reply: {
        speech: "Dalston, assuming the train eventually agrees.",
        action: "She adjusts the strap of her bag.",
        emotion: "dryly_amused",
        memory_update: null,
      },
      provider: "fake",
      model: "fake-dialogue-model",
      usage: {
        promptTokens: 300,
        completionTokens: 42,
        totalTokens: 342,
        costUsd: 0.0001,
      },
    });
    const dependencies = createDependencies({ complete });
    const handler = createChatHandler(dependencies);

    const response = await handler(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(dependencies.getNpc).toHaveBeenCalledWith(
      "user_2dialogueOwner",
      npcId,
    );
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        systemPrompt: expect.stringContaining("Maya Shah"),
      }),
    );
    expect(await response.json()).toMatchObject({
      metadata: {
        provider: "fake",
        model: "fake-dialogue-model",
        usage: { totalTokens: 342, costUsd: 0.0001 },
      },
    });
  });

  it("returns 401 before reading the NPC when signed out", async () => {
    const dependencies = createDependencies({ complete: vi.fn() });
    dependencies.getAuthenticatedUserId.mockResolvedValue(null);
    const response = await createChatHandler(dependencies)(request(), context);

    expect(response.status).toBe(401);
    expect(dependencies.getNpc).not.toHaveBeenCalled();
  });

  it("rate limits an authenticated user before invoking paid dependencies", async () => {
    const complete = vi.fn();
    const dependencies = createDependencies({ complete });
    dependencies.throttle.check.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 45,
    });

    const response = await createChatHandler(dependencies)(request(), context);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(dependencies.getNpc).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns the same 404 for another owner's or missing NPC", async () => {
    const dependencies = createDependencies({ complete: vi.fn() });
    dependencies.getNpc.mockResolvedValue(null);
    const response = await createChatHandler(dependencies)(request(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "NPC not found.", retryable: false },
    });
  });

  it("rejects malformed histories before invoking the provider", async () => {
    const complete = vi.fn();
    const dependencies = createDependencies({ complete });
    const response = await createChatHandler(dependencies)(
      request({ messages: [{ role: "assistant", content: "Hello." }] }),
      context,
    );

    expect(response.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns a sanitized timeout without upstream details", async () => {
    const provider: DialogueProvider = {
      complete: vi
        .fn()
        .mockRejectedValue(new DialogueProviderError("provider_timeout")),
    };
    const response = await createChatHandler(createDependencies(provider))(
      request(),
      context,
    );

    expect(response.status).toBe(504);
    const body = await response.text();
    expect(body).toContain("The NPC took too long to respond. Try again.");
    expect(body).not.toContain("OpenRouter");
  });
});
