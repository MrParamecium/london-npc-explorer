import { describe, expect, it } from "vitest";

import { ids, validCurrentState } from "../../../tests/fixtures/domain";
import { CompleteFullNpcInputSchema } from "./profile-contracts";
import { PublicProfileNpcSchema } from "./public-profile-contracts";

const validFullInput = {
  jobId: ids.job,
  ownerId: "user_profile_only",
  locationId: ids.location,
  seed: "profile-only-7f3c1d89a2e6",
  canonicalProfile: {
    schemaVersion: 2,
    identity: {
      fictionalName: "Rowan Ellis",
      age: 72,
      ageBand: "65-plus",
      pronouns: "they/them",
      statisticalSex: "female",
      ethnicGroup: "White",
    },
    household: {
      householdType: "one_person",
      housingTenure: "owner_occupied",
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
    dailyLife: {
      education: "higher_education",
      commute: "not_applicable",
      routine:
        "Walks to the library after breakfast and checks the local noticeboard.",
    },
    appearance: {
      presentation:
        "Comfortable layers, practical shoes, and a weatherproof coat.",
      clothing: ["navy raincoat"],
      possessions: ["canvas shopping bag"],
      portraitDescriptor:
        "Natural documentary portrait in soft London daylight.",
    },
    character: {
      personalHistory: "Has lived in the borough for more than three decades.",
      values: ["independence"],
      speechStyle: "Measured and observant.",
      boundaries: ["does not share private medical details"],
    },
  },
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
    "Rowan is taking a quiet morning walk through the neighbourhood before visiting the library.",
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/job-a.png",
  estimatedCostUsd: 0.08,
} as const;

describe("CompleteFullNpcInputSchema", () => {
  it("accepts a full non-worker branch with a stored portrait and cost", () => {
    expect(CompleteFullNpcInputSchema.parse(validFullInput)).toEqual(
      validFullInput,
    );
  });

  it("rejects a full input without a stored portrait", () => {
    const result = CompleteFullNpcInputSchema.safeParse({
      ...validFullInput,
      portraitUrl: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a full input that still uses a legacy version set", () => {
    const result = CompleteFullNpcInputSchema.safeParse({
      ...validFullInput,
      versionSet: {
        datasetVersionIds: [ids.dataset],
        probabilityEngineVersion: "probability-v1",
        promptVersion: "npc-profile-v1",
        textModel: "mock-text-v1",
        imageModel: "mock-image-v1",
      },
    });

    expect(result.success).toBe(false);
  });

  it.each([-0.01, 100.01, Number.POSITIVE_INFINITY])(
    "rejects an invalid portrait cost of %s",
    (estimatedCostUsd) => {
      expect(
        CompleteFullNpcInputSchema.safeParse({
          ...validFullInput,
          estimatedCostUsd,
        }).success,
      ).toBe(false);
    },
  );
});

describe("PublicProfileNpcSchema", () => {
  const publicNpc = {
    npcId: ids.npc,
    locationId: ids.location,
    seed: validFullInput.seed,
    canonicalProfile: validFullInput.canonicalProfile,
    currentState: validFullInput.currentState,
    versionSet: validFullInput.versionSet,
    fieldProvenance: validFullInput.fieldProvenance,
    narrative: validFullInput.narrative,
    portraitUrl: validFullInput.portraitUrl,
    visibleAt: "2026-08-14T08:00:00.000Z",
    createdAt: "2026-08-14T08:00:00.000Z",
  };

  it("requires a portrait URL for every publicly visible NPC", () => {
    expect(PublicProfileNpcSchema.parse(publicNpc)).toEqual(publicNpc);
    expect(
      PublicProfileNpcSchema.safeParse({ ...publicNpc, portraitUrl: null })
        .success,
    ).toBe(false);
  });
});
