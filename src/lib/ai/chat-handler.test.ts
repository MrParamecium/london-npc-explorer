import { describe, expect, it, vi } from "vitest";

import type { ProfileNpcRecord } from "@/lib/db/queries/profile-npcs";
import type {
  DialogueContext,
  DialogueMessageRecord,
} from "@/lib/db/queries/dialogues";

import { createChatHandler, createChatHistoryHandler } from "./chat-handler";
import {
  DialogueProviderError,
  type DialogueProvider,
} from "./dialogue-provider";

const npcId = "44444444-4444-4444-8444-444444444444";
const conversationId = "55555555-5555-4555-8555-555555555555";
const memoryId = "66666666-6666-4666-8666-666666666666";
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
const dialogue = {
  npc,
  conversation: {
    id: conversationId,
    ownerId: "user_2dialogueOwner",
    npcId,
    createdAt: new Date("2026-08-15T01:00:00.000Z"),
    updatedAt: new Date("2026-08-15T01:00:00.000Z"),
  },
  memory: {
    id: memoryId,
    npcId,
    conversationId,
    version: 2,
    summary: "The user usually takes the early train.",
    facts: [],
    isCurrent: true,
    createdAt: new Date("2026-08-15T01:00:00.000Z"),
  },
} satisfies DialogueContext;
const savedMessages = [
  {
    id: "77777777-7777-4777-8777-777777777777",
    conversationId,
    sequence: 1,
    role: "user",
    content: "Morning. Are you waiting long?",
    action: null,
    emotion: null,
    memoryUpdate: null,
    providerMetadata: null,
    createdAt: new Date("2026-08-15T01:01:00.000Z"),
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    conversationId,
    sequence: 2,
    role: "npc",
    content: "Long enough to regret leaving early.",
    action: "Maya adjusts the strap of her bag.",
    emotion: "dryly_amused",
    memoryUpdate: null,
    providerMetadata: null,
    createdAt: new Date("2026-08-15T01:01:01.000Z"),
  },
] satisfies DialogueMessageRecord[];

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
    ensureDialogue: vi.fn().mockResolvedValue(dialogue),
    listMessages: vi.fn().mockResolvedValue(savedMessages),
    persistExchange: vi.fn().mockResolvedValue({
      userMessageId: "99999999-9999-4999-8999-999999999999",
      npcMessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
    getProvider: () => provider,
    throttle: { check: vi.fn().mockReturnValue({ allowed: true }) },
  };
}

describe("chat handler", () => {
  it("uses canonical saved history and atomically persists the new exchange", async () => {
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
    expect(dependencies.ensureDialogue).toHaveBeenCalledWith(
      "user_2dialogueOwner",
      npcId,
    );
    expect(dependencies.listMessages).toHaveBeenCalledWith(conversationId, 39);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: savedMessages[0].content },
          { role: "assistant", content: savedMessages[1].content },
          { role: "user", content: "Where are you headed?" },
        ],
        systemPrompt: expect.stringContaining(
          "The user usually takes the early train.",
        ),
      }),
    );
    expect(dependencies.persistExchange).toHaveBeenCalledWith({
      ownerId: "user_2dialogueOwner",
      npcId,
      conversationId,
      currentMemory: {
        id: memoryId,
        version: 2,
        summary: "The user usually takes the early train.",
        facts: [],
      },
      userContent: "Where are you headed?",
      reply: expect.objectContaining({
        speech: "Dalston, assuming the train eventually agrees.",
      }),
      providerMetadata: expect.objectContaining({
        provider: "fake",
        model: "fake-dialogue-model",
        usage: expect.objectContaining({ totalTokens: 342 }),
      }),
    });
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
    expect(dependencies.ensureDialogue).not.toHaveBeenCalled();
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
    expect(dependencies.ensureDialogue).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns the same 404 for another owner's or missing NPC", async () => {
    const dependencies = createDependencies({ complete: vi.fn() });
    dependencies.ensureDialogue.mockResolvedValue(null);
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
    const dependencies = createDependencies(provider);
    const response = await createChatHandler(dependencies)(request(), context);

    expect(response.status).toBe(504);
    const body = await response.text();
    expect(body).toContain("The NPC took too long to respond. Try again.");
    expect(body).not.toContain("OpenRouter");
    expect(dependencies.persistExchange).not.toHaveBeenCalled();
  });

  it("returns a safe retryable error when the completed exchange cannot be saved", async () => {
    const complete = vi.fn().mockResolvedValue({
      reply: {
        speech: "The train should be here soon.",
        action: "Maya checks the platform display.",
        emotion: "patient",
        memory_update: null,
      },
      provider: "fake",
      model: "fake-dialogue-model",
      usage: {
        promptTokens: 300,
        completionTokens: 42,
        totalTokens: 342,
        costUsd: null,
      },
    });
    const dependencies = createDependencies({ complete });
    dependencies.persistExchange.mockRejectedValue(new Error("private SQL"));

    const response = await createChatHandler(dependencies)(request(), context);

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private SQL");
  });
});

describe("chat history handler", () => {
  it("returns the owner-scoped saved transcript with no-store caching", async () => {
    const dependencies = createDependencies({ complete: vi.fn() });
    const response = await createChatHistoryHandler(dependencies)(
      new Request(`http://localhost/api/chat/${npcId}`),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(dependencies.listMessages).toHaveBeenCalledWith(conversationId, 40);
    expect(await response.json()).toEqual({
      messages: [
        {
          id: savedMessages[0].id,
          role: "user",
          content: savedMessages[0].content,
        },
        {
          id: savedMessages[1].id,
          role: "assistant",
          content: savedMessages[1].content,
          action: savedMessages[1].action,
          emotion: savedMessages[1].emotion,
        },
      ],
    });
  });
});
