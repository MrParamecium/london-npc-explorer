import { describe, expect, it } from "vitest";

import { namedInteger, namedRandom } from "./deterministic-random";

describe("named deterministic randomness", () => {
  it("returns a stable fixed vector in [0, 1)", () => {
    expect(namedRandom("seed-00000001", "identity/age")).toBe(
      0.4779053267292964,
    );
  });

  it("isolates paths and keeps integer bounds inclusive", () => {
    expect(namedRandom("seed-00000001", "one")).not.toBe(
      namedRandom("seed-00000001", "two"),
    );
    expect(namedInteger("seed-00000001", "age", 18, 18)).toBe(18);
  });
});
