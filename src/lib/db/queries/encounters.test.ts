import { describe, expect, it } from "vitest";

import { validCompleteEncounter } from "../../../../tests/fixtures/domain";
import { CompleteEncounterInputSchema } from "../../generation/encounter-contracts";

describe("CompleteEncounterInputSchema", () => {
  it("accepts a fully linked encounter", () => {
    expect(CompleteEncounterInputSchema.parse(validCompleteEncounter)).toEqual(
      validCompleteEncounter,
    );
  });

  it("rejects a later initial memory version", () => {
    const result = CompleteEncounterInputSchema.safeParse({
      ...validCompleteEncounter,
      initialMemory: { ...validCompleteEncounter.initialMemory, version: 2 },
    });

    expect(result.success).toBe(false);
  });

  it("rejects incomplete version provenance", () => {
    const result = CompleteEncounterInputSchema.safeParse({
      ...validCompleteEncounter,
      versionSet: {
        ...validCompleteEncounter.versionSet,
        datasetVersionIds: [],
      },
    });

    expect(result.success).toBe(false);
  });
});
