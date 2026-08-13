import { describe, expect, it } from "vitest";

import { validCanonicalProfile } from "../../../tests/fixtures/domain";
import {
  CanonicalNpcProfileSchema,
  NpcFieldProvenanceMapSchema,
  NpcVersionSetSchema,
} from "./contracts";

describe("CanonicalNpcProfileSchema", () => {
  it("accepts a complete canonical NPC profile", () => {
    expect(CanonicalNpcProfileSchema.parse(validCanonicalProfile)).toEqual(
      validCanonicalProfile,
    );
  });

  it("rejects an age that conflicts with its age band", () => {
    const result = CanonicalNpcProfileSchema.safeParse({
      ...validCanonicalProfile,
      identity: { ...validCanonicalProfile.identity, age: 52 },
    });

    expect(result.success).toBe(false);
  });

  it("requires visible appearance facts to remain structured", () => {
    const result = CanonicalNpcProfileSchema.safeParse({
      ...validCanonicalProfile,
      appearance: { ...validCanonicalProfile.appearance, clothing: [] },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a retired adult without fake work or income fields", () => {
    const result = CanonicalNpcProfileSchema.safeParse({
      ...validCanonicalProfile,
      schemaVersion: 2,
      identity: {
        fictionalName: validCanonicalProfile.identity.fictionalName,
        age: validCanonicalProfile.identity.age,
        ageBand: validCanonicalProfile.identity.ageBand,
        pronouns: validCanonicalProfile.identity.pronouns,
        statisticalSex: "female",
        ethnicGroup: "Black or Black British",
      },
      work: {
        branch: "retired",
        economicActivity: "retired",
        occupationCode: null,
        occupationTitle: null,
        employerType: null,
        workPattern: null,
        annualIncomeBand: null,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects employee fields on a retired branch", () => {
    const result = CanonicalNpcProfileSchema.safeParse({
      ...validCanonicalProfile,
      schemaVersion: 2,
      identity: {
        fictionalName: validCanonicalProfile.identity.fictionalName,
        age: validCanonicalProfile.identity.age,
        ageBand: validCanonicalProfile.identity.ageBand,
        pronouns: validCanonicalProfile.identity.pronouns,
        statisticalSex: "female",
        ethnicGroup: "Black or Black British",
      },
      work: {
        branch: "retired",
        economicActivity: "retired",
        occupationCode: "SOC-2452",
        occupationTitle: "Museum programme coordinator",
        employerType: null,
        workPattern: null,
        annualIncomeBand: null,
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts provider-free probability and template versions", () => {
    expect(
      NpcVersionSetSchema.parse({
        datasetVersionIds: ["22222222-2222-4222-8222-222222222222"],
        probabilityEngineVersion: "london-conditional-v1",
        templateVersion: "london-fiction-v1",
        textModel: null,
        imageModel: null,
      }),
    ).toBeTruthy();
  });

  it("requires provenance for structured leaf paths", () => {
    const result = NpcFieldProvenanceMapSchema.safeParse({
      "/identity/age": {
        kind: "statistical",
        datasetVersionId: "22222222-2222-4222-8222-222222222222",
        metric: "adult_age_sex",
        geographyLevel: "lsoa",
        geographyCode: "E01000001",
        sourceRelease: "mid-2024",
        transformVersion: "statistics-v1",
      },
    });

    expect(result.success).toBe(true);
  });
});
