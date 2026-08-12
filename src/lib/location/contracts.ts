import { z } from "zod";

import { EntityIdSchema, IsoDateTimeSchema } from "@/lib/domain/primitives";

const OnsGeographyCodeSchema = z.string().regex(/^E\d{8}$/);
const DatasetVersionSchema = z.string().trim().min(1).max(120);
const GooglePlaceIdSchema = z.string().trim().min(8).max(255);

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

export const OfficialGeographyLabelSchema = z
  .object({
    code: OnsGeographyCodeSchema,
    name: z.string().trim().min(1).max(160),
    version: DatasetVersionSchema,
  })
  .strict();

export const ResolvedGeographySchema = z
  .object({
    lsoa: OfficialGeographyLabelSchema,
    ward: OfficialGeographyLabelSchema.nullable(),
    borough: OfficialGeographyLabelSchema,
  })
  .strict();

export const ResolvedAddressSchema = z
  .object({
    formatted: z.string().trim().min(1).max(500),
    street: z.string().trim().min(1).max(200).nullable(),
    neighbourhood: z.string().trim().min(1).max(200).nullable(),
    postalCode: z.string().trim().min(1).max(24).nullable(),
    placeId: GooglePlaceIdSchema.nullable(),
  })
  .strict();

export const NearbyPlaceCategorySchema = z.enum([
  "food",
  "retail",
  "transit",
  "education",
  "healthcare",
  "park",
  "culture_community",
]);

export const NearbyPlaceSchema = z
  .object({
    placeId: GooglePlaceIdSchema,
    name: z.string().trim().min(1).max(200),
    primaryType: z.string().trim().min(1).max(120),
    category: NearbyPlaceCategorySchema,
    shortAddress: z.string().trim().min(1).max(300).nullable(),
    coordinates: CoordinatesSchema,
  })
  .strict();

const LocationProvenanceSchema = z
  .object({
    geographyDatasets: z.array(DatasetVersionSchema).min(1).max(8),
    googleResolvedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

const SupportedLocationSchema = z
  .object({
    coordinates: CoordinatesSchema,
    supported: z.literal(true),
    geography: ResolvedGeographySchema,
    address: ResolvedAddressSchema.nullable(),
    nearbyPlaces: z.array(NearbyPlaceSchema).max(10),
    provenance: LocationProvenanceSchema,
  })
  .strict();

const UnsupportedLocationSchema = z
  .object({
    coordinates: CoordinatesSchema,
    supported: z.literal(false),
    geography: z.null(),
    address: z.null(),
    nearbyPlaces: z.array(NearbyPlaceSchema).max(0),
    provenance: LocationProvenanceSchema.extend({
      googleResolvedAt: z.null(),
    }).strict(),
  })
  .strict();

export const ResolvedLocationSchema = z.discriminatedUnion("supported", [
  SupportedLocationSchema,
  UnsupportedLocationSchema,
]);

export const LocationResolutionErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "invalid_request",
          "geography_unavailable",
          "provider_timeout",
          "rate_limited",
          "internal_error",
        ]),
        message: z.string().trim().min(1).max(240),
        retryable: z.boolean(),
      })
      .strict(),
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
export type OfficialGeographyLabel = z.infer<
  typeof OfficialGeographyLabelSchema
>;
export type ResolvedGeography = z.infer<typeof ResolvedGeographySchema>;
export type ResolvedAddress = z.infer<typeof ResolvedAddressSchema>;
export type NearbyPlaceCategory = z.infer<typeof NearbyPlaceCategorySchema>;
export type NearbyPlace = z.infer<typeof NearbyPlaceSchema>;
export type ResolvedLocation = z.infer<typeof ResolvedLocationSchema>;
export type LocationResolutionError = z.infer<
  typeof LocationResolutionErrorSchema
>;
