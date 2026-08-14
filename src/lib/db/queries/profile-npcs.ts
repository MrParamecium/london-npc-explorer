import "server-only";

import { and, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  CompleteFullNpcInputSchema,
  CompleteProfileNpcInputSchema,
  type CompleteFullNpcInput,
  type CompleteProfileNpcInput,
} from "@/lib/generation/profile-contracts";

import type { Database } from "../client";
import { generationJobs, npcs } from "../schema";

type ProfileCompletionRow = {
  job_id: string;
  npc_id: string;
};

type FullCompletionRow = {
  job_id: string;
  npc_id: string;
};

export type ProfileNpcRecord = typeof npcs.$inferSelect;

export function serializeProfileNpc(npc: ProfileNpcRecord) {
  return {
    npcId: npc.id,
    locationId: npc.locationId,
    seed: npc.seed,
    canonicalProfile: npc.canonicalProfile,
    currentState: npc.currentState,
    versionSet: npc.versionSet,
    fieldProvenance: npc.fieldProvenance,
    narrative: npc.narrative,
    portraitUrl: npc.portraitUrl,
    visibleAt: npc.visibleAt.toISOString(),
    createdAt: npc.createdAt.toISOString(),
  };
}

export class ProfileNpcCompletionConflict extends Error {
  constructor() {
    super(
      "The profile-only generation job is not running, is not owned by this user, or was already completed.",
    );
    this.name = "ProfileNpcCompletionConflict";
  }
}

export class FullNpcCompletionConflict extends Error {
  constructor() {
    super(
      "The full generation job is not running, is not owned by this user, or was already completed.",
    );
    this.name = "FullNpcCompletionConflict";
  }
}

export async function completeFullNpcAtomically(
  database: Database,
  input: CompleteFullNpcInput,
) {
  const fullInput = CompleteFullNpcInputSchema.parse(input);
  const profile = JSON.stringify(fullInput.canonicalProfile);
  const currentState = JSON.stringify(fullInput.currentState);
  const versionSet = JSON.stringify(fullInput.versionSet);
  const fieldProvenance = JSON.stringify(fullInput.fieldProvenance);

  // One data-modifying statement prevents the NPC and job from becoming visible separately.
  const rows = await database.execute<FullCompletionRow>(sql`
    WITH eligible_job AS (
      SELECT id, owner_id, location_id, seed
      FROM ${generationJobs}
      WHERE id = ${fullInput.jobId}
        AND owner_id = ${fullInput.ownerId}
        AND location_id = ${fullInput.locationId}
        AND seed = ${fullInput.seed}
        AND version_set = ${versionSet}::jsonb
        AND mode = 'full'
        AND status = 'running'
        AND result_npc_id IS NULL
      FOR UPDATE
    ), inserted_npc AS (
      INSERT INTO npcs (
        id, owner_id, location_id, generation_job_id, seed,
        canonical_profile, current_state, version_set, field_provenance,
        narrative, portrait_url, visible_at
      )
      SELECT
        gen_random_uuid(), owner_id, location_id, id, seed,
        ${profile}::jsonb, ${currentState}::jsonb, ${versionSet}::jsonb,
        ${fieldProvenance}::jsonb, ${fullInput.narrative},
        ${fullInput.portraitUrl}, now()
      FROM eligible_job
      RETURNING id, generation_job_id
    ), completed_job AS (
      UPDATE npc_generation_jobs
      SET status = 'completed', stage = 'completed',
          result_npc_id = inserted_npc.id,
          portrait_url = ${fullInput.portraitUrl},
          estimated_cost_usd = ${fullInput.estimatedCostUsd},
          failure = NULL,
          updated_at = now()
      FROM inserted_npc
      WHERE npc_generation_jobs.id = inserted_npc.generation_job_id
      RETURNING npc_generation_jobs.id, npc_generation_jobs.result_npc_id
    )
    SELECT completed_job.id AS job_id,
           inserted_npc.id AS npc_id
    FROM completed_job
    INNER JOIN inserted_npc
      ON inserted_npc.generation_job_id = completed_job.id
  `);

  const completed = rows.rows[0];
  if (!completed) throw new FullNpcCompletionConflict();

  return { jobId: completed.job_id, npcId: completed.npc_id };
}

export async function completeProfileNpcAtomically(
  database: Database,
  input: CompleteProfileNpcInput,
) {
  const profileInput = CompleteProfileNpcInputSchema.parse(input);
  const profile = JSON.stringify(profileInput.canonicalProfile);
  const currentState = JSON.stringify(profileInput.currentState);
  const versionSet = JSON.stringify(profileInput.versionSet);
  const fieldProvenance = JSON.stringify(profileInput.fieldProvenance);

  const rows = await database.execute<ProfileCompletionRow>(sql`
    WITH eligible_job AS (
      SELECT id, owner_id, location_id, seed
      FROM ${generationJobs}
      WHERE id = ${profileInput.jobId}
        AND owner_id = ${profileInput.ownerId}
        AND location_id = ${profileInput.locationId}
        AND seed = ${profileInput.seed}
        AND version_set = ${versionSet}::jsonb
        AND mode = 'profile_only'
        AND status = 'running'
        AND result_npc_id IS NULL
      FOR UPDATE
    ), inserted_npc AS (
      INSERT INTO npcs (
        id, owner_id, location_id, generation_job_id, seed,
        canonical_profile, current_state, version_set, field_provenance,
        narrative, portrait_url, visible_at
      )
      SELECT
        gen_random_uuid(), owner_id, location_id, id, seed,
        ${profile}::jsonb, ${currentState}::jsonb, ${versionSet}::jsonb,
        ${fieldProvenance}::jsonb, ${profileInput.narrative}, NULL, now()
      FROM eligible_job
      RETURNING id, generation_job_id
    ), completed_job AS (
      UPDATE npc_generation_jobs
      SET status = 'completed', stage = 'completed',
          result_npc_id = inserted_npc.id,
          portrait_url = NULL,
          failure = NULL,
          updated_at = now()
      FROM inserted_npc
      WHERE npc_generation_jobs.id = inserted_npc.generation_job_id
      RETURNING npc_generation_jobs.id, npc_generation_jobs.result_npc_id
    )
    SELECT completed_job.id AS job_id,
           inserted_npc.id AS npc_id
    FROM completed_job
    INNER JOIN inserted_npc
      ON inserted_npc.generation_job_id = completed_job.id
  `);

  const completed = rows.rows[0];
  if (!completed) throw new ProfileNpcCompletionConflict();

  return { jobId: completed.job_id, npcId: completed.npc_id };
}

export async function getProfileNpcForOwner(
  database: Database,
  ownerId: string,
  npcId: string,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(npcId);
  const [row] = await database
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

  return row?.npc ?? null;
}

export async function listProfileNpcsForOwner(
  database: Database,
  input: { ownerId: string; cursor?: string | null; limit?: number },
) {
  const owner = ClerkUserIdSchema.parse(input.ownerId);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const cursor = input.cursor ? EntityIdSchema.parse(input.cursor) : null;

  const cursorRow = cursor
    ? await database
        .select({ createdAt: npcs.createdAt, id: npcs.id })
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
            eq(npcs.id, cursor),
            eq(npcs.ownerId, owner),
            isNotNull(npcs.portraitUrl),
          ),
        )
        .limit(1)
    : [];
  const cursorValue = cursorRow[0];

  const rows = await database
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
        eq(npcs.ownerId, owner),
        isNotNull(npcs.portraitUrl),
        cursorValue
          ? or(
              lt(npcs.createdAt, cursorValue.createdAt),
              and(
                eq(npcs.createdAt, cursorValue.createdAt),
                lt(npcs.id, cursorValue.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(npcs.createdAt), desc(npcs.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map((row) => row.npc);
  return {
    items: page,
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}
