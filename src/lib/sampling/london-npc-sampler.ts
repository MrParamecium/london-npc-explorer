import {
  CanonicalNpcProfileV2Schema,
  NpcCurrentStateSchema,
  NpcFieldProvenanceMapSchema,
  type NpcFieldProvenance,
  type NpcFieldProvenanceMap,
} from "@/lib/npc/contracts";
import {
  buildCurrentStateTemplates,
  buildTemplateProfileFields,
  LONDON_NPC_TEMPLATE_VERSION,
  pickEmployer,
  pickFictionalName,
  pickOccupation,
} from "@/lib/npc/template-library";
import {
  ProbabilityBundleSchema,
  type ProbabilityBundle,
  type StatisticalMetricResolution,
  type WeightedCategory,
} from "@/lib/statistics/contracts";

import {
  activityCompatible,
  drawCompatible,
  householdCompatible,
} from "./compatibility";
import { namedInteger, namedRandom } from "./deterministic-random";
import { weightedDraw } from "./weighted-draw";

export const PROBABILITY_ENGINE_VERSION = "london-probability-v1";

export const DIRECT_DEPENDENCIES = {
  household_context: ["adult_age_sex"],
  housing_tenure: ["household_context"],
  highest_qualification: [],
  economic_activity: ["adult_age_sex"],
  occupation_major_group: ["economic_activity"],
  work_pattern: ["economic_activity"],
  employee_earnings: ["economic_activity"],
  travel_to_work: ["economic_activity"],
} as const;

export function assertSamplingDependencyPolicy(
  graph: Record<string, readonly string[]>,
) {
  for (const [target, dependencies] of Object.entries(graph)) {
    if (dependencies.includes("ethnic_group")) {
      throw new Error(`${target} cannot depend on ethnic_group.`);
    }
  }
}

assertSamplingDependencyPolicy(DIRECT_DEPENDENCIES);

type WorkBranch =
  | "employee"
  | "self_employed"
  | "unemployed"
  | "student"
  | "retired"
  | "carer"
  | "other_inactive";

const AGE_RANGES = {
  "18-24": [18, 24],
  "25-34": [25, 34],
  "35-49": [35, 49],
  "50-64": [50, 64],
  "65-plus": [65, 90],
} as const;

function metric(bundle: ProbabilityBundle, metricId: string) {
  const resolution = bundle.metrics[metricId];
  if (!resolution)
    throw new Error(`Probability metric ${metricId} is missing.`);
  return resolution;
}

function draw(seed: string, resolution: StatisticalMetricResolution) {
  return weightedDraw(
    resolution.distribution.categories,
    namedRandom(seed, `stat/${resolution.distribution.metricId}`),
  );
}

function parseAgeSex(category: WeightedCategory) {
  const match = /^(female|male)_(18_24|25_34|35_49|50_64|65_plus)$/.exec(
    category.key,
  );
  if (!match)
    throw new Error(`Invalid adult age/sex category ${category.key}.`);
  const ageBand = match[2]!.replaceAll("_", "-") as keyof typeof AGE_RANGES;
  return {
    statisticalSex: match[1] === "female" ? "Female" : "Male",
    ageBand,
    range: AGE_RANGES[ageBand],
  };
}

function branchForActivity(categoryKey: string): WorkBranch {
  if (categoryKey.startsWith("employee_")) return "employee";
  if (categoryKey.startsWith("self_employed_")) return "self_employed";
  if (categoryKey === "unemployed") return "unemployed";
  if (categoryKey.includes("student")) return "student";
  if (categoryKey === "retired") return "retired";
  if (categoryKey === "carer") return "carer";
  return "other_inactive";
}

function economicActivityLabel(branch: WorkBranch, sourceLabel: string) {
  if (branch === "employee") return "Employee";
  if (branch === "self_employed") return "Self-employed";
  return sourceLabel;
}

function statisticalProvenance(
  resolution: StatisticalMetricResolution,
): NpcFieldProvenance {
  return {
    kind: "statistical",
    datasetVersionId: resolution.datasetVersionId,
    metric: resolution.distribution.metricId,
    geographyLevel: resolution.geographyLevel,
    geographyCode: resolution.geographyCode,
    sourceRelease: resolution.sourceRelease,
    transformVersion: resolution.transformVersion,
  };
}

function derivedProvenance(): NpcFieldProvenance {
  return {
    kind: "rule",
    datasetVersionId: null,
    metric: null,
    geographyLevel: null,
    geographyCode: null,
    sourceRelease: null,
    transformVersion: PROBABILITY_ENGINE_VERSION,
  };
}

function templateProvenance(): NpcFieldProvenance {
  return {
    kind: "template",
    datasetVersionId: null,
    metric: null,
    geographyLevel: null,
    geographyCode: null,
    sourceRelease: null,
    transformVersion: LONDON_NPC_TEMPLATE_VERSION,
  };
}

function assign(
  target: NpcFieldProvenanceMap,
  paths: readonly string[],
  value: NpcFieldProvenance,
) {
  for (const path of paths) target[path] = value;
}

export function sampleLondonNpc(input: {
  seed: string;
  bundle: ProbabilityBundle;
}) {
  const bundle = ProbabilityBundleSchema.parse(input.bundle);
  const seed = input.seed;
  const ageSexResolution = metric(bundle, "adult_age_sex");
  const ageSex = parseAgeSex(draw(seed, ageSexResolution));
  const [minimumAge, maximumAge] = ageSex.range;
  const age = namedInteger(
    seed,
    "rule/identity/exact-age",
    minimumAge,
    maximumAge,
  );
  const ethnicResolution = metric(bundle, "ethnic_group");
  const ethnicGroup = draw(seed, ethnicResolution);
  const householdResolution = metric(bundle, "household_context");
  const household = drawCompatible(
    seed,
    "household_context",
    householdResolution.distribution.categories,
    (category) => householdCompatible(category.key, age),
  );
  const tenureResolution = metric(bundle, "housing_tenure");
  const tenure = draw(seed, tenureResolution);
  const qualificationResolution = metric(bundle, "highest_qualification");
  const qualification = draw(seed, qualificationResolution);
  const activityResolution = metric(bundle, "economic_activity");
  const activity = drawCompatible(
    seed,
    "economic_activity",
    activityResolution.distribution.categories,
    (category) => activityCompatible(category.key, age),
  );
  const branch = branchForActivity(activity.key);
  const templateFields = buildTemplateProfileFields(seed);

  let work: Record<string, unknown>;
  let commute = "No regular work commute";
  let occupationResolution: StatisticalMetricResolution | null = null;
  let patternResolution: StatisticalMetricResolution | null = null;
  let earningsResolution: StatisticalMetricResolution | null = null;
  let commuteResolution: StatisticalMetricResolution | null = null;

  if (branch === "employee" || branch === "self_employed") {
    occupationResolution = metric(bundle, "occupation_major_group");
    const occupationGroup = draw(seed, occupationResolution);
    const occupation = pickOccupation(seed, occupationGroup.key);
    patternResolution = metric(bundle, "work_pattern");
    const pattern = draw(seed, patternResolution);
    commuteResolution = metric(bundle, "travel_to_work");
    const commuteCategory = draw(seed, commuteResolution);
    commute = commuteCategory.label;
    const common = {
      branch,
      economicActivity: economicActivityLabel(branch, activity.label),
      occupationCode: occupation.code,
      occupationTitle: occupation.title,
      employerType:
        branch === "employee" ? pickEmployer(seed) : "self_employed",
      workPattern: pattern.key,
    };
    if (branch === "employee") {
      earningsResolution = metric(bundle, "employee_earnings");
      work = {
        ...common,
        annualIncomeBand: draw(seed, earningsResolution).label,
      };
    } else {
      work = { ...common, annualIncomeBand: null };
    }
  } else {
    work = {
      branch,
      economicActivity: economicActivityLabel(branch, activity.label),
      occupationCode: null,
      occupationTitle: null,
      employerType: null,
      workPattern: null,
      annualIncomeBand: null,
    };
  }

  const fictionalName = pickFictionalName(seed);
  const pronouns = ["they/them", "she/her", "he/him"][
    namedInteger(seed, "template/identity/pronouns", 0, 2)
  ]!;
  const canonicalProfile = CanonicalNpcProfileV2Schema.parse({
    schemaVersion: 2,
    identity: {
      fictionalName,
      age,
      ageBand: ageSex.ageBand,
      pronouns,
      statisticalSex: ageSex.statisticalSex,
      ethnicGroup: ethnicGroup.label,
    },
    household: {
      householdType: household.label,
      housingTenure: tenure.label,
    },
    work,
    dailyLife: {
      education: qualification.label,
      commute,
      routine:
        branch === "employee" || branch === "self_employed"
          ? `Balances ${work.occupationTitle} work with ordinary travel, errands and time at home.`
          : "Structures the day around practical responsibilities, local travel and time at home.",
    },
    appearance: {
      presentation: templateFields.presentation,
      clothing: templateFields.clothing,
      possessions: templateFields.possessions,
      portraitDescriptor:
        "Natural documentary-style waist-up portrait in ordinary London daylight, with realistic skin texture and no beauty retouching.",
    },
    character: {
      personalHistory: templateFields.personalHistory,
      values: templateFields.values,
      speechStyle: templateFields.speechStyle,
      boundaries: templateFields.boundaries,
    },
  });
  const currentState = NpcCurrentStateSchema.parse(
    buildCurrentStateTemplates(seed, branch),
  );
  const imdResolution = metric(bundle, "imd_decile");
  const imd = draw(seed, imdResolution);
  const narrative = `${fictionalName} is one fictional adult sampled from the configured local distributions. ${currentState.currentTask} The selected neighbourhood is recorded as ${imd.label}.`;

  const fieldProvenance: NpcFieldProvenanceMap = {};
  assign(
    fieldProvenance,
    ["/identity/ageBand", "/identity/statisticalSex"],
    statisticalProvenance(ageSexResolution),
  );
  assign(fieldProvenance, ["/identity/age"], derivedProvenance());
  assign(
    fieldProvenance,
    ["/identity/ethnicGroup"],
    statisticalProvenance(ethnicResolution),
  );
  assign(
    fieldProvenance,
    ["/household/householdType"],
    statisticalProvenance(householdResolution),
  );
  assign(
    fieldProvenance,
    ["/household/housingTenure"],
    statisticalProvenance(tenureResolution),
  );
  assign(
    fieldProvenance,
    ["/dailyLife/education"],
    statisticalProvenance(qualificationResolution),
  );
  assign(
    fieldProvenance,
    ["/work/branch", "/work/economicActivity"],
    statisticalProvenance(activityResolution),
  );
  if (occupationResolution)
    assign(
      fieldProvenance,
      ["/work/occupationCode"],
      statisticalProvenance(occupationResolution),
    );
  if (patternResolution)
    assign(
      fieldProvenance,
      ["/work/workPattern"],
      statisticalProvenance(patternResolution),
    );
  if (earningsResolution)
    assign(
      fieldProvenance,
      ["/work/annualIncomeBand"],
      statisticalProvenance(earningsResolution),
    );
  else if (branch === "self_employed")
    assign(fieldProvenance, ["/work/annualIncomeBand"], derivedProvenance());
  if (commuteResolution)
    assign(
      fieldProvenance,
      ["/dailyLife/commute"],
      statisticalProvenance(commuteResolution),
    );
  assign(
    fieldProvenance,
    ["/narrative/neighbourhoodContext"],
    statisticalProvenance(imdResolution),
  );
  assign(
    fieldProvenance,
    ["/identity/fictionalName", "/identity/pronouns"],
    templateProvenance(),
  );
  assign(
    fieldProvenance,
    ["/work/occupationTitle", "/work/employerType", "/dailyLife/routine"],
    templateProvenance(),
  );
  assign(
    fieldProvenance,
    [
      "/appearance/presentation",
      "/appearance/clothing",
      "/appearance/possessions",
      "/appearance/portraitDescriptor",
    ],
    templateProvenance(),
  );
  assign(
    fieldProvenance,
    [
      "/character/personalHistory",
      "/character/values",
      "/character/speechStyle",
      "/character/boundaries",
    ],
    templateProvenance(),
  );
  assign(
    fieldProvenance,
    [
      "/currentState/currentTask",
      "/currentState/reasonForLocation",
      "/currentState/mood",
      "/currentState/energy",
      "/currentState/shortTermGoal",
      "/currentState/relationshipState",
      "/currentState/recentActions",
    ],
    templateProvenance(),
  );
  if (!occupationResolution)
    assign(
      fieldProvenance,
      [
        "/work/occupationCode",
        "/work/occupationTitle",
        "/work/employerType",
        "/work/workPattern",
        "/work/annualIncomeBand",
      ],
      derivedProvenance(),
    );
  if (!commuteResolution)
    assign(fieldProvenance, ["/dailyLife/commute"], derivedProvenance());

  return {
    canonicalProfile,
    currentState,
    narrative,
    fieldProvenance: NpcFieldProvenanceMapSchema.parse(fieldProvenance),
  };
}
