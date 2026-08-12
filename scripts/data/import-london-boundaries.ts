import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  createDatabase,
  createNeonQuery,
  type Database,
} from "../../src/lib/db/client";
import { datasetVersions, geographyBoundaries } from "../../src/lib/db/schema";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "data/manifests/london-boundaries-v1.json",
);
const PAGE_SIZE = 1_000;
const INSERT_BATCH_SIZE = 75;
const LONDON_REGION_CODE = "E12000007";

const CommonSourceSchema = z.object({
  itemId: z.string().length(32),
  metadataSha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  featureServiceUrl: z.string().url(),
  objectIdField: z.string().min(1),
});

const ManifestSchema = z.object({
  transformVersion: z.string().min(1),
  license: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    attribution: z.string().min(1),
  }),
  lsoaLookup: CommonSourceSchema.extend({
    codeField: z.string().min(1),
    where: z.string().min(1),
    expectedCount: z.number().int().positive(),
  }),
  datasets: z
    .array(
      CommonSourceSchema.extend({
        source: z.string().min(1),
        releaseLabel: z.string().min(1),
        sourcePublishedAt: z.iso.datetime(),
        level: z.enum(["lsoa", "ward", "borough"]),
        codeField: z.string().min(1),
        nameField: z.string().min(1),
        parentCodeField: z.string().min(1).nullable(),
        where: z.string().min(1),
        geometryEnvelope: z.string().min(1).nullable(),
        expectedSourceCount: z.number().int().positive(),
        expectedImportedCount: z.number().int().positive(),
        selection: z.enum(["where", "lsoaLookup"]),
      }),
    )
    .length(3),
});

type Manifest = z.infer<typeof ManifestSchema>;
type Dataset = Manifest["datasets"][number];
type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = Position[][][];

type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };

type GeoJsonFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

type ImportRow = {
  code: string;
  name: string;
  parentCode: string | null;
  geometry: { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalMetadata(value: Record<string, unknown>) {
  return JSON.stringify({
    id: value.id,
    title: value.title,
    type: value.type,
    url: value.url,
    owner: value.owner,
    created: value.created,
    modified: value.modified,
    accessInformation: value.accessInformation,
    licenseInfo: value.licenseInfo,
  });
}

async function fetchJson(url: URL) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`ONS request failed with HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (body && typeof body === "object" && "error" in body && body.error) {
    throw new Error("ONS ArcGIS returned an error payload.");
  }

  return body;
}

async function verifyItemMetadata(
  source: Pick<Dataset, "itemId" | "metadataSha256">,
) {
  const url = new URL(
    `https://www.arcgis.com/sharing/rest/content/items/${source.itemId}`,
  );
  url.searchParams.set("f", "json");
  const metadata = (await fetchJson(url)) as Record<string, unknown>;
  const actual = sha256(canonicalMetadata(metadata));
  if (actual !== source.metadataSha256) {
    throw new Error(
      `ONS metadata changed for ${source.itemId}; review and update the manifest.`,
    );
  }
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function validatePolygon(
  coordinates: unknown,
): asserts coordinates is PolygonCoordinates {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length === 0 ||
    !coordinates.every(
      (ring) =>
        Array.isArray(ring) &&
        ring.length >= 4 &&
        ring.every(isPosition) &&
        ring[0]?.[0] === ring.at(-1)?.[0] &&
        ring[0]?.[1] === ring.at(-1)?.[1],
    )
  ) {
    throw new Error("ONS returned an invalid polygon geometry.");
  }
}

function normalizeGeometry(value: unknown): ImportRow["geometry"] {
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("ONS returned a feature without geometry.");
  }

  const geometry = value as { type: unknown; coordinates?: unknown };
  if (geometry.type === "Polygon") {
    validatePolygon(geometry.coordinates);
    return { type: "MultiPolygon", coordinates: [geometry.coordinates] };
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    for (const polygon of geometry.coordinates) {
      validatePolygon(polygon);
    }
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates as MultiPolygonCoordinates,
    };
  }

  throw new Error("ONS returned a non-polygon boundary geometry.");
}

function stringProperty(properties: Record<string, unknown>, field: string) {
  const value = properties[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`ONS feature is missing the ${field} property.`);
  }
  return value.trim();
}

async function fetchFeaturePages(
  source: Pick<
    Dataset,
    "featureServiceUrl" | "objectIdField" | "where" | "geometryEnvelope"
  >,
  outFields: string[],
  returnGeometry: boolean,
) {
  const features: GeoJsonFeature[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`${source.featureServiceUrl}/0/query`);
    url.searchParams.set("where", source.where);
    url.searchParams.set("outFields", outFields.join(","));
    url.searchParams.set("returnGeometry", String(returnGeometry));
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("orderByFields", source.objectIdField);
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
    url.searchParams.set("f", "geojson");
    if (source.geometryEnvelope) {
      url.searchParams.set("geometry", source.geometryEnvelope);
      url.searchParams.set("geometryType", "esriGeometryEnvelope");
      url.searchParams.set("inSR", "4326");
      url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    }

    const payload = (await fetchJson(url)) as { features?: GeoJsonFeature[] };
    const page = payload.features;
    if (!Array.isArray(page)) {
      throw new Error("ONS response did not contain a feature collection.");
    }

    features.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return features;
}

async function loadLsoaCodes(manifest: Manifest) {
  await verifyItemMetadata(manifest.lsoaLookup);
  const features = await fetchFeaturePages(
    { ...manifest.lsoaLookup, geometryEnvelope: null },
    [manifest.lsoaLookup.codeField],
    false,
  );
  const codes = new Set(
    features.map((feature) =>
      stringProperty(feature.properties, manifest.lsoaLookup.codeField),
    ),
  );
  if (codes.size !== manifest.lsoaLookup.expectedCount) {
    throw new Error(
      `Expected ${manifest.lsoaLookup.expectedCount} London LSOAs, received ${codes.size}.`,
    );
  }
  const contentSha256 = sha256(JSON.stringify([...codes].sort()));
  if (contentSha256 !== manifest.lsoaLookup.contentSha256) {
    throw new Error("The official London LSOA lookup content changed.");
  }
  return codes;
}

async function downloadDataset(dataset: Dataset, lsoaCodes: Set<string>) {
  await verifyItemMetadata(dataset);
  const outFields = [
    dataset.codeField,
    dataset.nameField,
    ...(dataset.parentCodeField ? [dataset.parentCodeField] : []),
  ];
  const sourceFeatures = await fetchFeaturePages(dataset, outFields, true);
  if (sourceFeatures.length !== dataset.expectedSourceCount) {
    throw new Error(
      `${dataset.source} expected ${dataset.expectedSourceCount} source features, received ${sourceFeatures.length}.`,
    );
  }

  const rows = sourceFeatures
    .map((feature): ImportRow => ({
      code: stringProperty(feature.properties, dataset.codeField),
      name: stringProperty(feature.properties, dataset.nameField),
      parentCode: dataset.parentCodeField
        ? stringProperty(feature.properties, dataset.parentCodeField)
        : null,
      geometry: normalizeGeometry(feature.geometry),
    }))
    .filter(
      (row) => dataset.selection !== "lsoaLookup" || lsoaCodes.has(row.code),
    )
    .sort((left, right) => left.code.localeCompare(right.code));

  if (rows.length !== dataset.expectedImportedCount) {
    throw new Error(
      `${dataset.source} expected ${dataset.expectedImportedCount} London features, received ${rows.length}.`,
    );
  }
  if (new Set(rows.map((row) => row.code)).size !== rows.length) {
    throw new Error(`${dataset.source} returned duplicate geography codes.`);
  }

  const contentSha256 = sha256(JSON.stringify(rows));
  if (contentSha256 !== dataset.contentSha256) {
    throw new Error(`${dataset.source} content changed; review the manifest.`);
  }

  return { rows, contentSha256 };
}

async function prepareVersion(
  database: Database,
  manifest: Manifest,
  dataset: Dataset,
  contentSha256: string,
) {
  const existing = await database.execute<{ id: string; state: string }>(sql`
    SELECT id, state
    FROM ${datasetVersions}
    WHERE source = ${dataset.source}
      AND release_label = ${dataset.releaseLabel}
      AND transform_version = ${manifest.transformVersion}
    LIMIT 1
  `);
  const previous = existing.rows[0];
  if (previous?.state === "active") {
    return { id: previous.id, alreadyActive: true };
  }
  if (previous) {
    await database.execute(sql`
      DELETE FROM ${datasetVersions} WHERE id = ${previous.id}
    `);
  }

  const inserted = await database.execute<{ id: string }>(sql`
    INSERT INTO ${datasetVersions} (
      source, release_label, transform_version, state,
      source_published_at, metadata
    ) VALUES (
      ${dataset.source}, ${dataset.releaseLabel}, ${manifest.transformVersion},
      'pending', ${dataset.sourcePublishedAt}::timestamptz,
      ${JSON.stringify({
        itemId: dataset.itemId,
        featureServiceUrl: dataset.featureServiceUrl,
        metadataSha256: dataset.metadataSha256,
        contentSha256,
        license: manifest.license,
      })}::jsonb
    )
    RETURNING id
  `);
  const version = inserted.rows[0];
  if (!version) {
    throw new Error(`Could not prepare ${dataset.source}.`);
  }
  return { id: version.id, alreadyActive: false };
}

async function insertRows(
  database: Database,
  dataset: Dataset,
  versionId: string,
  rows: ImportRow[],
) {
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
    await database.execute(sql`
      INSERT INTO ${geographyBoundaries} (
        dataset_version_id, geography_level, geography_code,
        name, parent_code, boundary
      )
      SELECT
        ${versionId}::uuid,
        ${dataset.level}::geography_level,
        item->>'code',
        item->>'name',
        nullif(item->>'parentCode', ''),
        ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(
              ST_SetSRID(ST_GeomFromGeoJSON(item->'geometry'), 4326)
            ),
            3
          )
        )
      FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) item
    `);
  }

  if (dataset.level === "borough") {
    await database.execute(sql`
      INSERT INTO ${geographyBoundaries} (
        dataset_version_id, geography_level, geography_code,
        name, parent_code, boundary
      )
      SELECT
        ${versionId}::uuid, 'london', ${LONDON_REGION_CODE},
        'London', NULL, ST_Multi(ST_UnaryUnion(ST_Collect(boundary)))
      FROM ${geographyBoundaries}
      WHERE dataset_version_id = ${versionId}::uuid
        AND geography_level = 'borough'
    `);
  }
}

async function validateVersion(
  database: Database,
  dataset: Dataset,
  versionId: string,
) {
  const expectedCount =
    dataset.expectedImportedCount + (dataset.level === "borough" ? 1 : 0);
  const inspection = await database.execute<{
    feature_count: number;
    invalid_count: number;
  }>(sql`
    SELECT
      count(*)::int AS feature_count,
      count(*) FILTER (
        WHERE NOT ST_IsValid(boundary) OR ST_IsEmpty(boundary)
      )::int AS invalid_count
    FROM ${geographyBoundaries}
    WHERE dataset_version_id = ${versionId}::uuid
  `);
  const result = inspection.rows[0];
  if (
    !result ||
    result.feature_count !== expectedCount ||
    result.invalid_count !== 0
  ) {
    throw new Error(`${dataset.source} failed PostGIS geometry validation.`);
  }
}

async function activateVersionsAtomically(
  targets: Array<{ id: string; source: string }>,
) {
  const client = createNeonQuery();
  const ids = targets.map((target) => target.id);
  const sources = targets.map((target) => target.source);
  const results = await client.transaction((transaction) => [
    transaction.query(
      `UPDATE dataset_versions
       SET state = 'superseded'
       WHERE source = ANY($1::text[])
         AND state = 'active'
         AND NOT (id = ANY($2::uuid[]))`,
      [sources, ids],
    ),
    transaction.query(
      `UPDATE dataset_versions
       SET state = 'active', imported_at = COALESCE(imported_at, now())
       WHERE id = ANY($1::uuid[])
         AND source = ANY($2::text[])
         AND state IN ('pending', 'active')
       RETURNING id`,
      [ids, sources],
    ),
  ]);

  const activated = results[1] as Array<{ id: string }>;
  if (activated.length !== targets.length) {
    throw new Error("The complete London boundary set could not be activated.");
  }
}

async function readManifest() {
  return ManifestSchema.parse(
    JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown,
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const manifest = await readManifest();
  const lsoaCodes = await loadLsoaCodes(manifest);
  const downloads = [];

  for (const dataset of manifest.datasets) {
    const downloaded = await downloadDataset(dataset, lsoaCodes);
    downloads.push({ dataset, ...downloaded });
    console.info(
      `${dataset.source}: ${downloaded.rows.length} features, sha256 ${downloaded.contentSha256}`,
    );
  }

  if (!apply) {
    console.info("Dry run complete. Re-run with --apply to import into Neon.");
    return;
  }

  const database = createDatabase();
  const targets: Array<{
    id: string;
    source: string;
    alreadyActive: boolean;
  }> = [];

  try {
    for (const { dataset, rows, contentSha256 } of downloads) {
      const version = await prepareVersion(
        database,
        manifest,
        dataset,
        contentSha256,
      );
      targets.push({
        id: version.id,
        source: dataset.source,
        alreadyActive: version.alreadyActive,
      });
      if (version.alreadyActive) {
        continue;
      }

      await insertRows(database, dataset, version.id, rows);
      await validateVersion(database, dataset, version.id);
      console.info(`${dataset.source}: imported and validated.`);
    }

    await activateVersionsAtomically(targets);
    console.info("All London boundary versions activated atomically.");
  } catch (error) {
    for (const target of targets.filter((target) => !target.alreadyActive)) {
      await database.execute(sql`
        UPDATE ${datasetVersions}
        SET state = 'failed'
        WHERE id = ${target.id}::uuid AND state = 'pending'
      `);
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  let current = error;
  let message = "Unknown import failure.";
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) {
      message = current.message;
      current = current.cause;
    } else {
      break;
    }
  }
  console.error(message);
  process.exitCode = 1;
});
