import { describe, expect, it } from "vitest";

import { buildProbabilityBundle } from "./build-probability-bundle";
import { LONDON_NPC_METRIC_REGISTRY } from "./metric-registry";

const versionId = "11111111-1111-4111-8111-111111111111";
const geography = {
  lsoaCode: "E01000001",
  wardCode: "E05000001",
  boroughCode: "E09000001",
  fallbackLevel: "lsoa" as const,
};
const versionSet = {
  compatibilitySetKey: "london-v1",
  datasetVersionIds: [versionId],
  versions: [
    {
      id: versionId,
      source: "official-source",
      releaseLabel: "2025",
      transformVersion: "v1",
      compatibilitySetKey: "london-v1",
      metricIds: Object.keys(LONDON_NPC_METRIC_REGISTRY),
    },
  ],
};

function distribution(metricId: string, status = "usable") {
  const denominator =
    LONDON_NPC_METRIC_REGISTRY[
      metricId as keyof typeof LONDON_NPC_METRIC_REGISTRY
    ].denominator;
  return {
    metricId,
    denominator,
    conditions: {},
    categories:
      status === "usable"
        ? [
            { key: "one", label: "One", weight: 0.4 },
            { key: "two", label: "Two", weight: 0.6 },
          ]
        : [],
    quality: { status, note: status === "usable" ? null : "Suppressed" },
    sampleSize: status === "usable" ? 100 : null,
    reweighting: null,
  };
}

function row(
  metric: string,
  geographyLevel: "lsoa" | "borough" | "london",
  geographyCode: string,
  status = "usable",
) {
  return {
    dataset_version_id: versionId,
    source_release: "2025",
    transform_version: "v1",
    geography_level: geographyLevel,
    geography_code: geographyCode,
    metric,
    distribution: distribution(metric, status),
  };
}

function londonRows() {
  return Object.keys(LONDON_NPC_METRIC_REGISTRY).map((metric) =>
    row(metric, "london", "E12000007"),
  );
}

describe("probability bundle spatial fallback", () => {
  it("uses the finest usable geography per metric", () => {
    const bundle = buildProbabilityBundle({
      geography,
      versionSet,
      rows: [
        ...londonRows(),
        row("adult_age_sex", "borough", geography.boroughCode),
        row("adult_age_sex", "lsoa", geography.lsoaCode),
      ],
    });

    expect(bundle.metrics.adult_age_sex?.geographyLevel).toBe("lsoa");
    expect(bundle.metrics.ethnic_group?.geographyLevel).toBe("london");
  });

  it("skips a suppressed LSOA candidate and falls back to borough", () => {
    const bundle = buildProbabilityBundle({
      geography,
      versionSet,
      rows: [
        ...londonRows(),
        row("adult_age_sex", "borough", geography.boroughCode),
        row("adult_age_sex", "lsoa", geography.lsoaCode, "suppressed"),
      ],
    });

    expect(bundle.metrics.adult_age_sex?.geographyLevel).toBe("borough");
  });

  it("rejects a missing required London fallback", () => {
    expect(() =>
      buildProbabilityBundle({
        geography,
        versionSet,
        rows: londonRows().filter(
          (candidate) => candidate.metric !== "imd_decile",
        ),
      }),
    ).toThrow(/imd_decile/);
  });

  it("ignores candidate rows outside the locked version set", () => {
    const rows = londonRows();
    rows.push({
      ...row("adult_age_sex", "lsoa", geography.lsoaCode),
      dataset_version_id: "22222222-2222-4222-8222-222222222222",
    });
    const bundle = buildProbabilityBundle({ geography, versionSet, rows });

    expect(bundle.metrics.adult_age_sex?.geographyLevel).toBe("london");
  });
});
