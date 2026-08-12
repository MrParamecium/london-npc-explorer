import { describe, expect, it } from "vitest";

import { MockLocationAdapter } from "./mock-location-adapter";

describe("MockLocationAdapter", () => {
  it("returns the same result for the same normalized coordinate", async () => {
    const adapter = new MockLocationAdapter();
    const firstCoordinate = { latitude: 51.5136154, longitude: -0.0983504 };
    const equivalentCoordinate = {
      latitude: 51.51361549,
      longitude: -0.09835049,
    };

    await expect(adapter.reverseGeocode(firstCoordinate)).resolves.toEqual(
      await adapter.reverseGeocode(equivalentCoordinate),
    );
    await expect(adapter.searchNearby(firstCoordinate)).resolves.toEqual(
      await adapter.searchNearby(equivalentCoordinate),
    );
  });

  it("returns no more than ten contract-valid nearby places", async () => {
    const adapter = new MockLocationAdapter();

    await expect(
      adapter.searchNearby({ latitude: 51.513615, longitude: -0.09835 }),
    ).resolves.toHaveLength(10);
  });
});
