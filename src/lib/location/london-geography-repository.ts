import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/lib/db/client";
import { datasetVersions, geographyBoundaries } from "@/lib/db/schema";
import {
  CoordinatesSchema,
  OfficialGeographyLabelSchema,
  type Coordinates,
  type ResolvedGeography,
} from "@/lib/location/contracts";

const LONDON_REGION_CODE = "E12000007";

const BoundaryRowSchema = z
  .object({
    london_code: z.string().nullable(),
    lsoa_code: z.string().nullable(),
    lsoa_name: z.string().nullable(),
    lsoa_version: z.string().nullable(),
    ward_code: z.string().nullable(),
    ward_name: z.string().nullable(),
    ward_version: z.string().nullable(),
    borough_code: z.string().nullable(),
    borough_name: z.string().nullable(),
    borough_version: z.string().nullable(),
  })
  .strict();

type BoundaryRow = z.infer<typeof BoundaryRowSchema>;

export type LondonGeographyResult =
  | {
      supported: true;
      geography: ResolvedGeography;
      datasets: string[];
    }
  | {
      supported: false;
      geography: null;
      datasets: string[];
    };

function officialLabel(
  code: string | null,
  name: string | null,
  version: string | null,
) {
  if (!code || !name || !version) {
    return null;
  }

  return OfficialGeographyLabelSchema.parse({ code, name, version });
}

function datasetLabels(row: BoundaryRow) {
  const labels = [row.lsoa_version, row.ward_version, row.borough_version];
  if (labels.some((label) => !label)) {
    throw new Error("Official London boundary datasets are not active.");
  }

  return labels as string[];
}

export async function resolveLondonGeography(
  database: Pick<Database, "execute">,
  input: Coordinates,
): Promise<LondonGeographyResult> {
  const coordinates = CoordinatesSchema.parse(input);
  const rows = await database.execute(sql<BoundaryRow>`
    WITH point AS (
      SELECT ST_SetSRID(
        ST_MakePoint(${coordinates.longitude}, ${coordinates.latitude}),
        4326
      ) AS geom
    ), active_versions AS (
      SELECT
        max(release_label) FILTER (
          WHERE source = 'ons-lsoa-2021-boundaries'
        ) AS lsoa_version,
        max(release_label) FILTER (
          WHERE source = 'ons-wards-may-2026-boundaries'
        ) AS ward_version,
        max(release_label) FILTER (
          WHERE source = 'ons-lad-may-2025-boundaries'
        ) AS borough_version
      FROM ${datasetVersions}
      WHERE state = 'active'
    )
    SELECT
      london.geography_code AS london_code,
      lsoa.geography_code AS lsoa_code,
      lsoa.name AS lsoa_name,
      active_versions.lsoa_version,
      ward.geography_code AS ward_code,
      ward.name AS ward_name,
      active_versions.ward_version,
      borough.geography_code AS borough_code,
      borough.name AS borough_name,
      active_versions.borough_version
    FROM active_versions
    CROSS JOIN point
    LEFT JOIN LATERAL (
      SELECT boundary.geography_code
      FROM ${geographyBoundaries} boundary
      INNER JOIN ${datasetVersions} version
        ON version.id = boundary.dataset_version_id
       AND version.state = 'active'
       AND version.source = 'ons-lad-may-2025-boundaries'
      WHERE boundary.geography_level = 'london'
        AND boundary.geography_code = ${LONDON_REGION_CODE}
        AND ST_Covers(boundary.boundary, point.geom)
      LIMIT 1
    ) london ON true
    LEFT JOIN LATERAL (
      SELECT boundary.geography_code, boundary.name
      FROM ${geographyBoundaries} boundary
      INNER JOIN ${datasetVersions} version
        ON version.id = boundary.dataset_version_id
       AND version.state = 'active'
       AND version.source = 'ons-lsoa-2021-boundaries'
      WHERE boundary.geography_level = 'lsoa'
        AND ST_Covers(boundary.boundary, point.geom)
      ORDER BY ST_Area(boundary.boundary), boundary.geography_code
      LIMIT 1
    ) lsoa ON true
    LEFT JOIN LATERAL (
      SELECT boundary.geography_code, boundary.name
      FROM ${geographyBoundaries} boundary
      INNER JOIN ${datasetVersions} version
        ON version.id = boundary.dataset_version_id
       AND version.state = 'active'
       AND version.source = 'ons-wards-may-2026-boundaries'
      WHERE boundary.geography_level = 'ward'
        AND ST_Covers(boundary.boundary, point.geom)
      ORDER BY ST_Area(boundary.boundary), boundary.geography_code
      LIMIT 1
    ) ward ON true
    LEFT JOIN LATERAL (
      SELECT boundary.geography_code, boundary.name
      FROM ${geographyBoundaries} boundary
      INNER JOIN ${datasetVersions} version
        ON version.id = boundary.dataset_version_id
       AND version.state = 'active'
       AND version.source = 'ons-lad-may-2025-boundaries'
      WHERE boundary.geography_level = 'borough'
        AND ST_Covers(boundary.boundary, point.geom)
      ORDER BY ST_Area(boundary.boundary), boundary.geography_code
      LIMIT 1
    ) borough ON true
  `);

  const row = BoundaryRowSchema.parse(rows.rows[0]);
  const datasets = datasetLabels(row);

  if (!row.london_code) {
    return { supported: false, geography: null, datasets };
  }

  const lsoa = officialLabel(row.lsoa_code, row.lsoa_name, row.lsoa_version);
  const ward = officialLabel(row.ward_code, row.ward_name, row.ward_version);
  const borough = officialLabel(
    row.borough_code,
    row.borough_name,
    row.borough_version,
  );

  if (!lsoa || !borough) {
    throw new Error("Official London boundary coverage is incomplete.");
  }

  return {
    supported: true,
    geography: { lsoa, ward, borough },
    datasets,
  };
}
