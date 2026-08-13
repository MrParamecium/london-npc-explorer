import { describe, expect, it } from "vitest";

import { namedRandom } from "./deterministic-random";
import { weightedDraw } from "./weighted-draw";

const categories = [
  { key: "one", label: "One", weight: 0.1 },
  { key: "two", label: "Two", weight: 0.2 },
  { key: "three", label: "Three", weight: 0.3 },
  { key: "four", label: "Four", weight: 0.4 },
];

describe("sampler distribution calibration", () => {
  it("tracks weighted inputs across deterministic fixed seeds", () => {
    const sampleSize = 20_000;
    const observed = new Map(categories.map((category) => [category.key, 0]));
    for (let index = 0; index < sampleSize; index += 1) {
      const drawn = weightedDraw(
        categories,
        namedRandom(`calibration-${index}`, "stat/calibration"),
      );
      observed.set(drawn.key, observed.get(drawn.key)! + 1);
    }

    for (const category of categories) {
      const actual = observed.get(category.key)! / sampleSize;
      const standardError = Math.sqrt(
        (category.weight * (1 - category.weight)) / sampleSize,
      );
      expect(Math.abs(actual - category.weight)).toBeLessThanOrEqual(
        Math.max(0.015, 4 * standardError),
      );
    }
  });
});
