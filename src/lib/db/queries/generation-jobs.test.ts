import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { ids } from "../../../../tests/fixtures/domain";

import type { Database } from "../client";
import { markGenerationJobStage } from "./generation-jobs";

function renderSql(fragment: SQL) {
  return new PgDialect({ casing: "snake_case" }).sqlToQuery(fragment);
}

describe("markGenerationJobStage", () => {
  it.each(["profile", "portrait", "persistence"] as const)(
    "moves a running unfinished job to the %s stage",
    async (stage) => {
      let updateValues: Record<string, unknown> | undefined;
      let whereClause: SQL | undefined;
      const row = { id: ids.job, ownerId: ids.user, stage };
      const builder = {
        set: vi.fn(),
        where: vi.fn(),
        returning: vi.fn(),
      };
      builder.set.mockImplementation((values) => {
        updateValues = values;
        return builder;
      });
      builder.where.mockImplementation((condition: SQL) => {
        whereClause = condition;
        return builder;
      });
      builder.returning.mockResolvedValue([row]);
      const database = {
        update: vi.fn(() => builder),
      } as unknown as Database;

      await expect(
        markGenerationJobStage(database, ids.user, ids.job, stage),
      ).resolves.toEqual(row);

      expect(updateValues).toMatchObject({ stage });
      expect(updateValues?.updatedAt).toBeInstanceOf(Date);
      const query = renderSql(whereClause!);
      expect(query.params).toEqual(
        expect.arrayContaining([ids.user, ids.job, "running"]),
      );
      expect(query.sql).toContain(
        '"npc_generation_jobs"."result_npc_id" is null',
      );
    },
  );

  it("returns null when a job is not eligible for a stage update", async () => {
    const builder = {
      set: vi.fn(),
      where: vi.fn(),
      returning: vi.fn(),
    };
    builder.set.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.returning.mockResolvedValue([]);
    const database = {
      update: vi.fn(() => builder),
    } as unknown as Database;

    await expect(
      markGenerationJobStage(database, ids.user, ids.job, "portrait"),
    ).resolves.toBeNull();
  });
});
