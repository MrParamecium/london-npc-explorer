import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  AgentReplySchema,
  NpcMemorySchema,
  type NpcMemory,
} from "@/lib/agent/contracts";
import { DialogueUsageSchema } from "@/lib/ai/contracts";
import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";

import type { Database } from "../client";
import {
  conversations,
  generationJobs,
  messages,
  npcMemories,
  npcs,
} from "../schema";

export const INITIAL_NPC_MEMORY_SUMMARY =
  "No durable facts about the user have been learned yet.";

export type DialogueMessageRecord = typeof messages.$inferSelect;
export type DialogueContext = {
  npc: typeof npcs.$inferSelect;
  conversation: typeof conversations.$inferSelect;
  memory: typeof npcMemories.$inferSelect;
};

const PersistDialogueExchangeInputSchema = z
  .object({
    ownerId: ClerkUserIdSchema,
    npcId: EntityIdSchema,
    conversationId: EntityIdSchema,
    currentMemory: z
      .object({
        id: EntityIdSchema,
        version: NpcMemorySchema.shape.version,
        summary: NpcMemorySchema.shape.durableSummary,
        facts: NpcMemorySchema.shape.facts,
      })
      .strict(),
    userContent: z.string().trim().min(1).max(4_000),
    reply: AgentReplySchema,
    providerMetadata: z
      .object({
        provider: z.string().trim().min(1).max(80),
        model: z.string().trim().min(1).max(160),
        usage: DialogueUsageSchema,
      })
      .strict(),
  })
  .strict();

export type PersistDialogueExchangeInput = z.input<
  typeof PersistDialogueExchangeInputSchema
>;

const PersistedExchangeRowSchema = z
  .object({
    user_message_id: EntityIdSchema,
    npc_message_id: EntityIdSchema,
  })
  .strict();

export class DialoguePersistenceConflict extends Error {
  constructor() {
    super("The dialogue exchange could not be saved.");
    this.name = "DialoguePersistenceConflict";
  }
}

export async function ensureDialogueForOwner(
  database: Database,
  ownerId: string,
  npcId: string,
): Promise<DialogueContext | null> {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(npcId);
  const [ownedNpc] = await database
    .select({ npc: npcs })
    .from(npcs)
    .innerJoin(
      generationJobs,
      and(
        eq(generationJobs.resultNpcId, npcs.id),
        eq(generationJobs.status, "completed"),
        eq(generationJobs.mode, "full"),
      ),
    )
    .where(
      and(
        eq(npcs.id, id),
        eq(npcs.ownerId, owner),
        isNotNull(npcs.portraitUrl),
      ),
    )
    .limit(1);

  if (!ownedNpc) return null;

  await database
    .insert(conversations)
    .values({ ownerId: owner, npcId: id })
    .onConflictDoNothing({
      target: [conversations.ownerId, conversations.npcId],
    });

  const [conversation] = await database
    .select()
    .from(conversations)
    .where(and(eq(conversations.ownerId, owner), eq(conversations.npcId, id)))
    .limit(1);
  if (!conversation) throw new DialoguePersistenceConflict();

  await database
    .insert(npcMemories)
    .values({
      npcId: id,
      conversationId: conversation.id,
      version: 1,
      summary: INITIAL_NPC_MEMORY_SUMMARY,
      facts: [],
      isCurrent: true,
    })
    .onConflictDoNothing({
      target: [npcMemories.npcId, npcMemories.version],
    });

  const [memory] = await database
    .select()
    .from(npcMemories)
    .where(
      and(
        eq(npcMemories.npcId, id),
        eq(npcMemories.conversationId, conversation.id),
        eq(npcMemories.isCurrent, true),
      ),
    )
    .limit(1);
  if (!memory) throw new DialoguePersistenceConflict();

  return { npc: ownedNpc.npc, conversation, memory };
}

export async function listDialogueMessages(
  database: Database,
  conversationId: string,
  limit = 40,
) {
  const id = EntityIdSchema.parse(conversationId);
  const boundedLimit = Math.min(Math.max(limit, 1), 40);
  const rows = await database
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(desc(messages.sequence))
    .limit(boundedLimit);

  return rows.reverse();
}

function nextMemorySummary(current: string, update: string | null) {
  if (!update) return current;
  const base =
    current === INITIAL_NPC_MEMORY_SUMMARY ? "" : `${current.trim()}\n`;
  return `${base}${update.trim()}`.slice(-4_000);
}

export async function persistDialogueExchange(
  database: Database,
  input: PersistDialogueExchangeInput,
) {
  const exchange = PersistDialogueExchangeInputSchema.parse(input);
  const providerMetadata = JSON.stringify(exchange.providerMetadata);
  const facts = JSON.stringify(exchange.currentMemory.facts);
  const memoryUpdate = exchange.reply.memory_update;
  const memorySummary = nextMemorySummary(
    exchange.currentMemory.summary,
    memoryUpdate,
  );

  const result = await database.execute(sql`
    WITH locked_conversation AS (
      SELECT id, npc_id
      FROM ${conversations}
      WHERE id = ${exchange.conversationId}
        AND owner_id = ${exchange.ownerId}
        AND npc_id = ${exchange.npcId}
        AND (
          ${memoryUpdate}::text IS NULL
          OR EXISTS (
            SELECT 1
            FROM ${npcMemories}
            WHERE id = ${exchange.currentMemory.id}
              AND npc_id = ${exchange.npcId}
              AND conversation_id = ${exchange.conversationId}
              AND version = ${exchange.currentMemory.version}
              AND is_current = true
          )
        )
      FOR UPDATE
    ), next_sequence AS (
      SELECT COALESCE(MAX(${messages.sequence}), 0) AS value
      FROM ${messages}
      INNER JOIN locked_conversation
        ON ${messages.conversationId} = locked_conversation.id
    ), inserted_user_message AS (
      INSERT INTO ${messages} (
        id, conversation_id, sequence, role, content
      )
      SELECT
        gen_random_uuid(), locked_conversation.id,
        next_sequence.value + 1, 'user', ${exchange.userContent}
      FROM locked_conversation, next_sequence
      RETURNING id
    ), inserted_npc_message AS (
      INSERT INTO ${messages} (
        id, conversation_id, sequence, role, content,
        action, emotion, memory_update, provider_metadata
      )
      SELECT
        gen_random_uuid(), locked_conversation.id,
        next_sequence.value + 2, 'npc', ${exchange.reply.speech},
        ${exchange.reply.action}, ${exchange.reply.emotion},
        ${memoryUpdate}, ${providerMetadata}::jsonb
      FROM locked_conversation, next_sequence, inserted_user_message
      RETURNING id
    ), retired_memory AS (
      UPDATE ${npcMemories}
      SET is_current = false
      FROM locked_conversation, inserted_npc_message
      WHERE ${npcMemories.id} = ${exchange.currentMemory.id}
        AND ${npcMemories.npcId} = locked_conversation.npc_id
        AND ${npcMemories.isCurrent} = true
        AND ${memoryUpdate}::text IS NOT NULL
      RETURNING
        ${npcMemories.npcId} AS npc_id,
        ${npcMemories.conversationId} AS conversation_id,
        ${npcMemories.version} AS version
    ), inserted_memory AS (
      INSERT INTO ${npcMemories} (
        id, npc_id, conversation_id, version, summary, facts, is_current
      )
      SELECT
        gen_random_uuid(), retired_memory.npc_id,
        retired_memory.conversation_id, retired_memory.version + 1,
        ${memorySummary}, ${facts}::jsonb, true
      FROM retired_memory
      RETURNING id
    ), updated_conversation AS (
      UPDATE ${conversations}
      SET updated_at = now()
      FROM inserted_npc_message
      WHERE ${conversations.id} = ${exchange.conversationId}
      RETURNING ${conversations.id}
    )
    SELECT
      inserted_user_message.id AS user_message_id,
      inserted_npc_message.id AS npc_message_id
    FROM inserted_user_message, inserted_npc_message, updated_conversation
  `);

  const saved = PersistedExchangeRowSchema.safeParse(result.rows[0]);
  if (!saved.success) throw new DialoguePersistenceConflict();
  return {
    userMessageId: saved.data.user_message_id,
    npcMessageId: saved.data.npc_message_id,
  };
}

export function dialogueRecordsToProviderMessages(
  records: DialogueMessageRecord[],
) {
  return records.map((message) => ({
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    content: message.content,
  }));
}

export function serializeDialogueRecords(records: DialogueMessageRecord[]) {
  return records.map((message) =>
    message.role === "user"
      ? {
          id: message.id,
          role: "user" as const,
          content: message.content,
        }
      : {
          id: message.id,
          role: "assistant" as const,
          content: message.content,
          action: message.action || "They pause for a moment.",
          emotion: message.emotion || "neutral",
        },
  );
}

export function memoryRecordToPrompt(
  memory: DialogueContext["memory"],
): NpcMemory {
  return {
    version: memory.version,
    durableSummary: memory.summary,
    facts: memory.facts,
  };
}
