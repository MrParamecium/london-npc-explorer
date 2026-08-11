import { z } from "zod";

import { EntityIdSchema, IsoDateTimeSchema } from "@/lib/domain/primitives";

const OnsGeographyCodeSchema = z.string().regex(/^E\d{8}$/);

export const CoordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export const GeographyResolutionSchema = z
  .object({
    lsoaCode: OnsGeographyCodeSchema,
    wardCode: OnsGeographyCodeSchema.nullable().optional(),
    boroughCode: OnsGeographyCodeSchema,
    fallbackLevel: z.enum(["lsoa", "ward", "borough", "london"]),
  })
  .strict();

export const LocationSnapshotSchema = z
  .object({
    id: EntityIdSchema,
    coordinates: CoordinatesSchema,
    geography: GeographyResolutionSchema,
    googlePlaceId: z.string().min(8).max(255).nullable(),
    panoramaId: z.string().min(8).max(255).nullable(),
    inspectedAt: IsoDateTimeSchema,
  })
  .strict();

export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type GeographyResolution = z.infer<typeof GeographyResolutionSchema>;
export type LocationSnapshot = z.infer<typeof LocationSnapshotSchema>;
