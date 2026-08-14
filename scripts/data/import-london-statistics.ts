import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

import { sql } from "drizzle-orm";
import unzipper from "unzipper";

import { createDatabase, createNeonQuery } from "../../src/lib/db/client";
import { areaStatistics, datasetVersions } from "../../src/lib/db/schema";
import { readLondonAsheAnnualPay } from "./importers/ashe-2025";
import { readLondonCensusWorkbook } from "./importers/census-2021";
import { downloadSource } from "./importers/download-source";
import { readLondonHouseholdComposition } from "./importers/household-composition";
import { readLondonImd } from "./importers/imd-2025";
import type { NormalizedStatistic } from "./importers/normalized-statistics";
import { readLondonPopulation } from "./importers/ons-population";
import { validateNormalizedRelease } from "./importers/validate-release";
import {
  assertDocumentedMappings,
  loadSourceManifest,
  type SourceManifestEntry,
} from "./source-registry";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "data/manifests/london-npc-statistics-v1.json",
);
const INSERT_BATCH_SIZE = 250;

type SourceRows = {
  source: SourceManifestEntry;
  rows: NormalizedStatistic[];
};

async function extractAsheWorkbook(zipPath: string) {
  const outputDirectory = resolve(
    process.cwd(),
    ".cache/statistics/v1/extracted",
  );
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, "ashe-table-8-7a-2025.xlsx");
  const archive = await unzipper.Open.file(zipPath);
  const entry = archive.files.find(
    (file) =>
      file.type === "File" && /Table 8\.7a.*2025\.xlsx$/i.test(file.path),
  );
  if (!entry) throw new Error("ASHE archive does not contain Table 8.7a.");
  await unlink(outputPath).catch(() => undefined);
  await pipeline(entry.stream(), createWriteStream(outputPath));
  return outputPath;
}

async function transformSource(source: SourceManifestEntry, path: string) {
  switch (source.key) {
    case "ons-sape-lsoa-2024":
      return readLondonPopulation(path);
    case "census-2021-ethnic-group":
    case "census-2021-economic-activity":
    case "census-2021-occupation":
    case "census-2021-travel-to-work":
    case "census-2021-tenure":
    case "census-2021-qualifications":
      return readLondonCensusWorkbook(path, source.key);
    case "census-2021-household-composition":
      return readLondonHouseholdComposition(path);
    case "ashe-2025-residence-earnings":
      return readLondonAsheAnnualPay(await extractAsheWorkbook(path));
    case "english-imd-2025":
      return readLondonImd(path);
    default:
      throw new Error(`No importer is registered for ${source.key}.`);
  }
}

async function prepareVersion(
  source: SourceManifestEntry,
  compatibilitySetKey: string,
  transformVersion: string,
) {
  const database = createDatabase();
  const existing = await database.execute<{ id: string; state: string }>(sql`
    SELECT id, state
    FROM ${datasetVersions}
    WHERE source = ${source.key}
      AND release_label = ${source.releaseLabel}
      AND transform_version = ${transformVersion}
    LIMIT 1
  `);
  const previous = existing.rows[0];
  if (previous?.state === "active") {
    return { id: previous.id, alreadyActive: true };
  }
  if (previous) {
    await database.execute(
      sql`DELETE FROM ${datasetVersions} WHERE id = ${previous.id}::uuid`,
    );
  }
  const inserted = await database.execute<{ id: string }>(sql`
    INSERT INTO ${datasetVersions} (
      source, release_label, transform_version, compatibility_set_key,
      state, source_published_at, metadata
    ) VALUES (
      ${source.key}, ${source.releaseLabel}, ${transformVersion},
      ${compatibilitySetKey}, 'pending', ${source.sourcePublishedAt}::timestamptz,
      ${JSON.stringify({
        canonicalUrl: source.canonicalUrl,
        fileUrl: source.fileUrl,
        datasetId: source.datasetId,
        observationDate: source.observationDate,
        license: source.license,
        sha256: source.sha256,
        byteSize: source.byteSize,
        geographyCodeSystem: source.geographyCodeSystem,
        mappingId: source.mappingId,
      })}::jsonb
    )
    RETURNING id
  `);
  const version = inserted.rows[0];
  if (!version) throw new Error(`Could not prepare ${source.key}.`);
  return { id: version.id, alreadyActive: false };
}

async function insertRows(versionId: string, rows: NormalizedStatistic[]) {
  const database = createDatabase();
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
    await database.execute(sql`
      INSERT INTO ${areaStatistics} (
        dataset_version_id, geography_level, geography_code,
        metric, dimensions, distribution, sample_size
      )
      SELECT
        ${versionId}::uuid,
        (item->>'geographyLevel')::geography_level,
        item->>'geographyCode',
        item->>'metricId',
        COALESCE(item->'distribution'->'conditions', '{}'::jsonb),
        item->'distribution',
        NULLIF(item->'distribution'->>'sampleSize', 'null')::integer
      FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) item
    `);
  }
  const count = await database.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count FROM ${areaStatistics}
    WHERE dataset_version_id = ${versionId}::uuid
  `);
  if (count.rows[0]?.count !== rows.length) {
    throw new Error(`Expected ${rows.length} imported rows for ${versionId}.`);
  }
}

async function activateVersionsAtomically(
  targets: Array<{ id: string; source: string }>,
  compatibilitySetKey: string,
) {
  const client = createNeonQuery();
  const ids = targets.map((target) => target.id);
  const sources = targets.map((target) => target.source);
  const results = await client.transaction((transaction) => [
    transaction.query(
      `UPDATE dataset_versions SET state = 'superseded'
       WHERE source = ANY($1::text[]) AND state = 'active'
       AND NOT (id = ANY($2::uuid[]))`,
      [sources, ids],
    ),
    transaction.query(
      `UPDATE dataset_versions
       SET state = 'active', imported_at = COALESCE(imported_at, now())
       WHERE id = ANY($1::uuid[])
         AND source = ANY($2::text[])
         AND compatibility_set_key = $3
         AND state IN ('pending', 'active')
       RETURNING id`,
      [ids, sources, compatibilitySetKey],
    ),
  ]);
  const activated = results[1] as Array<{ id: string }>;
  if (activated.length !== targets.length) {
    throw new Error("The complete statistics set could not be activated.");
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.info(
    `London statistics import starting in ${apply ? "apply" : "dry-run"} mode.`,
  );
  const manifest = await loadSourceManifest(MANIFEST_PATH);
  assertDocumentedMappings(manifest);
  console.info(
    `Manifest verified with ${manifest.sources.length} pinned source files.`,
  );
  const sources: SourceRows[] = [];

  for (const source of manifest.sources) {
    console.info(`${source.key}: checking verified local cache.`);
    const path = await downloadSource(source);
    console.info(`${source.key}: transforming ${basename(path)}.`);
    const rows = await transformSource(source, path);
    sources.push({ source, rows });
    console.info(
      `${source.key}: ${rows.length} normalized rows from ${basename(path)}.`,
    );
  }
  const validation = validateNormalizedRelease(
    sources.flatMap((source) => source.rows),
  );
  console.info(
    `Validated ${validation.rowCount} rows, ${validation.metricCount} metrics, ${validation.lsoaCount} LSOAs and ${validation.boroughCount} boroughs.`,
  );
  if (!apply) {
    console.info("Dry run complete. Re-run with --apply to import into Neon.");
    return;
  }

  const targets: Array<{
    id: string;
    source: string;
    alreadyActive: boolean;
  }> = [];
  try {
    for (const { source, rows } of sources) {
      const version = await prepareVersion(
        source,
        manifest.compatibilitySetKey,
        manifest.transformVersion,
      );
      targets.push({
        id: version.id,
        source: source.key,
        alreadyActive: version.alreadyActive,
      });
      if (!version.alreadyActive) await insertRows(version.id, rows);
      console.info(`${source.key}: imported and validated.`);
    }
    await activateVersionsAtomically(targets, manifest.compatibilitySetKey);
    console.info("All London statistics versions activated atomically.");
  } catch (error) {
    const database = createDatabase();
    for (const target of targets.filter((target) => !target.alreadyActive)) {
      await database.execute(sql`
        UPDATE ${datasetVersions} SET state = 'failed'
        WHERE id = ${target.id}::uuid AND state = 'pending'
      `);
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Unknown import failure.",
  );
  process.exitCode = 1;
});
