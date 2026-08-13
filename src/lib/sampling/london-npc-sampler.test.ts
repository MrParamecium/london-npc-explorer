import { describe, expect, it } from "vitest";

import type {
  ProbabilityBundle,
  StatisticalMetricResolution,
} from "@/lib/statistics/contracts";
import { LONDON_NPC_METRIC_REGISTRY } from "@/lib/statistics/metric-registry";

import {
  assertSamplingDependencyPolicy,
  sampleLondonNpc,
} from "./london-npc-sampler";

const versionId = "11111111-1111-4111-8111-111111111111";

const defaults: Record<string, [string, string]> = {
  adult_age_sex: ["female_25_34", "Female, age 25-34"],
  ethnic_group: ["white_other", "Other White"],
  household_context: ["household_2", "One-person household: Other"],
  housing_tenure: [
    "private_rented_landlord",
    "Private landlord or letting agency",
  ],
  highest_qualification: ["level_4_plus", "Level 4 or above"],
  economic_activity: ["employee_full_time", "Employee, full-time"],
  occupation_major_group: ["soc2_professional", "Professional occupations"],
  work_pattern: ["full_time", "Full-time"],
  travel_to_work: ["train", "Train"],
  employee_earnings: ["percentile_40_60", "GBP 34,226 to 46,436"],
  imd_decile: ["decile_4", "IMD decile 4"],
};

function fixtureBundle(
  overrides: Record<string, [string, string]> = {},
): ProbabilityBundle {
  const values = { ...defaults, ...overrides };
  const metrics: Record<string, StatisticalMetricResolution> = {};
  for (const [metricId, [key, label]] of Object.entries(values)) {
    metrics[metricId] = {
      datasetVersionId: versionId,
      sourceRelease: "Fixture release",
      transformVersion: "v1",
      geographyLevel: "lsoa",
      geographyCode: "E01000001",
      distribution: {
        metricId,
        denominator:
          LONDON_NPC_METRIC_REGISTRY[
            metricId as keyof typeof LONDON_NPC_METRIC_REGISTRY
          ].denominator,
        conditions: {},
        categories: [{ key, label, weight: 1 }],
        quality: { status: "usable", note: null },
        sampleSize: 100,
        reweighting: null,
      },
    };
  }
  return {
    compatibilitySetKey: "fixture-v1",
    datasetVersionIds: [versionId],
    metrics,
  };
}

describe("London NPC sampler", () => {
  it("replays byte-equivalent profile output for one seed and bundle", () => {
    const input = { seed: "seed-00000001", bundle: fixtureBundle() };
    expect(JSON.stringify(sampleLondonNpc(input))).toBe(
      JSON.stringify(sampleLondonNpc(input)),
    );
  });

  it("keeps non-workers free of fake work and income values", () => {
    const sampled = sampleLondonNpc({
      seed: "seed-00000002",
      bundle: fixtureBundle({
        economic_activity: ["unemployed", "Unemployed"],
      }),
    });

    expect(sampled.canonicalProfile.work).toMatchObject({
      branch: "unemployed",
      occupationCode: null,
      occupationTitle: null,
      annualIncomeBand: null,
    });
    expect(sampled.canonicalProfile.dailyLife.commute).toBe(
      "No regular work commute",
    );
  });

  it("records spatial statistical provenance and template provenance", () => {
    const sampled = sampleLondonNpc({
      seed: "seed-00000003",
      bundle: fixtureBundle(),
    });

    expect(sampled.fieldProvenance["/identity/ethnicGroup"]).toMatchObject({
      kind: "statistical",
      metric: "ethnic_group",
      geographyLevel: "lsoa",
    });
    expect(sampled.fieldProvenance["/character/values"]?.kind).toBe("template");
  });

  it("rejects any direct dependency from ethnic group", () => {
    expect(() =>
      assertSamplingDependencyPolicy({ occupation: ["ethnic_group"] }),
    ).toThrow(/ethnic_group/);
  });

  it("changing only ethnicity leaves every downstream field unchanged", () => {
    const seed = "seed-00000004";
    const first = sampleLondonNpc({ seed, bundle: fixtureBundle() });
    const second = sampleLondonNpc({
      seed,
      bundle: fixtureBundle({
        ethnic_group: ["black_african", "Black African"],
      }),
    });
    const firstProfile = structuredClone(first.canonicalProfile);
    const secondProfile = structuredClone(second.canonicalProfile);
    firstProfile.identity.ethnicGroup = "redacted";
    secondProfile.identity.ethnicGroup = "redacted";

    expect(secondProfile).toEqual(firstProfile);
    expect(second.currentState).toEqual(first.currentState);
  });
});
