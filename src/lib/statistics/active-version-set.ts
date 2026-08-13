import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/lib/db/client";
import { areaStatistics, datasetVersions } from "@/lib/db/schema";

import {
  ActiveStatisticalVersionSetSchema,
  type ActiveStatisticalVersionSet,
} from "./contracts";
import { LONDON_NPC_METRIC_REGISTRY } from "./metric-registry";

const ActiveVersionRowSchema = z
  .object({
    id: z.string().uuid(),
    source: z.string(),
    release_label: z.string(),
    transform_version: z.string(),
    compatibility_set_key: z.string(),
    metric_ids: z.array(z.string()),
  })
  .strict();

export class ActiveStatisticsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActiveStatisticsUnavailableError";
  }
}

export function buildActiveVersionSet(
  input: unknown[],
): ActiveStatisticalVersionSet {
  const rows = input.map((row) => ActiveVersionRowSchema.parse(row));
  if (rows.length === 0) {
    throw new ActiveStatisticsUnavailableError(
      "No active compatible London statistics set is available.",
    );
  }

  const compatibilityKeys = new Set(
    rows.map((row) => row.compatibility_set_key),
  );
  if (compatibilityKeys.size !== 1) {
    throw new ActiveStatisticsUnavailableError(
      "Active London statistics do not share one compatibility set.",
    );
  }

  const sources = new Set<string>();
  const metricOwners = new Map<string, string>();
  for (const row of rows) {
    if (sources.has(row.source)) {
      throw new ActiveStatisticsUnavailableError(
        `Active source ${row.source} is duplicated.`,
      );
    }
    sources.add(row.source);
    for (const metricId of row.metric_ids) {
      if (metricOwners.has(metricId)) {
        throw new ActiveStatisticsUnavailableError(
          `Active metric ${metricId} has more than one source.`,
        );
      }
      metricOwners.set(metricId, row.source);
    }
  }

  for (const definition of Object.values(LONDON_NPC_METRIC_REGISTRY)) {
    if (definition.required && !metricOwners.has(definition.id)) {
      throw new ActiveStatisticsUnavailableError(
        `Required active metric ${definition.id} is missing.`,
      );
    }
  }

  const versions = rows
    .map((row) => ({
      id: row.id,
      source: row.source,
      releaseLabel: row.release_label,
      transformVersion: row.transform_version,
      compatibilitySetKey: row.compatibility_set_key,
      metricIds: [...row.metric_ids].sort(),
    }))
    .sort((left, right) => left.source.localeCompare(right.source));

  return ActiveStatisticalVersionSetSchema.parse({
    compatibilitySetKey: versions[0]?.compatibilitySetKey,
    datasetVersionIds: versions.map((version) => version.id),
    versions,
  });
}

export async function resolveActiveVersionSet(
  database: Pick<Database, "execute">,
) {
  const result = await database.execute(sql`
    SELECT
      version.id,
      version.source,
      version.release_label,
      version.transform_version,
      version.compatibility_set_key,
      array_agg(DISTINCT statistic.metric ORDER BY statistic.metric)
        FILTER (WHERE statistic.geography_level = 'london') AS metric_ids
    FROM ${datasetVersions} version
    INNER JOIN ${areaStatistics} statistic
      ON statistic.dataset_version_id = version.id
    WHERE version.state = 'active'
      AND version.compatibility_set_key IS NOT NULL
    GROUP BY version.id
    ORDER BY version.source
  `);

  return buildActiveVersionSet(result.rows);
}
