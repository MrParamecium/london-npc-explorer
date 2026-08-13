import { describe, expect, it } from "vitest";

import { weightedDraw } from "./weighted-draw";

const categories = [
  { key: "a", label: "A", weight: 0.25 },
  { key: "zero", label: "Zero", weight: 0 },
  { key: "b", label: "B", weight: 0.75 },
];

describe("weighted draw", () => {
  it("selects boundaries without selecting zero-weight categories", () => {
    expect(weightedDraw(categories, 0).key).toBe("a");
    expect(weightedDraw(categories, 0.249999).key).toBe("a");
    expect(weightedDraw(categories, 0.25).key).toBe("b");
    expect(weightedDraw(categories, 0.999999).key).toBe("b");
  });

  it("rejects invalid input", () => {
    expect(() => weightedDraw([], 0.5)).toThrow(/requires/);
    expect(() => weightedDraw(categories, 1)).toThrow(/\[0, 1\)/);
    expect(() =>
      weightedDraw([{ key: "bad", label: "Bad", weight: -1 }], 0),
    ).toThrow(/Invalid/);
  });
});
