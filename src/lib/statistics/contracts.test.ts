import { describe, expect, it } from "vitest";

import {
  StatisticalDistributionSchema,
  WeightedCategoriesSchema,
} from "./contracts";

describe("statistical distribution contracts", () => {
  it("accepts a normalized usable distribution", () => {
    const result = StatisticalDistributionSchema.safeParse({
      metricId: "ethnic_group",
      denominator: "usual_residents",
      conditions: {},
      categories: [
        { key: "asian", label: "Asian", weight: 0.3 },
        { key: "black", label: "Black", weight: 0.2 },
        { key: "mixed", label: "Mixed", weight: 0.1 },
        { key: "white", label: "White", weight: 0.35 },
        { key: "other", label: "Other", weight: 0.05 },
      ],
      quality: { status: "usable", note: null },
      sampleSize: 1_000,
      reweighting: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative and duplicate category weights", () => {
    const result = WeightedCategoriesSchema.safeParse([
      { key: "one", label: "One", weight: 1 },
      { key: "one", label: "Duplicate", weight: -0.1 },
    ]);

    expect(result.success).toBe(false);
  });

  it("does not treat a suppressed distribution as usable", () => {
    const result = StatisticalDistributionSchema.safeParse({
      metricId: "employee_earnings",
      denominator: "employees",
      conditions: {},
      categories: [],
      quality: { status: "suppressed", note: "Source cell suppressed" },
      sampleSize: null,
      reweighting: null,
    });

    expect(result.success).toBe(true);
  });
});
