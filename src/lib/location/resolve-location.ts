import {
  ResolvedLocationSchema,
  type Coordinates,
  type ResolvedLocation,
} from "./contracts";
import { normalizeCoordinates } from "./coordinate-normalization";
import type { LocationAdapter } from "./location-adapter";
import type { LondonGeographyResult } from "./london-geography-repository";

type LocationResolverDependencies = {
  resolveGeography: (
    coordinates: Coordinates,
  ) => Promise<LondonGeographyResult>;
  locationAdapter: LocationAdapter;
  now?: () => Date;
};

export function createLocationResolver(
  dependencies: LocationResolverDependencies,
) {
  return async function resolveLocation(
    input: Coordinates,
  ): Promise<ResolvedLocation> {
    const coordinates = normalizeCoordinates(input);
    const geography = await dependencies.resolveGeography(coordinates);

    if (!geography.supported) {
      return ResolvedLocationSchema.parse({
        coordinates,
        supported: false,
        geography: null,
        address: null,
        nearbyPlaces: [],
        provenance: {
          geographyDatasets: geography.datasets,
          googleResolvedAt: null,
        },
      });
    }

    const [addressResult, nearbyResult] = await Promise.allSettled([
      dependencies.locationAdapter.reverseGeocode(coordinates),
      dependencies.locationAdapter.searchNearby(coordinates),
    ]);
    const googleResponded =
      addressResult.status === "fulfilled" ||
      nearbyResult.status === "fulfilled";

    return ResolvedLocationSchema.parse({
      coordinates,
      supported: true,
      geography: geography.geography,
      address:
        addressResult.status === "fulfilled" ? addressResult.value : null,
      nearbyPlaces:
        nearbyResult.status === "fulfilled" ? nearbyResult.value : [],
      provenance: {
        geographyDatasets: geography.datasets,
        googleResolvedAt: googleResponded
          ? (dependencies.now ?? (() => new Date()))().toISOString()
          : null,
      },
    });
  };
}
