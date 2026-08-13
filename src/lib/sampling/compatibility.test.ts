import { describe, expect, it } from "vitest";

import {
  activityCompatible,
  drawCompatible,
  householdCompatible,
} from "./compatibility";

describe("NPC compatibility rules", () => {
  it("protects age-specific household and retirement categories", () => {
    expect(householdCompatible("household_1", 65)).toBe(false);
    expect(householdCompatible("household_1", 66)).toBe(true);
    expect(activityCompatible("retired", 49)).toBe(false);
    expect(activityCompatible("retired", 50)).toBe(true);
  });

  it("fails after deterministic compatibility retries are exhausted", () => {
    expect(() =>
      drawCompatible(
        "seed-00000001",
        "always-rejected",
        [{ key: "one", label: "One", weight: 1 }],
        () => false,
      ),
    ).toThrow(/exhausted/);
  });
});
