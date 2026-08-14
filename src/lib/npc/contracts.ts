import { z } from "zod";

export const AgeBandSchema = z.enum([
  "18-24",
  "25-34",
  "35-49",
  "50-64",
  "65-plus",
]);

const AGE_BAND_RANGES = {
  "18-24": [18, 24],
  "25-34": [25, 34],
  "35-49": [35, 49],
  "50-64": [50, 64],
  "65-plus": [65, 90],
} as const;

const LegacyIdentitySchema = z
  .object({
    fictionalName: z.string().trim().min(2).max(100),
    age: z.number().int().min(18).max(90),
    ageBand: AgeBandSchema,
    pronouns: z.string().trim().min(2).max(40),
    culturalBackground: z.string().trim().min(2).max(160),
  })
  .strict();

const StatisticalIdentitySchema = z
  .object({
    fictionalName: z.string().trim().min(2).max(100),
    age: z.number().int().min(18).max(90),
    ageBand: AgeBandSchema,
    pronouns: z.string().trim().min(2).max(40),
    statisticalSex: z.string().trim().min(2).max(80),
    ethnicGroup: z.string().trim().min(2).max(120),
  })
  .strict();

const HouseholdSchema = z
  .object({
    householdType: z.string().trim().min(2).max(100),
    housingTenure: z.string().trim().min(2).max(100),
  })
  .strict();

const LegacyWorkSchema = z
  .object({
    economicActivity: z.string().trim().min(2).max(100),
    occupationCode: z.string().trim().min(2).max(40),
    occupationTitle: z.string().trim().min(2).max(120),
    employerType: z.string().trim().min(2).max(100),
    annualIncomeBand: z.string().trim().min(2).max(80),
  })
  .strict();

const WorkPatternSchema = z.enum(["full_time", "part_time", "variable"]);
const EmployeeWorkSchema = z
  .object({
    branch: z.literal("employee"),
    economicActivity: z.string().trim().min(2).max(100),
    occupationCode: z.string().trim().min(2).max(40),
    occupationTitle: z.string().trim().min(2).max(120),
    employerType: z.string().trim().min(2).max(100),
    workPattern: WorkPatternSchema,
    annualIncomeBand: z.string().trim().min(2).max(80),
  })
  .strict();

const SelfEmployedWorkSchema = z
  .object({
    branch: z.literal("self_employed"),
    economicActivity: z.string().trim().min(2).max(100),
    occupationCode: z.string().trim().min(2).max(40),
    occupationTitle: z.string().trim().min(2).max(120),
    employerType: z.literal("self_employed"),
    workPattern: WorkPatternSchema,
    annualIncomeBand: z.string().trim().min(2).max(80).nullable(),
  })
  .strict();

const NonWorkingFields = {
  economicActivity: z.string().trim().min(2).max(100),
  occupationCode: z.null(),
  occupationTitle: z.null(),
  employerType: z.null(),
  workPattern: z.null(),
  annualIncomeBand: z.null(),
} as const;

const NonWorkingWorkSchema = z.union([
  z.object({ branch: z.literal("unemployed"), ...NonWorkingFields }).strict(),
  z.object({ branch: z.literal("student"), ...NonWorkingFields }).strict(),
  z.object({ branch: z.literal("retired"), ...NonWorkingFields }).strict(),
  z.object({ branch: z.literal("carer"), ...NonWorkingFields }).strict(),
  z
    .object({ branch: z.literal("other_inactive"), ...NonWorkingFields })
    .strict(),
]);

const CurrentWorkSchema = z.union([
  EmployeeWorkSchema,
  SelfEmployedWorkSchema,
  NonWorkingWorkSchema,
]);

const DailyLifeSchema = z
  .object({
    education: z.string().trim().min(2).max(100),
    commute: z.string().trim().min(2).max(100),
    routine: z.string().trim().min(12).max(500),
  })
  .strict();

const AppearanceSchema = z
  .object({
    presentation: z.string().trim().min(12).max(500),
    clothing: z.array(z.string().trim().min(2).max(120)).min(1).max(12),
    possessions: z.array(z.string().trim().min(2).max(120)).max(12),
    portraitDescriptor: z.string().trim().min(20).max(1_000),
  })
  .strict();

const CharacterSchema = z
  .object({
    personalHistory: z.string().trim().min(12).max(1_000),
    values: z.array(z.string().trim().min(2).max(120)).min(1).max(12),
    speechStyle: z.string().trim().min(8).max(500),
    boundaries: z.array(z.string().trim().min(4).max(240)).min(1).max(12),
  })
  .strict();

function assertAgeMatchesBand(
  profile: {
    identity: { age: number; ageBand: z.infer<typeof AgeBandSchema> };
  },
  context: z.RefinementCtx,
) {
  const [minimumAge, maximumAge] = AGE_BAND_RANGES[profile.identity.ageBand];
  if (profile.identity.age < minimumAge || profile.identity.age > maximumAge) {
    context.addIssue({
      code: "custom",
      path: ["identity", "ageBand"],
      message: "Age does not match the selected age band.",
    });
  }
}

const LegacyCanonicalNpcProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: LegacyIdentitySchema,
    household: HouseholdSchema,
    work: LegacyWorkSchema,
    dailyLife: DailyLifeSchema,
    appearance: AppearanceSchema,
    character: CharacterSchema,
  })
  .strict()
  .superRefine(assertAgeMatchesBand);

export const CanonicalNpcProfileV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    identity: StatisticalIdentitySchema,
    household: HouseholdSchema,
    work: CurrentWorkSchema,
    dailyLife: DailyLifeSchema,
    appearance: AppearanceSchema,
    character: CharacterSchema,
  })
  .strict()
  .superRefine(assertAgeMatchesBand);

export const CanonicalNpcProfileSchema = z.union([
  LegacyCanonicalNpcProfileSchema,
  CanonicalNpcProfileV2Schema,
]);

const LegacyNpcVersionSetSchema = z
  .object({
    datasetVersionIds: z.array(z.string().uuid()).min(1).max(16),
    probabilityEngineVersion: z.string().trim().min(1).max(80),
    promptVersion: z.string().trim().min(1).max(80),
    textModel: z.string().trim().min(1).max(120),
    imageModel: z.string().trim().min(1).max(120),
  })
  .strict();

export const NpcV2VersionSetSchema = z
  .object({
    datasetVersionIds: z.array(z.string().uuid()).min(1).max(16),
    probabilityEngineVersion: z.string().trim().min(1).max(80),
    templateVersion: z.string().trim().min(1).max(80),
    textModel: z.string().trim().min(1).max(120).nullable(),
    imageModel: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

export type NpcV2VersionSet = z.infer<typeof NpcV2VersionSetSchema>;

export const NpcVersionSetSchema = z.union([
  LegacyNpcVersionSetSchema,
  NpcV2VersionSetSchema,
]);

export const NpcFieldProvenanceSchema = z
  .object({
    kind: z.enum(["statistical", "rule", "template"]),
    datasetVersionId: z.string().uuid().nullable(),
    metric: z.string().trim().min(1).max(120).nullable(),
    geographyLevel: z.enum(["lsoa", "ward", "borough", "london"]).nullable(),
    geographyCode: z.string().trim().min(1).max(40).nullable(),
    sourceRelease: z.string().trim().min(1).max(160).nullable(),
    transformVersion: z.string().trim().min(1).max(80),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (provenance.kind === "statistical") {
      if (!provenance.datasetVersionId || !provenance.metric) {
        context.addIssue({
          code: "custom",
          path: ["kind"],
          message:
            "Statistical provenance requires a dataset version and metric.",
        });
      }
    }
  });

export const NpcFieldProvenanceMapSchema = z
  .record(z.string().regex(/^\/[A-Za-z0-9_/-]+$/), NpcFieldProvenanceSchema)
  .superRefine((map, context) => {
    if (Object.keys(map).length === 0) {
      context.addIssue({
        code: "custom",
        message: "Field provenance cannot be empty.",
      });
    }
  });

export const NpcCurrentStateSchema = z
  .object({
    currentTask: z.string().trim().min(2).max(500),
    reasonForLocation: z.string().trim().min(2).max(500),
    mood: z.string().trim().min(2).max(80),
    energy: z.enum(["low", "medium", "high"]),
    shortTermGoal: z.string().trim().min(2).max(500),
    relationshipState: z.string().trim().min(2).max(200),
    recentActions: z.array(z.string().trim().min(2).max(300)).max(20),
  })
  .strict();

export type CanonicalNpcProfile = z.infer<typeof CanonicalNpcProfileSchema>;
export type CanonicalNpcProfileV2 = z.infer<typeof CanonicalNpcProfileV2Schema>;
export type NpcVersionSet = z.infer<typeof NpcVersionSetSchema>;
export type NpcCurrentState = z.infer<typeof NpcCurrentStateSchema>;
export type NpcFieldProvenance = z.infer<typeof NpcFieldProvenanceSchema>;
export type NpcFieldProvenanceMap = z.infer<typeof NpcFieldProvenanceMapSchema>;
