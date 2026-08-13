import { GeographyResolutionSchema } from "@/lib/location/contracts";

import {
  ActiveStatisticalVersionSetSchema,
  ProbabilityBundleSchema,
  StatisticalDistributionSchema,
  StatisticalMetricResolutionSchema,
  type ActiveStatisticalVersionSet,
  type ProbabilityBundle,
} from "./contracts";
import { LONDON_NPC_METRIC_REGISTRY } from "./metric-registry";
import {
  SpatialStatisticRowSchema,
  type SpatialStatisticRow,
} from "./spatial-statistics-repository";

const LONDON_REGION_CODE = "E12000007";

export class SpatialStatisticsUnavailableError extends Error {
  readonly metricId: string;

  constructor(metricId: string) {
    super(`No usable spatial distribution is available for ${metricId}.`);
    this.name = "SpatialStatisticsUnavailableError";
    this.metricId = metricId;
  }
}

function geographyCandidates(input: {
  lsoaCode: string;
  wardCode?: string | null;
  boroughCode: string;
}) {
  return [
    ["lsoa", input.lsoaCode],
    ...(input.wardCode ? [["ward", input.wardCode] as const] : []),
    ["borough", input.boroughCode],
    ["london", LONDON_REGION_CODE],
  ] as const;
}

function isUsable(row: SpatialStatisticRow) {
  const parsed = StatisticalDistributionSchema.safeParse(row.distribution);
  if (!parsed.success || parsed.data.quality.status !== "usable") return null;
  if (parsed.data.categories.length === 0) return null;
  return parsed.data;
}

export function buildProbabilityBundle(input: {
  geography: unknown;
  versionSet: ActiveStatisticalVersionSet;
  rows: unknown[];
}): ProbabilityBundle {
  const geography = GeographyResolutionSchema.parse(input.geography);
  const versionSet = ActiveStatisticalVersionSetSchema.parse(input.versionSet);
  const lockedIds = new Set(versionSet.datasetVersionIds);
  const rows = input.rows
    .map((row) => SpatialStatisticRowSchema.parse(row))
    .filter((row) => lockedIds.has(row.dataset_version_id));
  const metrics: Record<string, unknown> = {};

  for (const definition of Object.values(LONDON_NPC_METRIC_REGISTRY)) {
    let resolved: unknown = null;
    for (const [level, code] of geographyCandidates(geography)) {
      if (!definition.fallbackLevels.includes(level)) continue;
      const row = rows.find(
        (candidate) =>
          candidate.metric === definition.id &&
          candidate.geography_level === level &&
          candidate.geography_code === code,
      );
      if (!row) continue;
      const distribution = isUsable(row);
      if (!distribution) continue;
      resolved = StatisticalMetricResolutionSchema.parse({
        distribution,
        datasetVersionId: row.dataset_version_id,
        sourceRelease: row.source_release,
        transformVersion: row.transform_version,
        geographyLevel: row.geography_level,
        geographyCode: row.geography_code,
      });
      break;
    }
    if (!resolved && definition.required) {
      throw new SpatialStatisticsUnavailableError(definition.id);
    }
    if (resolved) metrics[definition.id] = resolved;
  }

  return ProbabilityBundleSchema.parse({
    compatibilitySetKey: versionSet.compatibilitySetKey,
    datasetVersionIds: versionSet.datasetVersionIds,
    metrics,
  });
}

export async function loadProbabilityBundle(input: {
  geography: unknown;
  resolveVersionSet: () => Promise<ActiveStatisticalVersionSet>;
  loadCandidates: (
    versionSet: ActiveStatisticalVersionSet,
  ) => Promise<SpatialStatisticRow[]>;
}) {
  const versionSet = await input.resolveVersionSet();
  const rows = await input.loadCandidates(versionSet);
  return buildProbabilityBundle({
    geography: input.geography,
    versionSet,
    rows,
  });
}
