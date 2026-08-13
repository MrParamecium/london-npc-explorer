import { z } from "zod";

export const MetricIdSchema = z.string().regex(/^[a-z][a-z0-9_]{2,80}$/);
export const DistributionDenominatorSchema = z.enum([
  "adults_18_plus",
  "usual_residents",
  "person_weighted_adults",
  "households",
  "employees",
  "workers",
  "lsoa_area",
]);

export const WeightedCategorySchema = z
  .object({
    key: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(160),
    weight: z.number().finite().nonnegative(),
  })
  .strict();

export const WeightedCategoriesSchema = z
  .array(WeightedCategorySchema)
  .superRefine((categories, context) => {
    const keys = new Set<string>();
    for (const [index, category] of categories.entries()) {
      if (keys.has(category.key)) {
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "Distribution category keys must be unique.",
        });
      }
      keys.add(category.key);
    }
  });

export const DistributionQualitySchema = z
  .object({
    status: z.enum(["usable", "suppressed", "unreliable", "missing"]),
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

export const ReweightingSchema = z
  .object({
    method: z.string().trim().min(1).max(120),
    sourceMetric: MetricIdSchema,
    targetMetric: MetricIdSchema,
    convergenceTolerance: z.number().finite().positive(),
    iterations: z.number().int().min(0).max(10_000),
  })
  .strict();

export const StatisticalDistributionSchema = z
  .object({
    metricId: MetricIdSchema,
    denominator: DistributionDenominatorSchema,
    conditions: z.record(z.string(), z.string()),
    categories: WeightedCategoriesSchema,
    quality: DistributionQualitySchema,
    sampleSize: z.number().int().nonnegative().nullable(),
    reweighting: ReweightingSchema.nullable(),
  })
  .strict()
  .superRefine((distribution, context) => {
    if (distribution.quality.status !== "usable") return;

    if (distribution.categories.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "A usable distribution requires categories.",
      });
      return;
    }

    const total = distribution.categories.reduce(
      (sum, category) => sum + category.weight,
      0,
    );
    if (Math.abs(total - 1) > 0.000001) {
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "A usable distribution must normalize to one.",
      });
    }
  });

export const StatisticalGeographyLevelSchema = z.enum([
  "lsoa",
  "ward",
  "borough",
  "london",
]);

export const StatisticalMetricResolutionSchema = z
  .object({
    distribution: StatisticalDistributionSchema,
    datasetVersionId: z.string().uuid(),
    sourceRelease: z.string().trim().min(1).max(160),
    transformVersion: z.string().trim().min(1).max(80),
    geographyLevel: StatisticalGeographyLevelSchema,
    geographyCode: z.string().trim().min(1).max(40),
  })
  .strict();

export type WeightedCategory = z.infer<typeof WeightedCategorySchema>;
export type StatisticalDistribution = z.infer<
  typeof StatisticalDistributionSchema
>;
export type StatisticalMetricResolution = z.infer<
  typeof StatisticalMetricResolutionSchema
>;
