import { z } from "zod";

import { NpcMemorySchema } from "@/lib/agent/contracts";
import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  CanonicalNpcProfileSchema,
  NpcCurrentStateSchema,
  NpcVersionSetSchema,
} from "@/lib/npc/contracts";

import { GenerationSeedSchema } from "./contracts";

export const CompleteEncounterInputSchema = z
  .object({
    jobId: EntityIdSchema,
    ownerId: ClerkUserIdSchema,
    locationId: EntityIdSchema,
    seed: GenerationSeedSchema,
    canonicalProfile: CanonicalNpcProfileSchema,
    currentState: NpcCurrentStateSchema,
    versionSet: NpcVersionSetSchema,
    narrative: z.string().trim().min(20).max(8_000),
    portraitUrl: z.string().url().max(2_000),
    initialMemory: NpcMemorySchema.refine((memory) => memory.version === 1, {
      message: "An encounter must begin with memory version 1.",
      path: ["version"],
    }),
  })
  .strict();

export type CompleteEncounterInput = z.input<
  typeof CompleteEncounterInputSchema
>;
