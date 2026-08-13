import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/lib/db/client";
import { areaStatistics, datasetVersions } from "@/lib/db/schema";
import { GeographyResolutionSchema } from "@/lib/location/contracts";

import {
  ActiveStatisticalVersionSetSchema,
  StatisticalGeographyLevelSchema,
} from "./contracts";
import { LONDON_NPC_METRIC_REGISTRY } from "./metric-registry";

const LONDON_REGION_CODE = "E12000007";

export const SpatialStatisticRowSchema = z
  .object({
    dataset_version_id: z.string().uuid(),
    source_release: z.string(),
    transform_version: z.string(),
    geography_level: StatisticalGeographyLevelSchema,
    geography_code: z.string(),
    metric: z.string(),
    distribution: z.unknown(),
  })
  .strict();

export type SpatialStatisticRow = z.infer<typeof SpatialStatisticRowSchema>;

export async function loadSpatialStatisticCandidates(
  database: Pick<Database, "execute">,
  input: {
    geography: z.input<typeof GeographyResolutionSchema>;
    versionSet: z.input<typeof ActiveStatisticalVersionSetSchema>;
  },
) {
  const geography = GeographyResolutionSchema.parse(input.geography);
  const versionSet = ActiveStatisticalVersionSetSchema.parse(input.versionSet);
  const metricIds = Object.keys(LONDON_NPC_METRIC_REGISTRY);
  const datasetVersionIds = versionSet.datasetVersionIds;
  const datasetVersionList = sql.join(
    datasetVersionIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const metricList = sql.join(
    metricIds.map((metricId) => sql`${metricId}`),
    sql`, `,
  );

  const result = await database.execute(sql`
    SELECT
      statistic.dataset_version_id,
      version.release_label AS source_release,
      version.transform_version,
      statistic.geography_level,
      statistic.geography_code,
      statistic.metric,
      statistic.distribution
    FROM ${areaStatistics} statistic
    INNER JOIN ${datasetVersions} version
      ON version.id = statistic.dataset_version_id
    WHERE statistic.dataset_version_id IN (${datasetVersionList})
      AND statistic.metric IN (${metricList})
      AND (
        (statistic.geography_level = 'lsoa'
          AND statistic.geography_code = ${geography.lsoaCode})
        OR (statistic.geography_level = 'ward'
          AND statistic.geography_code = ${geography.wardCode ?? ""})
        OR (statistic.geography_level = 'borough'
          AND statistic.geography_code = ${geography.boroughCode})
        OR (statistic.geography_level = 'london'
          AND statistic.geography_code = ${LONDON_REGION_CODE})
      )
  `);

  return result.rows.map((row) => SpatialStatisticRowSchema.parse(row));
}
