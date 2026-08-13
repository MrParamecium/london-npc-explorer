import { z } from "zod";

import { EntityIdSchema, IsoDateTimeSchema } from "@/lib/domain/primitives";
import {
  GenerationStageSchema,
  GenerationStatusSchema,
} from "@/lib/generation/contracts";
import {
  CanonicalNpcProfileSchema,
  NpcCurrentStateSchema,
  NpcFieldProvenanceMapSchema,
  NpcVersionSetSchema,
} from "@/lib/npc/contracts";

export const PublicProfileNpcSchema = z
  .object({
    npcId: EntityIdSchema,
    locationId: EntityIdSchema,
    seed: z.string().min(12).max(128),
    canonicalProfile: CanonicalNpcProfileSchema,
    currentState: NpcCurrentStateSchema,
    versionSet: NpcVersionSetSchema,
    fieldProvenance: NpcFieldProvenanceMapSchema,
    narrative: z.string().trim().min(20).max(8_000),
    portraitUrl: z.string().url().nullable(),
    visibleAt: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

const PublicGenerationFailureSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean(),
  })
  .strict();

export const ProfileGenerationResponseSchema = z
  .object({
    jobId: EntityIdSchema,
    status: GenerationStatusSchema,
    stage: GenerationStageSchema,
    npcId: EntityIdSchema.nullable(),
    failure: PublicGenerationFailureSchema.nullable(),
    npc: PublicProfileNpcSchema.optional(),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.status === "completed" && !response.npc) {
      context.addIssue({
        code: "custom",
        path: ["npc"],
        message: "A completed generation response requires an NPC.",
      });
    }
  });

export const ProfileHistoryResponseSchema = z
  .object({
    items: z.array(PublicProfileNpcSchema),
    nextCursor: EntityIdSchema.nullable(),
  })
  .strict();

export const PublicApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(80),
        message: z.string().trim().min(1).max(1_000),
        retryable: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export type PublicProfileNpc = z.infer<typeof PublicProfileNpcSchema>;
