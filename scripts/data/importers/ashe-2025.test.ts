import { describe, expect, it } from "vitest";

import { annualPayBands } from "./ashe-2025";

describe("ASHE 2025 importer", () => {
  it("turns published percentiles into probability-mass bands", () => {
    const bands = annualPayBands([
      12_000, 21_875, 28_917, 34_226, 46_437, 54_770, 67_586, 95_332,
    ]);
    expect(bands.map((band) => band.count)).toEqual([
      10, 10, 10, 10, 20, 10, 10, 10, 10,
    ]);
    expect(bands[0]?.label).toBe("Below GBP 12,000");
  });

  it("does not convert a suppressed source cell into zero", () => {
    expect(() => annualPayBands(["x", 20, 30, 40, 50, 60, 70, 80])).toThrow(
      /suppressed or invalid/,
    );
  });
});
