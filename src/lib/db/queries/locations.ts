import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  CoordinatesSchema,
  GeographyResolutionSchema,
} from "@/lib/location/contracts";

import type { Database } from "../client";
import { locations } from "../schema";

export const SaveLocationInputSchema = z
  .object({
    coordinates: CoordinatesSchema,
    geography: GeographyResolutionSchema,
    googlePlaceId: z.string().min(8).max(255).nullable().default(null),
    panoramaId: z.string().min(8).max(255).nullable().default(null),
  })
  .strict();

export type SaveLocationInput = z.input<typeof SaveLocationInputSchema>;

export async function saveLocation(
  database: Database,
  input: SaveLocationInput,
) {
  const location = SaveLocationInputSchema.parse(input);
  const { latitude, longitude } = location.coordinates;

  const [saved] = await database
    .insert(locations)
    .values({
      latitude,
      longitude,
      coordinate: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`,
      lsoaCode: location.geography.lsoaCode,
      wardCode: location.geography.wardCode ?? null,
      boroughCode: location.geography.boroughCode,
      fallbackLevel: location.geography.fallbackLevel,
      googlePlaceId: location.googlePlaceId,
      panoramaId: location.panoramaId,
      googleIdentifiersCheckedAt:
        location.googlePlaceId || location.panoramaId ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [locations.latitude, locations.longitude],
      set: {
        lsoaCode: location.geography.lsoaCode,
        wardCode: location.geography.wardCode ?? null,
        boroughCode: location.geography.boroughCode,
        fallbackLevel: location.geography.fallbackLevel,
        googlePlaceId: location.googlePlaceId,
        panoramaId: location.panoramaId,
        googleIdentifiersCheckedAt:
          location.googlePlaceId || location.panoramaId ? new Date() : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!saved) {
    throw new Error("The location could not be saved.");
  }

  return saved;
}
