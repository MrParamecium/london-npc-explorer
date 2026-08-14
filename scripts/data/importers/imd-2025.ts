import { createReadStream } from "node:fs";

import { parse } from "csv-parse";

import { aggregateCounts, normalizeCounts } from "./normalized-statistics";

const LONDON_REGION_CODE = "E12000007";
const DECILE_COLUMN =
  "Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)";

export function transformImdDecile(value: string) {
  const decile = Number(value);
  if (!Number.isInteger(decile) || decile < 1 || decile > 10) {
    throw new Error("IMD decile must be an integer from 1 through 10.");
  }
  return {
    key: `decile_${decile}`,
    label: `IMD decile ${decile}`,
    count: 1,
  };
}

export async function readLondonImd(path: string) {
  const boroughs = new Map<
    string,
    { key: string; label: string; count: number }[]
  >();
  const london = new Map<
    string,
    { key: string; label: string; count: number }[]
  >();
  const statistics = [];
  const parser = createReadStream(path).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );
  for await (const raw of parser) {
    const row = raw as Record<string, string>;
    const lsoaCode = row["LSOA code (2021)"] ?? "";
    const boroughCode = row["Local Authority District code (2024)"] ?? "";
    if (!/^E01\d{6}$/.test(lsoaCode) || !/^E09\d{6}$/.test(boroughCode))
      continue;
    const category = transformImdDecile(row[DECILE_COLUMN] ?? "");
    statistics.push({
      geographyLevel: "lsoa" as const,
      geographyCode: lsoaCode,
      metricId: "imd_decile",
      distribution: normalizeCounts("imd_decile", "lsoa_area", [category]),
    });
    const blankDeciles = Array.from({ length: 10 }, (_, index) => ({
      key: `decile_${index + 1}`,
      label: `IMD decile ${index + 1}`,
      count: index + 1 === Number(row[DECILE_COLUMN]) ? 1 : 0,
    }));
    aggregateCounts(boroughs, boroughCode, blankDeciles);
    aggregateCounts(london, LONDON_REGION_CODE, blankDeciles);
  }
  for (const [geographyCode, categories] of boroughs) {
    statistics.push({
      geographyLevel: "borough" as const,
      geographyCode,
      metricId: "imd_decile",
      distribution: normalizeCounts("imd_decile", "lsoa_area", categories),
    });
  }
  const londonCategories = london.get(LONDON_REGION_CODE);
  if (!londonCategories) throw new Error("IMD contains no London rows.");
  statistics.push({
    geographyLevel: "london" as const,
    geographyCode: LONDON_REGION_CODE,
    metricId: "imd_decile",
    distribution: normalizeCounts("imd_decile", "lsoa_area", londonCategories),
  });
  return statistics;
}
