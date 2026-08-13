import { describe, expect, it } from "vitest";

import { transformImdDecile } from "./imd-2025";

describe("IMD 2025 importer", () => {
  it("maps one LSOA to one decile", () => {
    expect(transformImdDecile("8")).toEqual({
      key: "decile_8",
      label: "IMD decile 8",
      count: 1,
    });
  });

  it("rejects unknown deciles", () => {
    expect(() => transformImdDecile("11")).toThrow(/1 through 10/);
  });
});
