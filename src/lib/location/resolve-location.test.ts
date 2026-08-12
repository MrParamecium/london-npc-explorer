import { describe, expect, it, vi } from "vitest";

import { validResolvedLocation } from "../../../tests/fixtures/domain";
import type { LondonGeographyResult } from "./london-geography-repository";
import { createLocationResolver } from "./resolve-location";

const coordinates = validResolvedLocation.coordinates;
const supportedGeography: LondonGeographyResult = {
  supported: true,
  geography: validResolvedLocation.geography,
  datasets: [...validResolvedLocation.provenance.geographyDatasets],
};

describe("createLocationResolver", () => {
  it("normalizes coordinates and merges supported location context", async () => {
    const reverseGeocode = vi
      .fn()
      .mockResolvedValue(validResolvedLocation.address);
    const searchNearby = vi
      .fn()
      .mockResolvedValue(validResolvedLocation.nearbyPlaces);
    const resolveLocation = createLocationResolver({
      resolveGeography: vi.fn().mockResolvedValue(supportedGeography),
      locationAdapter: { reverseGeocode, searchNearby },
      now: () => new Date("2026-08-12T09:00:00.000Z"),
    });

    await expect(
      resolveLocation({ latitude: 51.5202004, longitude: -0.0979004 }),
    ).resolves.toEqual(validResolvedLocation);
    expect(reverseGeocode).toHaveBeenCalledWith(coordinates);
    expect(searchNearby).toHaveBeenCalledWith(coordinates);
  });

  it("stops before provider calls for an unsupported point", async () => {
    const reverseGeocode = vi.fn();
    const searchNearby = vi.fn();
    const resolveLocation = createLocationResolver({
      resolveGeography: vi.fn().mockResolvedValue({
        supported: false,
        geography: null,
        datasets: ["london-boroughs-may-2025-bgc-v2"],
      }),
      locationAdapter: { reverseGeocode, searchNearby },
    });

    await expect(
      resolveLocation({ latitude: 53.4808, longitude: -2.2426 }),
    ).resolves.toEqual({
      coordinates: { latitude: 53.4808, longitude: -2.2426 },
      supported: false,
      geography: null,
      address: null,
      nearbyPlaces: [],
      provenance: {
        geographyDatasets: ["london-boroughs-may-2025-bgc-v2"],
        googleResolvedAt: null,
      },
    });
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("keeps nearby places when reverse geocoding fails", async () => {
    const resolveLocation = createLocationResolver({
      resolveGeography: vi.fn().mockResolvedValue(supportedGeography),
      locationAdapter: {
        reverseGeocode: vi.fn().mockRejectedValue(new Error("secret-key")),
        searchNearby: vi
          .fn()
          .mockResolvedValue(validResolvedLocation.nearbyPlaces),
      },
      now: () => new Date("2026-08-12T09:00:00.000Z"),
    });

    await expect(resolveLocation(coordinates)).resolves.toEqual({
      ...validResolvedLocation,
      address: null,
    });
  });

  it("returns official geography when both provider calls time out", async () => {
    const timeout = new Error("provider timeout");
    const resolveLocation = createLocationResolver({
      resolveGeography: vi.fn().mockResolvedValue(supportedGeography),
      locationAdapter: {
        reverseGeocode: vi.fn().mockRejectedValue(timeout),
        searchNearby: vi.fn().mockRejectedValue(timeout),
      },
    });

    await expect(resolveLocation(coordinates)).resolves.toEqual({
      ...validResolvedLocation,
      address: null,
      nearbyPlaces: [],
      provenance: {
        ...validResolvedLocation.provenance,
        googleResolvedAt: null,
      },
    });
  });
});
