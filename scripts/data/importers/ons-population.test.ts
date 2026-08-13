import { describe, expect, it } from "vitest";

import { transformPopulationRow } from "./ons-population";

describe("ONS population importer", () => {
  it("filters to ages 18 through 90 and aggregates named age-sex bands", () => {
    const row: Record<string, number> = {};
    for (const sex of ["F", "M"]) {
      for (let age = 0; age <= 90; age += 1) row[`${sex}${age}`] = 1;
    }
    row.F16 = 500;
    row.F17 = 500;

    const categories = transformPopulationRow(row);
    expect(categories).toHaveLength(10);
    expect(categories[0]).toEqual({
      key: "female_18_24",
      label: "Female, age 18-24",
      count: 7,
    });
    expect(categories.at(-1)?.count).toBe(26);
  });
});
