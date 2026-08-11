export const ids = {
  user: "user_2mockLondonExplorer",
  location: "11111111-1111-4111-8111-111111111111",
  dataset: "22222222-2222-4222-8222-222222222222",
  job: "33333333-3333-4333-8333-333333333333",
  npc: "44444444-4444-4444-8444-444444444444",
  conversation: "55555555-5555-4555-8555-555555555555",
} as const;

export const validLocation = {
  id: ids.location,
  coordinates: {
    latitude: 51.5202,
    longitude: -0.0979,
  },
  geography: {
    lsoaCode: "E01000001",
    wardCode: "E05000001",
    boroughCode: "E09000001",
    fallbackLevel: "lsoa",
  },
  googlePlaceId: null,
  panoramaId: null,
  inspectedAt: "2026-08-11T09:00:00.000Z",
} as const;

export const validCanonicalProfile = {
  schemaVersion: 1,
  identity: {
    fictionalName: "Amara Okafor",
    age: 31,
    ageBand: "25-34",
    pronouns: "she/her",
    culturalBackground: "Black British, Nigerian heritage",
  },
  household: {
    householdType: "shared_private_rental",
    housingTenure: "private_rent",
  },
  work: {
    economicActivity: "employed",
    occupationCode: "SOC-2452",
    occupationTitle: "Museum programme coordinator",
    employerType: "charity",
    annualIncomeBand: "GBP 38k-44k",
  },
  dailyLife: {
    education: "undergraduate_degree",
    commute: "bus_and_walk",
    routine: "Coordinates school visits and evening community workshops.",
  },
  appearance: {
    presentation: "Practical, neat, slightly rain-marked after commuting.",
    clothing: ["olive field jacket", "navy knit", "worn trainers"],
    possessions: ["leather tote", "staff lanyard"],
    portraitDescriptor:
      "Documentary waist-up portrait in natural overcast London light.",
  },
  character: {
    personalHistory: "Moved across north London for work and shared housing.",
    values: ["public access", "reliability"],
    speechStyle: "Warm, concise, and attentive to time.",
    boundaries: ["does not disclose visitor details"],
  },
} as const;

export const validCurrentState = {
  currentTask: "Preparing a school group for the next gallery session.",
  reasonForLocation: "Walking from the bus stop to the museum entrance.",
  mood: "focused",
  energy: "medium",
  shortTermGoal: "Reach the entrance before the group coordinator calls.",
  relationshipState: "Has not met the user before.",
  recentActions: ["Checked the bus arrival time", "Bought a takeaway coffee"],
} as const;

export const validVersionSet = {
  datasetVersionIds: [ids.dataset],
  probabilityEngineVersion: "probability-v1",
  promptVersion: "npc-profile-v1",
  textModel: "mock-text-v1",
  imageModel: "mock-image-v1",
} as const;

export const validAgentReply = {
  speech: "I have a few minutes before the next group arrives.",
  action: "Checks the time on her phone and shifts the tote on her shoulder.",
  emotion: "mildly_rushed",
  memory_update: "The user is looking for a quieter route east.",
} as const;

export const validMemory = {
  version: 1,
  durableSummary: "The user prefers quieter walking routes.",
  facts: [
    {
      key: "route_preference",
      value: "quiet",
      learnedAt: "2026-08-11T09:05:00.000Z",
    },
  ],
} as const;

export const validCompletedGenerationJob = {
  id: ids.job,
  ownerId: ids.user,
  locationId: ids.location,
  idempotencyKey: "generate-51.5202--0.0979-seed-0042",
  seed: "0042-7f3c1d89a2e6",
  status: "completed",
  stage: "completed",
  retryCount: 0,
  estimatedCostUsd: 0.08,
  visibleNpcId: ids.npc,
  portraitUrl: "https://example.com/portraits/am-okafor.webp",
  failure: null,
  createdAt: "2026-08-11T09:00:00.000Z",
  updatedAt: "2026-08-11T09:01:00.000Z",
} as const;

export const validCompleteEncounter = {
  jobId: ids.job,
  ownerId: ids.user,
  locationId: ids.location,
  seed: "0042-7f3c1d89a2e6",
  canonicalProfile: validCanonicalProfile,
  currentState: validCurrentState,
  versionSet: validVersionSet,
  narrative:
    "Amara is on her way to prepare a museum programme for a visiting school group.",
  portraitUrl: "https://example.com/portraits/am-okafor.webp",
  initialMemory: validMemory,
} as const;
