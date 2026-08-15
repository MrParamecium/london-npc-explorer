import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { ids } from "../../../../tests/fixtures/domain";

import type { Database } from "../client";
import {
  DialoguePersistenceConflict,
  dialogueRecordsToProviderMessages,
  persistDialogueExchange,
  serializeDialogueRecords,
} from "./dialogues";

function renderSql(fragment: SQL) {
  return new PgDialect({ casing: "snake_case" }).sqlToQuery(fragment);
}

const conversationId = "55555555-5555-4555-8555-555555555555";
const memoryId = "66666666-6666-4666-8666-666666666666";

const exchange = {
  ownerId: ids.user,
  npcId: ids.npc,
  conversationId,
  currentMemory: {
    id: memoryId,
    version: 1,
    summary: "No durable facts about the user have been learned yet.",
    facts: [],
  },
  userContent: "I always take the early train.",
  reply: {
    speech: "Then we may have crossed paths before.",
    action: "Maya glances towards the platform clock.",
    emotion: "quietly_amused",
    memory_update: "The user usually takes the early train.",
  },
  providerMetadata: {
    provider: "moonshot",
    model: "kimi-k3",
    usage: {
      promptTokens: 320,
      completionTokens: 48,
      totalTokens: 368,
      costUsd: null,
    },
  },
};

describe("persistDialogueExchange", () => {
  it("stores both turns, provider usage, and a versioned memory atomically", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          user_message_id: "77777777-7777-4777-8777-777777777777",
          npc_message_id: "88888888-8888-4888-8888-888888888888",
        },
      ],
    });

    await expect(
      persistDialogueExchange({ execute } as unknown as Database, exchange),
    ).resolves.toEqual({
      userMessageId: "77777777-7777-4777-8777-777777777777",
      npcMessageId: "88888888-8888-4888-8888-888888888888",
    });

    const query = renderSql(execute.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain("FOR UPDATE");
    expect(query.sql).toContain("inserted_user_message");
    expect(query.sql).toContain("inserted_npc_message");
    expect(query.sql).toContain("provider_metadata");
    expect(query.sql).toContain("retired_memory");
    expect(query.sql).toContain("inserted_memory");
    expect(query.params).toContain(exchange.userContent);
    expect(query.params).toContain(exchange.reply.memory_update);
    expect(
      query.params.some(
        (value) =>
          typeof value === "string" && value.includes('"totalTokens":368'),
      ),
    ).toBe(true);
  });

  it("fails safely when the conversation cannot be locked", async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Database;

    await expect(
      persistDialogueExchange(database, exchange),
    ).rejects.toBeInstanceOf(DialoguePersistenceConflict);
  });
});

describe("dialogue record adapters", () => {
  const records = [
    {
      id: "77777777-7777-4777-8777-777777777777",
      conversationId,
      sequence: 1,
      role: "user" as const,
      content: "Good morning.",
      action: null,
      emotion: null,
      memoryUpdate: null,
      providerMetadata: null,
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      conversationId,
      sequence: 2,
      role: "npc" as const,
      content: "Morning.",
      action: "Maya nods.",
      emotion: "calm",
      memoryUpdate: null,
      providerMetadata: exchange.providerMetadata,
      createdAt: new Date("2026-08-15T00:00:01.000Z"),
    },
  ];

  it("maps database roles to provider roles", () => {
    expect(dialogueRecordsToProviderMessages(records)).toEqual([
      { role: "user", content: "Good morning." },
      { role: "assistant", content: "Morning." },
    ]);
  });

  it("serializes saved turns for the browser", () => {
    expect(serializeDialogueRecords(records)).toEqual([
      expect.objectContaining({ role: "user", content: "Good morning." }),
      expect.objectContaining({
        role: "assistant",
        content: "Morning.",
        action: "Maya nods.",
        emotion: "calm",
      }),
    ]);
  });
});
