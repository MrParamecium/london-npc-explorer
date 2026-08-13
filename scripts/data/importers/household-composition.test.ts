import { describe, expect, it } from "vitest";

import { includeAdultHouseholdRow } from "./household-composition";

describe("RM057 household importer", () => {
  it("keeps person-weighted residents aged 16 plus and rejects does-not-apply", () => {
    const base = {
      "Lower tier local authorities Code": "E09000001",
      "Household composition (15 categories) Code": "2",
      "Household composition (15 categories)": "One-person household: Other",
      "Age (5 categories) Code": "2",
      Observation: "20",
    };
    expect(includeAdultHouseholdRow(base)).toBe(true);
    expect(
      includeAdultHouseholdRow({ ...base, "Age (5 categories) Code": "1" }),
    ).toBe(false);
    expect(
      includeAdultHouseholdRow({
        ...base,
        "Household composition (15 categories) Code": "-8",
      }),
    ).toBe(false);
  });
});
