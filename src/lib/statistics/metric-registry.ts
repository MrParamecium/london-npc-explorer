import type { DistributionDenominator } from "./types";

export type MetricDefinition = {
  id: string;
  required: boolean;
  denominator: DistributionDenominator;
  preferredSource: string;
  allowedConditions: readonly string[];
  fallbackLevels: readonly ["lsoa", "ward", "borough", "london"];
};

const FALLBACK_LEVELS = ["lsoa", "ward", "borough", "london"] as const;

export const LONDON_NPC_METRIC_REGISTRY = {
  adult_age_sex: {
    id: "adult_age_sex",
    required: true,
    denominator: "adults_18_plus",
    preferredSource: "ons-small-area-population-estimates",
    allowedConditions: [],
    fallbackLevels: FALLBACK_LEVELS,
  },
  ethnic_group: {
    id: "ethnic_group",
    required: true,
    denominator: "usual_residents",
    preferredSource: "census-2021",
    allowedConditions: [],
    fallbackLevels: FALLBACK_LEVELS,
  },
  household_context: {
    id: "household_context",
    required: true,
    denominator: "person_weighted_adults",
    preferredSource: "census-2021",
    allowedConditions: [],
    fallbackLevels: FALLBACK_LEVELS,
  },
  housing_tenure: {
    id: "housing_tenure",
    required: true,
    denominator: "households",
    preferredSource: "census-2021",
    allowedConditions: ["household_context"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  highest_qualification: {
    id: "highest_qualification",
    required: true,
    denominator: "adults_18_plus",
    preferredSource: "census-2021",
    allowedConditions: ["adult_age_sex"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  economic_activity: {
    id: "economic_activity",
    required: true,
    denominator: "adults_18_plus",
    preferredSource: "census-2021",
    allowedConditions: ["adult_age_sex", "highest_qualification"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  occupation_major_group: {
    id: "occupation_major_group",
    required: true,
    denominator: "workers",
    preferredSource: "census-2021",
    allowedConditions: ["adult_age_sex", "economic_activity"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  work_pattern: {
    id: "work_pattern",
    required: true,
    denominator: "workers",
    preferredSource: "census-2021",
    allowedConditions: ["economic_activity"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  travel_to_work: {
    id: "travel_to_work",
    required: true,
    denominator: "workers",
    preferredSource: "census-2021",
    allowedConditions: ["work_pattern"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  employee_earnings: {
    id: "employee_earnings",
    required: true,
    denominator: "employees",
    preferredSource: "ashe-2025-provisional",
    allowedConditions: ["occupation_major_group", "work_pattern"],
    fallbackLevels: FALLBACK_LEVELS,
  },
  imd_decile: {
    id: "imd_decile",
    required: true,
    denominator: "lsoa_area",
    preferredSource: "english-imd-2025",
    allowedConditions: [],
    fallbackLevels: FALLBACK_LEVELS,
  },
} satisfies Record<string, MetricDefinition>;

export function assertMetricDependencyPolicy(
  registry: Record<string, MetricDefinition>,
) {
  for (const definition of Object.values(registry)) {
    if (definition.allowedConditions.includes("ethnic_group")) {
      throw new Error(
        `Metric ${definition.id} cannot condition on ethnic_group in V1.`,
      );
    }
  }
}

assertMetricDependencyPolicy(LONDON_NPC_METRIC_REGISTRY);
