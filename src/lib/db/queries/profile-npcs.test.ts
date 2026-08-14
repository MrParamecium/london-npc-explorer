import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  ids,
  validCanonicalProfileV2,
  validCurrentState,
} from "../../../../tests/fixtures/domain";
import { CompleteFullNpcInputSchema } from "../../generation/profile-contracts";

import type { Database } from "../client";
import {
  completeFullNpcAtomically,
  FullNpcCompletionConflict,
  getProfileNpcForOwner,
  listProfileNpcsForOwner,
} from "./profile-npcs";

const validFullInput = CompleteFullNpcInputSchema.parse({
  jobId: ids.job,
  ownerId: ids.user,
  locationId: ids.location,
  seed: "full-profile-7f3c1d89a2e6",
  canonicalProfile: validCanonicalProfileV2,
  currentState: validCurrentState,
  versionSet: {
    datasetVersionIds: [ids.dataset],
    probabilityEngineVersion: "london-conditional-v1",
    templateVersion: "london-fiction-v1",
    textModel: null,
    imageModel: "openai/gpt-image-2",
  },
  fieldProvenance: {
    "/identity/age": {
      kind: "statistical",
      datasetVersionId: ids.dataset,
      metric: "adult_age_sex",
      geographyLevel: "lsoa",
      geographyCode: "E01000001",
      sourceRelease: "mid-2024",
      transformVersion: "statistics-v1",
    },
  },
  narrative:
    "A fictional London resident is walking towards a scheduled museum programme.",
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/job-a.png",
  estimatedCostUsd: 0.08,
});

function renderSql(fragment: SQL) {
  return new PgDialect({ casing: "snake_case" }).sqlToQuery(fragment);
}

function createSelectRecorder(rows: unknown[]) {
  const joins: SQL[] = [];
  const filters: SQL[] = [];
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.innerJoin.mockImplementation((_table, condition: SQL) => {
    joins.push(condition);
    return builder;
  });
  builder.where.mockImplementation((condition: SQL) => {
    filters.push(condition);
    return builder;
  });
  builder.orderBy.mockReturnValue(builder);
  builder.limit.mockResolvedValue(rows);

  return {
    database: { select: vi.fn(() => builder) } as unknown as Database,
    joins,
    filters,
  };
}

describe("completeFullNpcAtomically", () => {
  it("inserts the portrait and completes only a running full job in one statement", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ job_id: ids.job, npc_id: ids.npc }],
    });

    await expect(
      completeFullNpcAtomically(
        { execute } as unknown as Database,
        validFullInput,
      ),
    ).resolves.toEqual({ jobId: ids.job, npcId: ids.npc });

    expect(execute).toHaveBeenCalledTimes(1);
    const query = renderSql(execute.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain("mode = 'full'");
    expect(query.sql).toContain("portrait_url");
    expect(query.sql).toContain("estimated_cost_usd");
    expect(query.sql).toContain("status = 'completed'");
    expect(query.sql).toContain("stage = 'completed'");
    expect(
      query.params.filter((value) => value === validFullInput.portraitUrl),
    ).toHaveLength(2);
    expect(query.params).toContain(validFullInput.estimatedCostUsd);
  });

  it("rejects a job that cannot be completed", async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Database;

    await expect(
      completeFullNpcAtomically(database, validFullInput),
    ).rejects.toBeInstanceOf(FullNpcCompletionConflict);
  });
});

describe("visible full NPC queries", () => {
  it("loads details only for a completed full job with a portrait", async () => {
    const recorder = createSelectRecorder([]);

    await expect(
      getProfileNpcForOwner(recorder.database, ids.user, ids.npc),
    ).resolves.toBeNull();

    const join = renderSql(recorder.joins[0]!);
    const filter = renderSql(recorder.filters[0]!);
    expect(join.params).toContain("completed");
    expect(join.params).toContain("full");
    expect(filter.sql).toContain('"npcs"."portrait_url" is not null');
  });

  it("lists only completed full jobs with portraits", async () => {
    const recorder = createSelectRecorder([]);

    await expect(
      listProfileNpcsForOwner(recorder.database, {
        ownerId: ids.user,
        limit: 20,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    const join = renderSql(recorder.joins[0]!);
    const filter = renderSql(recorder.filters[0]!);
    expect(join.params).toContain("completed");
    expect(join.params).toContain("full");
    expect(filter.sql).toContain('"npcs"."portrait_url" is not null');
  });
});
