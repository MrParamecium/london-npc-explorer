import { describe, expect, it } from "vitest";

import {
  coordinateCacheKey,
  normalizeCoordinates,
} from "./coordinate-normalization";

describe("normalizeCoordinates", () => {
  it("rounds coordinates to six decimal places", () => {
    expect(
      normalizeCoordinates({
        latitude: 51.52020049,
        longitude: -0.09790051,
      }),
    ).toEqual({ latitude: 51.5202, longitude: -0.097901 });
  });

  it("normalizes negative zero", () => {
    expect(
      normalizeCoordinates({ latitude: -0.0000001, longitude: -0 }),
    ).toEqual({ latitude: 0, longitude: 0 });
  });

  it("rejects coordinates outside world bounds", () => {
    expect(() =>
      normalizeCoordinates({ latitude: 51.5, longitude: 181 }),
    ).toThrow();
  });
});

describe("coordinateCacheKey", () => {
  it("creates one stable identity for equivalent coordinates", () => {
    expect(coordinateCacheKey({ latitude: 51.5202, longitude: -0.0979 })).toBe(
      "51.520200,-0.097900",
    );
    expect(
      coordinateCacheKey({
        latitude: 51.5202001,
        longitude: -0.0978999,
      }),
    ).toBe("51.520200,-0.097900");
  });
});
