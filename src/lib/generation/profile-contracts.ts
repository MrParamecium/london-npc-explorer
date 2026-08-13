import { z } from "zod";

import { ClerkUserIdSchema, EntityIdSchema } from "@/lib/domain/primitives";
import {
  CanonicalNpcProfileV2Schema,
  NpcCurrentStateSchema,
  NpcFieldProvenanceMapSchema,
  NpcV2VersionSetSchema,
} from "@/lib/npc/contracts";

import { GenerationSeedSchema } from "./contracts";

export const CompleteProfileNpcInputSchema = z
  .object({
    jobId: EntityIdSchema,
    ownerId: ClerkUserIdSchema,
    locationId: EntityIdSchema,
    seed: GenerationSeedSchema,
    canonicalProfile: CanonicalNpcProfileV2Schema,
    currentState: NpcCurrentStateSchema,
    versionSet: NpcV2VersionSetSchema,
    fieldProvenance: NpcFieldProvenanceMapSchema,
    narrative: z.string().trim().min(20).max(8_000),
  })
  .strict();

export type CompleteProfileNpcInput = z.input<
  typeof CompleteProfileNpcInputSchema
>;
