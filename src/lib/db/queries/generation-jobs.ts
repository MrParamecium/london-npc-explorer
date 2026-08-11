import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  GenerationIdempotencyKeySchema,
  GenerationSeedSchema,
} from "@/lib/generation/contracts";

import type { Database } from "../client";
import { generationJobs } from "../schema";

export const CreateGenerationJobInputSchema = z
  .object({
    ownerId: ClerkUserIdSchema,
    locationId: EntityIdSchema,
    idempotencyKey: GenerationIdempotencyKeySchema,
    seed: GenerationSeedSchema,
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
  const job = CreateGenerationJobInputSchema.parse(input);
  const [created] = await database
    .insert(generationJobs)
    .values(job)
    .onConflictDoNothing({
      target: [generationJobs.ownerId, generationJobs.idempotencyKey],
    })
    .returning();

  if (created) {
    return created;
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

  return existing;
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
