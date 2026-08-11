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

const IdentitySchema = z
  .object({
    fictionalName: z.string().trim().min(2).max(100),
    age: z.number().int().min(18).max(90),
    ageBand: AgeBandSchema,
    pronouns: z.string().trim().min(2).max(40),
    culturalBackground: z.string().trim().min(2).max(160),
  })
  .strict();

const HouseholdSchema = z
  .object({
    householdType: z.string().trim().min(2).max(100),
    housingTenure: z.string().trim().min(2).max(100),
  })
  .strict();

const WorkSchema = z
  .object({
    economicActivity: z.string().trim().min(2).max(100),
    occupationCode: z.string().trim().min(2).max(40),
    occupationTitle: z.string().trim().min(2).max(120),
    employerType: z.string().trim().min(2).max(100),
    annualIncomeBand: z.string().trim().min(2).max(80),
  })
  .strict();

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

export const CanonicalNpcProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: IdentitySchema,
    household: HouseholdSchema,
    work: WorkSchema,
    dailyLife: DailyLifeSchema,
    appearance: AppearanceSchema,
    character: CharacterSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    const [minimumAge, maximumAge] = AGE_BAND_RANGES[profile.identity.ageBand];
    if (
      profile.identity.age < minimumAge ||
      profile.identity.age > maximumAge
    ) {
      context.addIssue({
        code: "custom",
        path: ["identity", "ageBand"],
        message: "Age does not match the selected age band.",
      });
    }
  });

export const NpcVersionSetSchema = z
  .object({
    datasetVersionIds: z.array(z.string().uuid()).min(1).max(16),
    probabilityEngineVersion: z.string().trim().min(1).max(80),
    promptVersion: z.string().trim().min(1).max(80),
    textModel: z.string().trim().min(1).max(120),
    imageModel: z.string().trim().min(1).max(120),
  })
  .strict();

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
export type NpcVersionSet = z.infer<typeof NpcVersionSetSchema>;
export type NpcCurrentState = z.infer<typeof NpcCurrentStateSchema>;
