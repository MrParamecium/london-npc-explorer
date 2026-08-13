import ExcelJS from "exceljs";

import type { DistributionDenominator } from "../../../src/lib/statistics/types";
import { aggregateCounts, normalizeCounts } from "./normalized-statistics";

const LONDON_REGION_CODE = "E12000007";

type CensusSourceKey =
  | "census-2021-ethnic-group"
  | "census-2021-economic-activity"
  | "census-2021-occupation"
  | "census-2021-travel-to-work"
  | "census-2021-tenure"
  | "census-2021-qualifications";

type CensusMetricConfig = {
  metricId: string;
  denominator: DistributionDenominator;
  categoryColumns: Array<{
    key: string;
    label: string;
    columns: number[];
  }>;
};

type CensusConfig = {
  lsoaColumn: number;
  boroughColumn: number;
  metrics: CensusMetricConfig[];
};

const CONFIGS: Record<CensusSourceKey, CensusConfig> = {
  "census-2021-ethnic-group": {
    lsoaColumn: 1,
    boroughColumn: 3,
    metrics: [
      {
        metricId: "ethnic_group",
        denominator: "usual_residents",
        categoryColumns: [
          ["white_british", "White British"],
          ["white_irish", "White Irish"],
          ["white_gypsy_or_irish_traveller", "White Gypsy or Irish Traveller"],
          ["white_roma", "White Roma"],
          ["white_other", "Other White"],
          ["mixed_white_asian", "Mixed White and Asian"],
          ["mixed_white_black_african", "Mixed White and Black African"],
          ["mixed_white_black_caribbean", "Mixed White and Black Caribbean"],
          ["mixed_other", "Other Mixed or multiple ethnic group"],
          ["asian_bangladeshi", "Asian Bangladeshi"],
          ["asian_chinese", "Asian Chinese"],
          ["asian_indian", "Asian Indian"],
          ["asian_pakistani", "Asian Pakistani"],
          ["asian_other", "Other Asian"],
          ["black_african", "Black African"],
          ["black_caribbean", "Black Caribbean"],
          ["black_other", "Other Black"],
          ["other_arab", "Arab"],
          ["other_ethnic_group", "Other ethnic group"],
        ].map(([key, label], index) => ({
          key,
          label,
          columns: [index + 5],
        })),
      },
    ],
  },
  "census-2021-economic-activity": {
    lsoaColumn: 3,
    boroughColumn: 1,
    metrics: [
      {
        metricId: "economic_activity",
        denominator: "residents_16_plus",
        categoryColumns: [
          { key: "employee_full_time", label: "Employee, full-time", columns: [5] },
          { key: "employee_part_time", label: "Employee, part-time", columns: [6] },
          {
            key: "active_full_time_student",
            label: "Economically active full-time student",
            columns: [7],
          },
          {
            key: "self_employed_full_time",
            label: "Self-employed, full-time",
            columns: [8, 10],
          },
          {
            key: "self_employed_part_time",
            label: "Self-employed, part-time",
            columns: [9, 11],
          },
          { key: "unemployed", label: "Unemployed", columns: [12] },
          {
            key: "long_term_sick_or_disabled",
            label: "Long-term sick or disabled",
            columns: [13],
          },
          { key: "carer", label: "Looking after home or family", columns: [14] },
          { key: "other_inactive", label: "Other economically inactive", columns: [15] },
          { key: "retired", label: "Retired", columns: [16] },
          { key: "inactive_student", label: "Economically inactive student", columns: [17] },
        ],
      },
      {
        metricId: "work_pattern",
        denominator: "workers",
        categoryColumns: [
          { key: "full_time", label: "Full-time", columns: [5, 8, 10] },
          { key: "part_time", label: "Part-time", columns: [6, 9, 11] },
        ],
      },
    ],
  },
  "census-2021-occupation": {
    lsoaColumn: 3,
    boroughColumn: 1,
    metrics: [
      {
        metricId: "occupation_major_group",
        denominator: "workers",
        categoryColumns: [
          ["soc1_managers_directors_senior_officials", "Managers, directors and senior officials"],
          ["soc2_professional", "Professional occupations"],
          ["soc3_associate_professional_technical", "Associate professional and technical occupations"],
          ["soc4_administrative_secretarial", "Administrative and secretarial occupations"],
          ["soc5_skilled_trades", "Skilled trades occupations"],
          ["soc6_caring_leisure_service", "Caring, leisure and other service occupations"],
          ["soc7_sales_customer_service", "Sales and customer service occupations"],
          ["soc8_process_plant_machine", "Process, plant and machine operatives"],
          ["soc9_elementary", "Elementary occupations"],
        ].map(([key, label], index) => ({ key, label, columns: [index + 5] })),
      },
    ],
  },
  "census-2021-travel-to-work": {
    lsoaColumn: 3,
    boroughColumn: 1,
    metrics: [
      {
        metricId: "travel_to_work",
        denominator: "workers",
        categoryColumns: [
          ["work_from_home", "Work mainly at or from home"],
          ["underground_metro_tram", "Underground, metro, light rail or tram"],
          ["train", "Train"],
          ["bus_minibus_coach", "Bus, minibus or coach"],
          ["taxi", "Taxi"],
          ["motorcycle_scooter_moped", "Motorcycle, scooter or moped"],
          ["drive_car_van", "Driving a car or van"],
          ["passenger_car_van", "Passenger in a car or van"],
          ["bicycle", "Bicycle"],
          ["on_foot", "On foot"],
          ["other", "Other method"],
        ].map(([key, label], index) => ({ key, label, columns: [index + 5] })),
      },
    ],
  },
  "census-2021-tenure": {
    lsoaColumn: 1,
    boroughColumn: 2,
    metrics: [
      {
        metricId: "housing_tenure",
        denominator: "households",
        categoryColumns: [
          ["owned_outright", "Owned outright"],
          ["owned_mortgage", "Owned with a mortgage or loan"],
          ["shared_ownership", "Shared ownership"],
          ["social_rented_council", "Social rented from council or Local Authority"],
          ["social_rented_other", "Other social rented"],
          ["private_rented_landlord", "Private landlord or letting agency"],
          ["private_rented_other", "Other private rented"],
          ["rent_free", "Lives rent free"],
        ].map(([key, label], index) => ({ key, label, columns: [index + 5] })),
      },
    ],
  },
  "census-2021-qualifications": {
    lsoaColumn: 1,
    boroughColumn: 2,
    metrics: [
      {
        metricId: "highest_qualification",
        denominator: "residents_16_plus",
        categoryColumns: [
          ["none", "No qualifications"],
          ["level_1", "Level 1 and entry level"],
          ["level_2", "Level 2"],
          ["apprenticeship", "Apprenticeship"],
          ["level_3", "Level 3"],
          ["level_4_plus", "Level 4 or above"],
          ["other", "Other or unknown level"],
        ].map(([key, label], index) => ({ key, label, columns: [index + 5] })),
      },
    ],
  },
};

function numericCell(values: unknown[], column: number) {
  const value = Number(values[column]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Census value in column ${column}.`);
  }
  return value;
}

export function transformCensusRow(
  sourceKey: CensusSourceKey,
  values: unknown[],
) {
  return CONFIGS[sourceKey].metrics.map((metric) => ({
    metricId: metric.metricId,
    denominator: metric.denominator,
    categories: metric.categoryColumns.map((category) => ({
      key: category.key,
      label: category.label,
      count: category.columns.reduce(
        (total, column) => total + numericCell(values, column),
        0,
      ),
    })),
  }));
}

export async function readLondonCensusWorkbook(
  path: string,
  sourceKey: CensusSourceKey,
) {
  const config = CONFIGS[sourceKey];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const worksheet = workbook.getWorksheet("2021");
  if (!worksheet) throw new Error(`${sourceKey} has no 2021 worksheet.`);

  const aggregates = new Map<string, Map<string, ReturnType<typeof transformCensusRow>[number]["categories"]>>();
  const statistics = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values as unknown[];
    const lsoaCode = String(values[config.lsoaColumn] ?? "").trim();
    const boroughCode = String(values[config.boroughColumn] ?? "").trim();
    if (!/^E01\d{6}$/.test(lsoaCode) || !/^E09\d{6}$/.test(boroughCode)) continue;

    for (const transformed of transformCensusRow(sourceKey, values)) {
      statistics.push({
        geographyLevel: "lsoa" as const,
        geographyCode: lsoaCode,
        metricId: transformed.metricId,
        distribution: normalizeCounts(
          transformed.metricId,
          transformed.denominator,
          transformed.categories,
        ),
      });
      let metricAggregates = aggregates.get(transformed.metricId);
      if (!metricAggregates) {
        metricAggregates = new Map();
        aggregates.set(transformed.metricId, metricAggregates);
      }
      aggregateCounts(metricAggregates, boroughCode, transformed.categories);
      aggregateCounts(metricAggregates, LONDON_REGION_CODE, transformed.categories);
    }
  }

  for (const metric of config.metrics) {
    const metricAggregates = aggregates.get(metric.metricId);
    if (!metricAggregates) throw new Error(`${sourceKey} has no London rows.`);
    for (const [geographyCode, categories] of metricAggregates) {
      statistics.push({
        geographyLevel:
          geographyCode === LONDON_REGION_CODE
            ? ("london" as const)
            : ("borough" as const),
        geographyCode,
        metricId: metric.metricId,
        distribution: normalizeCounts(
          metric.metricId,
          metric.denominator,
          categories,
        ),
      });
    }
  }

  return statistics;
}
