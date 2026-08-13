import type { StatisticalDistribution } from "../../../src/lib/statistics/contracts";
import type { DistributionDenominator } from "../../../src/lib/statistics/types";

export type CountCategory = {
  key: string;
  label: string;
  count: number;
};

export type NormalizedStatistic = {
  geographyLevel: "lsoa" | "borough" | "london";
  geographyCode: string;
  metricId: string;
  distribution: StatisticalDistribution;
};

export function normalizeCounts(
  metricId: string,
  denominator: DistributionDenominator,
  categories: CountCategory[],
  conditions: Record<string, string> = {},
): StatisticalDistribution {
  const seen = new Set<string>();
  let total = 0;
  for (const category of categories) {
    if (seen.has(category.key)) {
      throw new Error(`Duplicate category ${category.key} for ${metricId}.`);
    }
    seen.add(category.key);
    if (!Number.isFinite(category.count) || category.count < 0) {
      throw new Error(`Invalid count for ${metricId}/${category.key}.`);
    }
    total += category.count;
  }
  if (!(total > 0)) {
    throw new Error(`Metric ${metricId} has no positive observations.`);
  }

  return {
    metricId,
    denominator,
    conditions,
    categories: categories.map(({ key, label, count }) => ({
      key,
      label,
      weight: count / total,
    })),
    quality: { status: "usable", note: null },
    sampleSize: Math.round(total),
    reweighting: null,
  };
}

export function aggregateCounts(
  target: Map<string, CountCategory[]>,
  geographyCode: string,
  categories: CountCategory[],
) {
  const current = target.get(geographyCode);
  if (!current) {
    target.set(
      geographyCode,
      categories.map((category) => ({ ...category })),
    );
    return;
  }
  if (
    current.length !== categories.length ||
    current.some((category, index) => category.key !== categories[index]?.key)
  ) {
    throw new Error(`Category mismatch while aggregating ${geographyCode}.`);
  }
  categories.forEach((category, index) => {
    current[index]!.count += category.count;
  });
}
