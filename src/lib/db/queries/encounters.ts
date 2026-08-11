import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  CompleteEncounterInputSchema,
  type CompleteEncounterInput,
} from "@/lib/generation/encounter-contracts";

import type { Database } from "../client";
import { conversations, generationJobs, npcMemories, npcs } from "../schema";

type CompletionRow = {
  job_id: string;
  npc_id: string;
  conversation_id: string;
};

export class EncounterCompletionConflict extends Error {
  constructor() {
    super(
      "The generation job is not running, is not owned by this user, or was already completed.",
    );
    this.name = "EncounterCompletionConflict";
  }
}

export async function completeEncounterAtomically(
  database: Database,
  input: CompleteEncounterInput,
) {
  const encounter = CompleteEncounterInputSchema.parse(input);
  const profile = JSON.stringify(encounter.canonicalProfile);
  const currentState = JSON.stringify(encounter.currentState);
  const versionSet = JSON.stringify(encounter.versionSet);
  const facts = JSON.stringify(encounter.initialMemory.facts);

  // One data-modifying statement makes the NPC visible only when every linked row exists.
  const rows = await database.execute(sql<CompletionRow>`
    WITH eligible_job AS (
      SELECT id, owner_id, location_id
      FROM ${generationJobs}
      WHERE id = ${encounter.jobId}
        AND owner_id = ${encounter.ownerId}
        AND location_id = ${encounter.locationId}
        AND status = 'running'
        AND result_npc_id IS NULL
      FOR UPDATE
    ), inserted_npc AS (
      INSERT INTO npcs (
        id, owner_id, location_id, generation_job_id, seed,
        canonical_profile, current_state, version_set, narrative,
        portrait_url, visible_at
      )
      SELECT
        gen_random_uuid(), owner_id, location_id, id, ${encounter.seed},
        ${profile}::jsonb, ${currentState}::jsonb, ${versionSet}::jsonb,
        ${encounter.narrative}, ${encounter.portraitUrl}, now()
      FROM eligible_job
      RETURNING id, owner_id
    ), inserted_conversation AS (
      INSERT INTO conversations (id, owner_id, npc_id)
      SELECT gen_random_uuid(), owner_id, id
      FROM inserted_npc
      RETURNING id, npc_id
    ), inserted_memory AS (
      INSERT INTO npc_memories (
        id, npc_id, conversation_id, version, summary, facts, is_current
      )
      SELECT
        gen_random_uuid(), inserted_npc.id, inserted_conversation.id,
        ${encounter.initialMemory.version},
        ${encounter.initialMemory.durableSummary}, ${facts}::jsonb, true
      FROM inserted_npc, inserted_conversation
      RETURNING id
    ), completed_job AS (
      UPDATE ${generationJobs}
      SET status = 'completed', stage = 'completed',
          result_npc_id = inserted_npc.id,
          portrait_url = ${encounter.portraitUrl},
          failure = NULL, updated_at = now()
      FROM inserted_npc, inserted_memory
      WHERE npc_generation_jobs.id = ${encounter.jobId}
      RETURNING npc_generation_jobs.id, npc_generation_jobs.result_npc_id
    )
    SELECT completed_job.id AS job_id,
           inserted_npc.id AS npc_id,
           inserted_conversation.id AS conversation_id
    FROM completed_job, inserted_npc, inserted_conversation
  `);

  const completed = rows.rows[0] as CompletionRow | undefined;
  if (!completed) {
    throw new EncounterCompletionConflict();
  }

  return {
    jobId: completed.job_id,
    npcId: completed.npc_id,
    conversationId: completed.conversation_id,
  };
}

export async function getVisibleNpcForOwner(
  database: Database,
  ownerId: string,
  npcId: string,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(npcId);
  const [npc] = await database
    .select({ npc: npcs })
    .from(npcs)
    .innerJoin(
      generationJobs,
      and(
        eq(generationJobs.resultNpcId, npcs.id),
        eq(generationJobs.status, "completed"),
      ),
    )
    .where(and(eq(npcs.id, id), eq(npcs.ownerId, owner)))
    .limit(1);

  return npc?.npc ?? null;
}

export async function getEncounterForOwner(
  database: Database,
  ownerId: string,
  npcId: string,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(npcId);
  const [encounter] = await database
    .select({
      npc: npcs,
      conversation: conversations,
      memory: npcMemories,
    })
    .from(npcs)
    .innerJoin(
      generationJobs,
      and(
        eq(generationJobs.resultNpcId, npcs.id),
        eq(generationJobs.status, "completed"),
      ),
    )
    .innerJoin(
      conversations,
      and(eq(conversations.npcId, npcs.id), eq(conversations.ownerId, owner)),
    )
    .innerJoin(
      npcMemories,
      and(
        eq(npcMemories.npcId, npcs.id),
        eq(npcMemories.conversationId, conversations.id),
        eq(npcMemories.isCurrent, true),
      ),
    )
    .where(and(eq(npcs.id, id), eq(npcs.ownerId, owner)))
    .limit(1);

  return encounter ?? null;
}
