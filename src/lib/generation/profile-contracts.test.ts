import { describe, expect, it } from "vitest";

import { ids, validCurrentState } from "../../../tests/fixtures/domain";
import { CompleteProfileNpcInputSchema } from "./profile-contracts";

const validProfileOnlyInput = {
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
      routine: "Walks to the library after breakfast and checks the local noticeboard.",
    },
    appearance: {
      presentation: "Comfortable layers, practical shoes, and a weatherproof coat.",
      clothing: ["navy raincoat"],
      possessions: ["canvas shopping bag"],
      portraitDescriptor: "Natural documentary portrait in soft London daylight.",
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
    imageModel: null,
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
} as const;

describe("CompleteProfileNpcInputSchema", () => {
  it("accepts a profile-only non-worker branch", () => {
    expect(
      CompleteProfileNpcInputSchema.parse(validProfileOnlyInput),
    ).toEqual(validProfileOnlyInput);
  });

  it("rejects a profile-only input that still uses a legacy version set", () => {
    const result = CompleteProfileNpcInputSchema.safeParse({
      ...validProfileOnlyInput,
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
});
