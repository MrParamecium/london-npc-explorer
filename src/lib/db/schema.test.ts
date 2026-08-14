import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  appUsers,
  areaStatistics,
  conversations,
  datasetVersions,
  geographyBoundaries,
  generationJobs,
  locations,
  messages,
  npcMemories,
  npcs,
} from "./schema";

describe("database schema", () => {
  it("defines the V1 domain tables and official geography boundaries", () => {
    const tableNames = [
      appUsers,
      datasetVersions,
      geographyBoundaries,
      areaStatistics,
      locations,
      generationJobs,
      npcs,
      conversations,
      messages,
      npcMemories,
    ].map(getTableName);

    expect(tableNames).toEqual([
      "app_users",
      "dataset_versions",
      "geography_boundaries",
      "area_statistics",
      "locations",
      "npc_generation_jobs",
      "npcs",
      "conversations",
      "messages",
      "npc_memories",
    ]);
  });

  it("stores official boundaries as indexed WGS84 multipolygons", () => {
    const columns = getTableColumns(geographyBoundaries);

    expect(columns).toHaveProperty("datasetVersionId");
    expect(columns).toHaveProperty("geographyLevel");
    expect(columns).toHaveProperty("geographyCode");
    expect(columns).toHaveProperty("name");
    expect(columns).toHaveProperty("parentCode");
    expect(columns).toHaveProperty("boundary");

    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0001_magenta_korvac.sql"),
      "utf8",
    );

    expect(migration).toContain('"boundary" geometry(MultiPolygon,4326)');
    expect(migration).toContain(
      'CREATE INDEX "geography_boundaries_boundary_gist_idx"',
    );
  });

  it("stores only stable Google identifiers on a location", () => {
    const columns = getTableColumns(locations);

    expect(columns).toHaveProperty("googlePlaceId");
    expect(columns).toHaveProperty("panoramaId");
    expect(columns).not.toHaveProperty("displayName");
    expect(columns).not.toHaveProperty("formattedAddress");
    expect(columns).not.toHaveProperty("photoUrl");
  });

  it("stores generation mode, locked versions, provenance, and required portraits", () => {
    const jobColumns = getTableColumns(generationJobs);
    const npcColumns = getTableColumns(npcs);
    const datasetColumns = getTableColumns(datasetVersions);

    expect(jobColumns).toHaveProperty("mode");
    expect(jobColumns).toHaveProperty("versionSet");
    expect(npcColumns).toHaveProperty("fieldProvenance");
    expect(datasetColumns).toHaveProperty("compatibilitySetKey");
    expect(npcColumns.portraitUrl.notNull).toBe(true);

    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0004_require_npc_portraits.sql"),
      "utf8",
    );

    expect(migration).toContain(
      'ALTER TABLE "npcs" ALTER COLUMN "portrait_url" SET NOT NULL;',
    );
  });

  it("keeps PostGIS and WGS84 in the initial migration", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0000_initial_domain.sql"),
      "utf8",
    );

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS postgis");
    expect(migration).toContain('"coordinate" geometry(Point,4326) NOT NULL');
    expect(migration).toContain(
      'CREATE INDEX "locations_coordinate_gist_idx" ON "locations" USING gist',
    );
  });
});
