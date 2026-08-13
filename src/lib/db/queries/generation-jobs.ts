import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  GenerationIdempotencyKeySchema,
  GenerationModeSchema,
  GenerationSeedSchema,
} from "@/lib/generation/contracts";
import { NpcVersionSetSchema } from "@/lib/npc/contracts";

import type { Database } from "../client";
import { generationJobs } from "../schema";

export type GenerationFailureInput = {
  code:
    | "provider_timeout"
    | "invalid_output"
    | "portrait_failed"
    | "budget_exceeded"
    | "statistics_unavailable"
    | "invalid_distribution"
    | "compatibility_exhausted"
    | "authentication_required"
    | "persistence_failed"
    | "unknown";
  message: string;
  retryable: boolean;
};

export const CreateGenerationJobInputSchema = z
  .object({
    ownerId: ClerkUserIdSchema,
    locationId: EntityIdSchema,
    idempotencyKey: GenerationIdempotencyKeySchema,
    seed: GenerationSeedSchema,
    mode: GenerationModeSchema.default("profile_only"),
    versionSet: NpcVersionSetSchema.nullable().default(null),
    estimatedCostUsd: z.number().finite().min(0).max(100).default(0),
  })
  .strict();

export type CreateGenerationJobInput = z.input<
  typeof CreateGenerationJobInputSchema
>;

export async function createOrReuseGenerationJob(
  database: Database,
  input: CreateGenerationJobInput,
) {
  const result = await createOrReuseGenerationJobWithStatus(database, input);
  return result.job;
}

export async function createOrReuseGenerationJobWithStatus(
  database: Database,
  input: CreateGenerationJobInput,
) {
  const job = CreateGenerationJobInputSchema.parse(input);
  const [created] = await database
    .insert(generationJobs)
    .values(job)
    .onConflictDoNothing({
      target: [generationJobs.ownerId, generationJobs.idempotencyKey],
    })
    .returning();

  if (created) {
    return { job: created, created: true };
  }

  const [existing] = await database
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.ownerId, job.ownerId),
        eq(generationJobs.idempotencyKey, job.idempotencyKey),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("The generation job could not be created or recovered.");
  }

  return { job: existing, created: false };
}

export async function getGenerationJobForOwner(
  database: Database,
  ownerId: string,
  jobId: string,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(jobId);
  const [job] = await database
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.id, id), eq(generationJobs.ownerId, owner)))
    .limit(1);

  return job ?? null;
}

export async function getGenerationJobForOwnerByIdempotency(
  database: Database,
  ownerId: string,
  idempotencyKey: string,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const key = GenerationIdempotencyKeySchema.parse(idempotencyKey);
  const [job] = await database
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.ownerId, owner),
        eq(generationJobs.idempotencyKey, key),
      ),
    )
    .limit(1);

  return job ?? null;
}

export async function markGenerationJobRunning(
  database: Database,
  ownerId: string,
  jobId: string,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(jobId);
  const [job] = await database
    .update(generationJobs)
    .set({ status: "running", stage: "location", updatedAt: new Date() })
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.ownerId, owner),
        eq(generationJobs.status, "queued"),
      ),
    )
    .returning();

  return job ?? null;
}

export async function markGenerationJobFailed(
  database: Database,
  ownerId: string,
  jobId: string,
  failure: GenerationFailureInput,
) {
  const owner = ClerkUserIdSchema.parse(ownerId);
  const id = EntityIdSchema.parse(jobId);
  const [job] = await database
    .update(generationJobs)
    .set({
      status: "failed",
      failure,
      resultNpcId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.ownerId, owner),
        eq(generationJobs.status, "running"),
        isNull(generationJobs.resultNpcId),
      ),
    )
    .returning();

  return job ?? null;
}
