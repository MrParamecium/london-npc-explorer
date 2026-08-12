import { describe, expect, it } from "vitest";

import {
  validLocation,
  validResolvedLocation,
} from "../../../tests/fixtures/domain";
import {
  LocationResolutionErrorSchema,
  LocationSnapshotSchema,
  ResolvedLocationSchema,
} from "./contracts";

describe("LocationSnapshotSchema", () => {
  it("accepts a policy-safe London location snapshot", () => {
    expect(LocationSnapshotSchema.parse(validLocation)).toEqual(validLocation);
  });

  it("rejects coordinates outside valid latitude bounds", () => {
    const result = LocationSnapshotSchema.safeParse({
      ...validLocation,
      coordinates: { ...validLocation.coordinates, latitude: 91 },
    });

    expect(result.success).toBe(false);
  });

  it("does not accept cached Google display fields", () => {
    const result = LocationSnapshotSchema.safeParse({
      ...validLocation,
      googleDisplayName: "A permanently cached place name",
    });

    expect(result.success).toBe(false);
  });
});

describe("ResolvedLocationSchema", () => {
  it("accepts a complete supported London result", () => {
    expect(ResolvedLocationSchema.parse(validResolvedLocation)).toEqual(
      validResolvedLocation,
    );
  });

  it("accepts a partial Google result when official geography is available", () => {
    const partial = {
      ...validResolvedLocation,
      address: null,
      nearbyPlaces: [],
      provenance: {
        ...validResolvedLocation.provenance,
        googleResolvedAt: null,
      },
    };

    expect(ResolvedLocationSchema.parse(partial)).toEqual(partial);
  });

  it("accepts an unsupported point only without London or Google results", () => {
    const unsupported = {
      coordinates: { latitude: 52.2053, longitude: 0.1218 },
      supported: false,
      geography: null,
      address: null,
      nearbyPlaces: [],
      provenance: {
        geographyDatasets: ["greater-london-2025"],
        googleResolvedAt: null,
      },
    };

    expect(ResolvedLocationSchema.parse(unsupported)).toEqual(unsupported);
    expect(
      ResolvedLocationSchema.safeParse({
        ...unsupported,
        address: validResolvedLocation.address,
      }).success,
    ).toBe(false);
  });

  it("requires official geography for a supported point", () => {
    expect(
      ResolvedLocationSchema.safeParse({
        ...validResolvedLocation,
        geography: null,
      }).success,
    ).toBe(false);
  });

  it("caps nearby results at ten", () => {
    const nearbyPlaces = Array.from({ length: 11 }, (_, index) => ({
      ...validResolvedLocation.nearbyPlaces[0],
      placeId: `ChIJfixturePlace${index.toString().padStart(3, "0")}`,
    }));

    expect(
      ResolvedLocationSchema.safeParse({
        ...validResolvedLocation,
        nearbyPlaces,
      }).success,
    ).toBe(false);
  });

  it("rejects unapproved Google display fields", () => {
    expect(
      ResolvedLocationSchema.safeParse({
        ...validResolvedLocation,
        nearbyPlaces: [
          {
            ...validResolvedLocation.nearbyPlaces[0],
            rating: 4.8,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("LocationResolutionErrorSchema", () => {
  it("accepts a structured retryable resolver error", () => {
    const failure = {
      error: {
        code: "provider_timeout",
        message: "Location lookup timed out.",
        retryable: true,
      },
    };

    expect(LocationResolutionErrorSchema.parse(failure)).toEqual(failure);
  });
});
