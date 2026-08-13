import { describe, expect, it } from "vitest";

import {
  assertMetricDependencyPolicy,
  LONDON_NPC_METRIC_REGISTRY,
} from "./metric-registry";

describe("London NPC metric registry", () => {
  it("contains the complete required V1 metric set", () => {
    expect(Object.keys(LONDON_NPC_METRIC_REGISTRY)).toHaveLength(11);
    expect(
      Object.values(LONDON_NPC_METRIC_REGISTRY).every(
        (metric) => metric.required,
      ),
    ).toBe(true);
  });

  it("contains no outgoing dependency from ethnic group", () => {
    expect(() =>
      assertMetricDependencyPolicy(LONDON_NPC_METRIC_REGISTRY),
    ).not.toThrow();
  });

  it("rejects ethnicity as a downstream condition", () => {
    expect(() =>
      assertMetricDependencyPolicy({
        ...LONDON_NPC_METRIC_REGISTRY,
        economic_activity: {
          ...LONDON_NPC_METRIC_REGISTRY.economic_activity,
          allowedConditions: ["ethnic_group"],
        },
      }),
    ).toThrow(/ethnic_group/);
  });
});
