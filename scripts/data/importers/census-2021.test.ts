import { describe, expect, it } from "vitest";

import { transformCensusRow } from "./census-2021";

describe("Census 2021 importer", () => {
  it("keeps denominators separate while deriving work pattern", () => {
    const values = Array(18).fill(0);
    values[5] = 10;
    values[6] = 5;
    values[7] = 3;
    values[8] = 2;
    values[9] = 1;
    values[10] = 4;
    values[11] = 2;
    values[12] = 7;
    values[13] = 1;
    values[14] = 2;
    values[15] = 3;
    values[16] = 4;
    values[17] = 5;

    const [activity, workPattern] = transformCensusRow(
      "census-2021-economic-activity",
      values,
    );
    expect(activity?.categories.reduce((sum, row) => sum + row.count, 0)).toBe(
      49,
    );
    expect(workPattern?.categories).toEqual([
      { key: "full_time", label: "Full-time", count: 16 },
      { key: "part_time", label: "Part-time", count: 8 },
    ]);
  });

  it("rejects unknown negative source counts", () => {
    const values = Array(24).fill(1);
    values[5] = -1;
    expect(() =>
      transformCensusRow("census-2021-ethnic-group", values),
    ).toThrow(/Invalid Census value/);
  });
});
