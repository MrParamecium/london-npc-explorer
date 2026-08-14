import { z } from "zod";

import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  CanonicalNpcProfileV2Schema,
  NpcCurrentStateSchema,
  NpcFieldProvenanceMapSchema,
  NpcV2VersionSetSchema,
} from "@/lib/npc/contracts";

import { GenerationSeedSchema } from "./contracts";

const CompleteNpcBaseSchema = z.object({
  jobId: EntityIdSchema,
  ownerId: ClerkUserIdSchema,
  locationId: EntityIdSchema,
  seed: GenerationSeedSchema,
  canonicalProfile: CanonicalNpcProfileV2Schema,
  currentState: NpcCurrentStateSchema,
  versionSet: NpcV2VersionSetSchema,
  fieldProvenance: NpcFieldProvenanceMapSchema,
  narrative: z.string().trim().min(20).max(8_000),
});

export const CompleteFullNpcInputSchema = CompleteNpcBaseSchema.extend({
  portraitUrl: z.string().url(),
  estimatedCostUsd: z.number().finite().min(0).max(100),
}).strict();

export type CompleteFullNpcInput = z.input<typeof CompleteFullNpcInputSchema>;
