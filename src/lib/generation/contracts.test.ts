import { describe, expect, it } from "vitest";

import { validCompletedGenerationJob } from "../../../tests/fixtures/domain";
import { GenerationJobSchema } from "./contracts";

describe("GenerationJobSchema", () => {
  it("accepts an atomically completed generation job", () => {
    expect(GenerationJobSchema.parse(validCompletedGenerationJob)).toEqual(
      validCompletedGenerationJob,
    );
  });

  it("rejects completed jobs without a portrait URL", () => {
    const result = GenerationJobSchema.safeParse({
      ...validCompletedGenerationJob,
      portraitUrl: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects visible NPCs on incomplete jobs", () => {
    const result = GenerationJobSchema.safeParse({
      ...validCompletedGenerationJob,
      status: "running",
      stage: "portrait",
    });

    expect(result.success).toBe(false);
  });
});
