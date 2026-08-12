import { describe, expect, it, vi } from "vitest";

import type { Coordinates } from "./contracts";
import {
  GoogleLocationAdapter,
  LocationProviderError,
  normalizeNearbyPlaceCategory,
} from "./google-location-adapter";

const coordinates: Coordinates = {
  latitude: 51.513615,
  longitude: -0.09835,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GoogleLocationAdapter", () => {
  it("normalizes a reverse-geocoding result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            placeId: "ChIJgoogleAddress001",
            formattedAddress: "10 St Paul's Churchyard, London EC4M 8AD, UK",
            addressComponents: [
              { longText: "10", types: ["street_number"] },
              { longText: "St Paul's Churchyard", types: ["route"] },
              { longText: "City of London", types: ["neighborhood"] },
              { longText: "EC4M 8AD", types: ["postal_code"] },
            ],
          },
        ],
      }),
    );
    const adapter = new GoogleLocationAdapter({
      apiKey: "server-key",
      fetchImpl,
    });

    await expect(adapter.reverseGeocode(coordinates)).resolves.toEqual({
      formatted: "10 St Paul's Churchyard, London EC4M 8AD, UK",
      street: "10 St Paul's Churchyard",
      neighbourhood: "City of London",
      postalCode: "EC4M 8AD",
      placeId: "ChIJgoogleAddress001",
    });

    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("geocode.googleapis.com/v4/geocode/location");
    expect(String(url)).toContain("languageCode=en");
    expect(String(url)).toContain("regionCode=GB");
    expect(init.headers).toMatchObject({
      "X-Goog-Api-Key": "server-key",
    });
    expect(JSON.stringify(init.headers)).not.toContain("rating");
  });

  it("returns null when reverse geocoding has no results", async () => {
    const adapter = new GoogleLocationAdapter({
      apiKey: "server-key",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ results: [] })),
    });

    await expect(adapter.reverseGeocode(coordinates)).resolves.toBeNull();
  });

  it("requests minimum Places fields and caps results at ten", async () => {
    const places = Array.from({ length: 12 }, (_, index) => ({
      id: `ChIJgooglePlace${index.toString().padStart(3, "0")}`,
      displayName: { text: `Place ${index}` },
      primaryType: index % 2 === 0 ? "cafe" : "library",
      shortFormattedAddress: `${index} Example Street`,
      location: {
        latitude: coordinates.latitude + index / 100_000,
        longitude: coordinates.longitude,
      },
    }));
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ places }));
    const adapter = new GoogleLocationAdapter({
      apiKey: "server-key",
      fetchImpl,
    });

    const result = await adapter.searchNearby(coordinates);

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({
      placeId: "ChIJgooglePlace000",
      name: "Place 0",
      primaryType: "cafe",
      category: "food",
      shortAddress: "0 Example Street",
      coordinates,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "server-key",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.primaryType,places.shortFormattedAddress,places.location",
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      maxResultCount: 10,
      rankPreference: "DISTANCE",
      languageCode: "en",
      regionCode: "GB",
    });
    expect(String(init.body)).not.toMatch(
      /rating|review|photo|phone|openingHours/i,
    );
  });

  it("rejects malformed provider responses", async () => {
    const adapter = new GoogleLocationAdapter({
      apiKey: "server-key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(jsonResponse({ places: [{ unexpected: true }] })),
    });

    await expect(adapter.searchNearby(coordinates)).rejects.toMatchObject({
      name: "LocationProviderError",
      code: "invalid_response",
    });
  });

  it("turns an aborted request into a timeout error", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(
        new DOMException("The operation was aborted.", "AbortError"),
      );
    const adapter = new GoogleLocationAdapter({
      apiKey: "server-key",
      fetchImpl,
    });

    await expect(adapter.reverseGeocode(coordinates)).rejects.toMatchObject({
      name: "LocationProviderError",
      code: "provider_timeout",
    });
  });

  it("keeps Geocoding and Places failures independent", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("geocode.googleapis.com")) {
        return jsonResponse({}, 503);
      }

      return jsonResponse({ places: [] });
    });
    const adapter = new GoogleLocationAdapter({
      apiKey: "server-key",
      fetchImpl,
    });

    await expect(adapter.reverseGeocode(coordinates)).rejects.toBeInstanceOf(
      LocationProviderError,
    );
    await expect(adapter.searchNearby(coordinates)).resolves.toEqual([]);
  });
});

describe("normalizeNearbyPlaceCategory", () => {
  it.each([
    ["cafe", "food"],
    ["supermarket", "retail"],
    ["train_station", "transit"],
    ["university", "education"],
    ["hospital", "healthcare"],
    ["park", "park"],
    ["library", "culture_community"],
  ])("maps %s to %s", (primaryType, expected) => {
    expect(normalizeNearbyPlaceCategory(primaryType)).toBe(expected);
  });
});
