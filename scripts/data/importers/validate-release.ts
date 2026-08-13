import { StatisticalDistributionSchema } from "../../../src/lib/statistics/contracts";
import { LONDON_NPC_METRIC_REGISTRY } from "../../../src/lib/statistics/metric-registry";
import type { NormalizedStatistic } from "./normalized-statistics";

export function validateNormalizedRelease(rows: NormalizedStatistic[]) {
  const unique = new Set<string>();
  const londonMetrics = new Set<string>();
  for (const row of rows) {
    StatisticalDistributionSchema.parse(row.distribution);
    const key = `${row.geographyLevel}:${row.geographyCode}:${row.metricId}`;
    if (unique.has(key)) throw new Error(`Duplicate normalized statistic ${key}.`);
    unique.add(key);
    if (row.geographyLevel === "london") londonMetrics.add(row.metricId);
  }
  for (const definition of Object.values(LONDON_NPC_METRIC_REGISTRY)) {
    if (definition.required && !londonMetrics.has(definition.id)) {
      throw new Error(`Required London metric ${definition.id} is missing.`);
    }
  }
  return {
    rowCount: rows.length,
    metricCount: new Set(rows.map((row) => row.metricId)).size,
    lsoaCount: new Set(
      rows
        .filter((row) => row.geographyLevel === "lsoa")
        .map((row) => row.geographyCode),
    ).size,
    boroughCount: new Set(
      rows
        .filter((row) => row.geographyLevel === "borough")
        .map((row) => row.geographyCode),
    ).size,
  };
}
