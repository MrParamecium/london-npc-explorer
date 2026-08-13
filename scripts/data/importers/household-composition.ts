import { createReadStream } from "node:fs";

import { parse } from "csv-parse";

import {
  aggregateCounts,
  normalizeCounts,
  type CountCategory,
} from "./normalized-statistics";

const LONDON_REGION_CODE = "E12000007";

type HouseholdCsvRow = {
  "Lower tier local authorities Code": string;
  "Household composition (15 categories) Code": string;
  "Household composition (15 categories)": string;
  "Age (5 categories) Code": string;
  Observation: string;
};

export function includeAdultHouseholdRow(row: HouseholdCsvRow) {
  return (
    row["Household composition (15 categories) Code"] !== "-8" &&
    ["2", "3", "4", "5"].includes(row["Age (5 categories) Code"])
  );
}

export async function readLondonHouseholdComposition(path: string) {
  const boroughs = new Map<string, Map<string, { key: string; label: string; count: number }>>();
  const parser = createReadStream(path).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  );

  for await (const raw of parser) {
    const row = raw as HouseholdCsvRow;
    const boroughCode = row["Lower tier local authorities Code"];
    if (!/^E09\d{6}$/.test(boroughCode) || !includeAdultHouseholdRow(row)) {
      continue;
    }
    const categoryCode = row["Household composition (15 categories) Code"];
    const count = Number(row.Observation);
    if (!Number.isFinite(count) || count < 0) {
      throw new Error("RM057 contains an invalid observation.");
    }
    let categories = boroughs.get(boroughCode);
    if (!categories) {
      categories = new Map();
      boroughs.set(boroughCode, categories);
    }
    const key = `household_${categoryCode}`;
    const previous = categories.get(key);
    if (previous) previous.count += count;
    else {
      categories.set(key, {
        key,
        label: row["Household composition (15 categories)"],
        count,
      });
    }
  }

  const london = new Map<string, CountCategory[]>();
  const statistics = [];
  for (const [boroughCode, categoryMap] of boroughs) {
    const categories = [...categoryMap.values()].sort((left, right) =>
      left.key.localeCompare(right.key, undefined, { numeric: true }),
    );
    statistics.push({
      geographyLevel: "borough" as const,
      geographyCode: boroughCode,
      metricId: "household_context",
      distribution: normalizeCounts(
        "household_context",
        "person_weighted_residents_16_plus",
        categories,
      ),
    });
    aggregateCounts(london, LONDON_REGION_CODE, categories);
  }
  const londonCategories = london.get(LONDON_REGION_CODE);
  if (!londonCategories) throw new Error("RM057 contains no London observations.");
  statistics.push({
    geographyLevel: "london" as const,
    geographyCode: LONDON_REGION_CODE,
    metricId: "household_context",
    distribution: normalizeCounts(
      "household_context",
      "person_weighted_residents_16_plus",
      londonCategories,
    ),
  });
  return statistics;
}
