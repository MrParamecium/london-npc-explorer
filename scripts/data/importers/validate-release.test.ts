import { describe, expect, it } from "vitest";

import { LONDON_NPC_METRIC_REGISTRY } from "../../../src/lib/statistics/metric-registry";
import { normalizeCounts } from "./normalized-statistics";
import { validateNormalizedRelease } from "./validate-release";

describe("normalized release validation", () => {
  it("requires every registry metric at London level", () => {
    const rows = Object.values(LONDON_NPC_METRIC_REGISTRY).map((metric) => ({
      geographyLevel: "london" as const,
      geographyCode: "E12000007",
      metricId: metric.id,
      distribution: normalizeCounts(metric.id, metric.denominator, [
        { key: "one", label: "One", count: 1 },
      ]),
    }));
    expect(validateNormalizedRelease(rows).metricCount).toBe(11);
    expect(() => validateNormalizedRelease(rows.slice(1))).toThrow(
      /Required London metric/,
    );
  });
});
