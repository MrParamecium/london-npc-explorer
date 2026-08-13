import ExcelJS from "exceljs";

import { aggregateCounts, normalizeCounts } from "./normalized-statistics";

const LONDON_REGION_CODE = "E12000007";

const BANDS = [
  { key: "18-24", minimum: 18, maximum: 24 },
  { key: "25-34", minimum: 25, maximum: 34 },
  { key: "35-49", minimum: 35, maximum: 49 },
  { key: "50-64", minimum: 50, maximum: 64 },
  { key: "65-plus", minimum: 65, maximum: 90 },
] as const;

export type PopulationSourceRow = Record<string, string | number>;

function numeric(value: string | number | undefined, column: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid population value in ${column}.`);
  }
  return parsed;
}

export function transformPopulationRow(row: PopulationSourceRow) {
  const categories = [];
  for (const sex of ["F", "M"] as const) {
    for (const band of BANDS) {
      let count = 0;
      for (let age = band.minimum; age <= band.maximum; age += 1) {
        count += numeric(row[`${sex}${age}`], `${sex}${age}`);
      }
      categories.push({
        key: `${sex === "F" ? "female" : "male"}_${band.key.replace("-", "_").replace("-", "_")}`,
        label: `${sex === "F" ? "Female" : "Male"}, age ${band.key}`,
        count,
      });
    }
  }
  return categories;
}

export async function readLondonPopulation(path: string) {
  const byBorough = new Map<string, ReturnType<typeof transformPopulationRow>>();
  const london = new Map<string, ReturnType<typeof transformPopulationRow>>();
  const statistics = [];
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
    worksheets: "emit",
  });

  for await (const worksheet of workbook) {
    const worksheetName = (worksheet as unknown as { name: string }).name;
    if (worksheetName !== "Mid-2024 LSOA 2021") continue;
    let headers: string[] = [];
    for await (const row of worksheet) {
      if (row.number === 4) {
        headers = Array.from(row.values as unknown[], (value) =>
          String(value ?? ""),
        );
        continue;
      }
      if (row.number < 5) continue;
      const source = Object.fromEntries(
        headers.flatMap((header, index) =>
          index > 0 && header ? [[header, row.getCell(index).value]] : [],
        ),
      ) as PopulationSourceRow;
      const boroughCode = String(source["LAD 2023 Code"] ?? "");
      const lsoaCode = String(source["LSOA 2021 Code"] ?? "");
      if (!boroughCode.startsWith("E09") || !/^E01\d{6}$/.test(lsoaCode)) {
        continue;
      }
      const categories = transformPopulationRow(source);
      statistics.push({
        geographyLevel: "lsoa" as const,
        geographyCode: lsoaCode,
        metricId: "adult_age_sex",
        distribution: normalizeCounts(
          "adult_age_sex",
          "adults_18_plus",
          categories,
        ),
      });
      aggregateCounts(byBorough, boroughCode, categories);
      aggregateCounts(london, LONDON_REGION_CODE, categories);
    }
  }

  for (const [geographyCode, categories] of byBorough) {
    statistics.push({
      geographyLevel: "borough" as const,
      geographyCode,
      metricId: "adult_age_sex",
      distribution: normalizeCounts(
        "adult_age_sex",
        "adults_18_plus",
        categories,
      ),
    });
  }
  const londonCategories = london.get(LONDON_REGION_CODE);
  if (!londonCategories) throw new Error("Population source has no London rows.");
  statistics.push({
    geographyLevel: "london" as const,
    geographyCode: LONDON_REGION_CODE,
    metricId: "adult_age_sex",
    distribution: normalizeCounts(
      "adult_age_sex",
      "adults_18_plus",
      londonCategories,
    ),
  });

  return statistics;
}
