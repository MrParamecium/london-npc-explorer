import { z } from "zod";

import {
  ClerkUserIdSchema,
  EntityIdSchema,
  IsoDateTimeSchema,
} from "@/lib/domain/primitives";

export const GenerationStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const GenerationStageSchema = z.enum([
  "queued",
  "location",
  "profile",
  "narrative",
  "portrait",
  "persistence",
  "completed",
]);

export const GenerationModeSchema = z.enum(["profile_only", "full"]);

export const GenerationIdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{8,128}$/);

export const GenerationSeedSchema = z.string().regex(/^[A-Za-z0-9-]{12,128}$/);

const GenerationFailureSchema = z
  .object({
    code: z.enum([
      "provider_timeout",
      "invalid_output",
      "portrait_failed",
      "budget_exceeded",
      "statistics_unavailable",
      "invalid_distribution",
      "compatibility_exhausted",
      "authentication_required",
      "persistence_failed",
      "unknown",
    ]),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean(),
  })
  .strict();

export const GenerationJobSchema = z
  .object({
    id: EntityIdSchema,
    ownerId: ClerkUserIdSchema,
    locationId: EntityIdSchema,
    idempotencyKey: GenerationIdempotencyKeySchema,
    seed: GenerationSeedSchema,
    mode: GenerationModeSchema,
    status: GenerationStatusSchema,
    stage: GenerationStageSchema,
    retryCount: z.number().int().min(0).max(1),
    estimatedCostUsd: z.number().finite().min(0).max(100),
    visibleNpcId: EntityIdSchema.nullable(),
    portraitUrl: z.string().url().nullable(),
    failure: GenerationFailureSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((job, context) => {
    if (job.status === "completed") {
      if (job.stage !== "completed") {
        context.addIssue({
          code: "custom",
          path: ["stage"],
          message: "A completed job must be in the completed stage.",
        });
      }
      if (!job.visibleNpcId) {
        context.addIssue({
          code: "custom",
          path: ["visibleNpcId"],
          message: "A completed job requires an NPC.",
        });
      }
      if (job.mode === "full" && !job.portraitUrl) {
        context.addIssue({
          code: "custom",
          path: ["portraitUrl"],
          message: "A completed full job requires a portrait URL.",
        });
      }
      if (job.failure) {
        context.addIssue({
          code: "custom",
          path: ["failure"],
          message: "A completed job cannot contain a failure.",
        });
      }
      return;
    }

    if (job.visibleNpcId) {
      context.addIssue({
        code: "custom",
        path: ["visibleNpcId"],
        message: "An incomplete job cannot expose an NPC.",
      });
    }

    if (job.status === "failed" && !job.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "A failed job requires failure details.",
      });
    }

    if (job.status !== "failed" && job.failure) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Only failed jobs may contain failure details.",
      });
    }
  });

export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type GenerationMode = z.infer<typeof GenerationModeSchema>;
