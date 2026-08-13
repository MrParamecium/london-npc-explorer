import { readFile } from "node:fs/promises";

import { z } from "zod";

import { LONDON_NPC_METRIC_REGISTRY } from "../../src/lib/statistics/metric-registry";

export const SourceManifestEntrySchema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]+$/),
    publisher: z.string().min(2),
    canonicalUrl: z.url(),
    fileUrl: z.url(),
    datasetId: z.string().min(2),
    releaseLabel: z.string().min(2),
    sourcePublishedAt: z.iso.datetime(),
    observationDate: z.iso.date(),
    license: z.literal("OGL-3.0"),
    format: z.enum(["csv", "xlsx", "zip"]),
    byteSize: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    geographyCodeSystem: z.enum(["LSOA-2021", "LTLA-2021", "ITL1-2025"]),
    metricIds: z.array(z.string()).min(1),
    mappingId: z.string().regex(/^[a-z][a-z0-9_]+$/),
  })
  .strict()
  .superRefine((source, context) => {
    if (/\/latest(?:[/?#]|$)/i.test(source.fileUrl)) {
      context.addIssue({
        code: "custom",
        path: ["fileUrl"],
        message: "Source files must be pinned, not moving latest URLs.",
      });
    }
    for (const [index, metricId] of source.metricIds.entries()) {
      if (!(metricId in LONDON_NPC_METRIC_REGISTRY)) {
        context.addIssue({
          code: "custom",
          path: ["metricIds", index],
          message: `Unknown metric ${metricId}.`,
        });
      }
    }
  });

export const SourceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    compatibilitySetKey: z.string().regex(/^[a-z0-9-]+$/),
    retrievedAt: z.iso.datetime(),
    transformVersion: z.string().regex(/^[a-z0-9.-]+$/),
    sources: z.array(SourceManifestEntrySchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const sourceKeys = new Set<string>();
    const coveredMetrics = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      if (sourceKeys.has(source.key)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "key"],
          message: `Duplicate source key ${source.key}.`,
        });
      }
      sourceKeys.add(source.key);
      source.metricIds.forEach((metric) => coveredMetrics.add(metric));
    }

    for (const definition of Object.values(LONDON_NPC_METRIC_REGISTRY)) {
      if (definition.required && !coveredMetrics.has(definition.id)) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message: `Required metric ${definition.id} has no source.`,
        });
      }
    }
  });

export type SourceManifest = z.infer<typeof SourceManifestSchema>;
export type SourceManifestEntry = z.infer<typeof SourceManifestEntrySchema>;

export async function loadSourceManifest(path: string) {
  return SourceManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export const SOURCE_CATEGORY_MAPPINGS = {
  ons_sape_single_year_age_sex_v1: [
    "female_18_24",
    "female_25_34",
    "female_35_49",
    "female_50_64",
    "female_65_plus",
    "male_18_24",
    "male_25_34",
    "male_35_49",
    "male_50_64",
    "male_65_plus",
  ],
  census_ethnic_group_20a_v1: [
    "white_british",
    "white_irish",
    "white_gypsy_or_irish_traveller",
    "white_roma",
    "white_other",
    "mixed_white_asian",
    "mixed_white_black_african",
    "mixed_white_black_caribbean",
    "mixed_other",
    "asian_bangladeshi",
    "asian_chinese",
    "asian_indian",
    "asian_pakistani",
    "asian_other",
    "black_african",
    "black_caribbean",
    "black_other",
    "other_arab",
    "other_ethnic_group",
  ],
  census_economic_activity_v1: [
    "employee_full_time",
    "employee_part_time",
    "active_full_time_student",
    "self_employed_full_time",
    "self_employed_part_time",
    "unemployed",
    "long_term_sick_or_disabled",
    "carer",
    "other_inactive",
    "retired",
    "inactive_student",
  ],
  census_soc2020_major_group_v1: [
    "soc1_managers_directors_senior_officials",
    "soc2_professional",
    "soc3_associate_professional_technical",
    "soc4_administrative_secretarial",
    "soc5_skilled_trades",
    "soc6_caring_leisure_service",
    "soc7_sales_customer_service",
    "soc8_process_plant_machine",
    "soc9_elementary",
  ],
  census_travel_to_work_v1: [
    "work_from_home",
    "underground_metro_tram",
    "train",
    "bus_minibus_coach",
    "taxi",
    "motorcycle_scooter_moped",
    "drive_car_van",
    "passenger_car_van",
    "bicycle",
    "on_foot",
    "other",
  ],
  census_tenure_v1: [
    "owned_outright",
    "owned_mortgage",
    "shared_ownership",
    "social_rented_council",
    "social_rented_other",
    "private_rented_landlord",
    "private_rented_other",
    "rent_free",
  ],
  census_highest_qualification_v1: [
    "none",
    "level_1",
    "level_2",
    "apprenticeship",
    "level_3",
    "level_4_plus",
    "other",
  ],
  census_rm057_household_composition_v1: Array.from(
    { length: 14 },
    (_, index) => `household_${index + 1}`,
  ),
  ashe_annual_pay_percentiles_v1: [
    "below_12000",
    "12000_21999",
    "22000_25999",
    "26000_33999",
    "34000_45999",
    "46000_59999",
    "60000_94999",
    "95000_plus",
  ],
  imd2025_decile_v1: Array.from(
    { length: 10 },
    (_, index) => `decile_${index + 1}`,
  ),
} as const;

export function assertDocumentedMappings(manifest: SourceManifest) {
  for (const source of manifest.sources) {
    const categories =
      SOURCE_CATEGORY_MAPPINGS[
        source.mappingId as keyof typeof SOURCE_CATEGORY_MAPPINGS
      ];
    if (!categories || categories.length === 0) {
      throw new Error(
        `Source ${source.key} has no documented category mapping.`,
      );
    }
    if (new Set(categories).size !== categories.length) {
      throw new Error(`Source ${source.key} has duplicate mapped categories.`);
    }
  }
}
