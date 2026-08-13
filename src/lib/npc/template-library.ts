import { namedInteger } from "@/lib/sampling/deterministic-random";

export const LONDON_NPC_TEMPLATE_VERSION = "london-template-v1";

const NAMES = [
  "Alex Morgan",
  "Amara Lewis",
  "Ari Bennett",
  "Casey Shah",
  "Dani Clarke",
  "Eden Hughes",
  "Elena Rossi",
  "Farah Malik",
  "Imani Cole",
  "Jamie Taylor",
  "Jordan Evans",
  "Kai Martin",
  "Leila Grant",
  "Maya Reed",
  "Morgan Chen",
  "Nadia Hall",
  "Noah Williams",
  "Priya Kent",
  "Ravi Brooks",
  "Robin Foster",
  "Samira Young",
  "Theo Price",
  "Zara James",
] as const;

const OCCUPATIONS: Record<string, readonly { code: string; title: string }[]> =
  {
    soc1_managers_directors_senior_officials: [
      { code: "SOC-11", title: "Operations manager" },
      { code: "SOC-12", title: "Retail manager" },
      { code: "SOC-13", title: "Project manager" },
    ],
    soc2_professional: [
      { code: "SOC-21", title: "Software developer" },
      { code: "SOC-22", title: "Secondary school teacher" },
      { code: "SOC-24", title: "Accountant" },
    ],
    soc3_associate_professional_technical: [
      { code: "SOC-31", title: "Laboratory technician" },
      { code: "SOC-34", title: "Graphic designer" },
      { code: "SOC-35", title: "IT support technician" },
    ],
    soc4_administrative_secretarial: [
      { code: "SOC-41", title: "Office administrator" },
      { code: "SOC-42", title: "Customer accounts coordinator" },
      { code: "SOC-43", title: "Medical secretary" },
    ],
    soc5_skilled_trades: [
      { code: "SOC-52", title: "Electrician" },
      { code: "SOC-53", title: "Carpenter" },
      { code: "SOC-54", title: "Chef" },
    ],
    soc6_caring_leisure_service: [
      { code: "SOC-61", title: "Care worker" },
      { code: "SOC-62", title: "Teaching assistant" },
      { code: "SOC-63", title: "Fitness instructor" },
    ],
    soc7_sales_customer_service: [
      { code: "SOC-71", title: "Retail assistant" },
      { code: "SOC-72", title: "Customer service adviser" },
      { code: "SOC-73", title: "Sales representative" },
    ],
    soc8_process_plant_machine: [
      { code: "SOC-81", title: "Bus driver" },
      { code: "SOC-82", title: "Production operative" },
      { code: "SOC-83", title: "Delivery driver" },
    ],
    soc9_elementary: [
      { code: "SOC-91", title: "Kitchen assistant" },
      { code: "SOC-92", title: "Cleaner" },
      { code: "SOC-93", title: "Warehouse assistant" },
    ],
  };

const EMPLOYERS = [
  "private company",
  "public sector",
  "charity",
  "co-operative",
] as const;
const PRESENTATIONS = [
  "Practical and tidy, with the small signs of a day spent moving around London.",
  "Neatly put together but relaxed, dressed for changing weather and a busy day.",
  "Comfortable and understated, with a well-used outer layer close at hand.",
  "Carefully presented without looking formal, carrying only everyday essentials.",
] as const;
const CLOTHING = [
  ["navy overshirt", "plain T-shirt", "worn trainers"],
  ["light raincoat", "knitted jumper", "dark trousers"],
  ["denim jacket", "cotton shirt", "walking shoes"],
  ["wool coat", "simple top", "comfortable boots"],
] as const;
const POSSESSIONS = [
  ["phone", "reusable water bottle"],
  ["canvas tote", "wireless earphones"],
  ["compact umbrella", "travel card"],
  ["small backpack", "paperback book"],
] as const;
const HISTORIES = [
  "Has built a familiar routine around work, errands, friends and the uneven pace of city life.",
  "Knows a handful of London routes very well and still finds reasons to explore unfamiliar streets.",
  "Keeps a modest circle of regular places and people while making room for occasional changes of plan.",
  "Has moved through several ordinary phases of study, work and home life without treating any one as permanent.",
] as const;
const VALUES = [
  ["reliability", "personal space"],
  ["fairness", "practical kindness"],
  ["independence", "keeping promises"],
  ["curiosity", "respect for other people's time"],
] as const;
const SPEECH = [
  "Direct and friendly, pausing to make sure the other person has understood.",
  "Measured and conversational, with brief answers when time is short.",
  "Warm but matter-of-fact, preferring specific details to exaggerated claims.",
  "Quietly expressive, using ordinary language and asking focused questions.",
] as const;
const BOUNDARIES = [
  [
    "does not share private contact details",
    "avoids speaking for other people",
  ],
  [
    "will not disclose confidential work information",
    "steps away from aggressive conversations",
  ],
  [
    "keeps family matters private",
    "does not make promises on someone else's behalf",
  ],
] as const;

function pick<T>(seed: string, path: string, values: readonly T[]): T {
  if (values.length === 0) throw new Error(`Template pool ${path} is empty.`);
  return values[namedInteger(seed, `template/${path}`, 0, values.length - 1)]!;
}

export function pickFictionalName(seed: string) {
  return pick(seed, "identity/name", NAMES);
}

export function pickOccupation(seed: string, majorGroup: string) {
  const options = OCCUPATIONS[majorGroup];
  if (!options) throw new Error(`No occupation templates for ${majorGroup}.`);
  return pick(seed, `work/occupation/${majorGroup}`, options);
}

export function pickEmployer(seed: string) {
  return pick(seed, "work/employer", EMPLOYERS);
}

export function buildTemplateProfileFields(seed: string) {
  return {
    presentation: pick(seed, "appearance/presentation", PRESENTATIONS),
    clothing: [...pick(seed, "appearance/clothing", CLOTHING)],
    possessions: [...pick(seed, "appearance/possessions", POSSESSIONS)],
    personalHistory: pick(seed, "character/history", HISTORIES),
    values: [...pick(seed, "character/values", VALUES)],
    speechStyle: pick(seed, "character/speech", SPEECH),
    boundaries: [...pick(seed, "character/boundaries", BOUNDARIES)],
  };
}

const CURRENT_TASKS: Record<string, readonly string[]> = {
  employee: [
    "Heading to the next work commitment.",
    "Finishing a short errand between work tasks.",
  ],
  self_employed: [
    "Checking the next appointment and travel time.",
    "Preparing for a client task later today.",
  ],
  unemployed: [
    "Taking care of a practical errand.",
    "Reviewing plans for the rest of the day.",
  ],
  student: [
    "Making time for study and a personal errand.",
    "Heading towards the next study session.",
  ],
  retired: [
    "Taking an unhurried trip through the neighbourhood.",
    "Picking up something needed at home.",
  ],
  carer: [
    "Completing an errand before returning home.",
    "Checking the time before the next responsibility.",
  ],
  other_inactive: [
    "Taking a short trip at a manageable pace.",
    "Dealing with one practical task for the day.",
  ],
};

export function buildCurrentStateTemplates(seed: string, branch: string) {
  const tasks = CURRENT_TASKS[branch] ?? CURRENT_TASKS.other_inactive!;
  return {
    currentTask: pick(seed, `state/task/${branch}`, tasks),
    reasonForLocation: pick(seed, "state/reason", [
      "Passing through while completing today's plans.",
      "Stopping nearby before the next part of the day.",
      "Using a familiar route to reach the next destination.",
    ] as const),
    mood: pick(seed, "state/mood", [
      "calm",
      "focused",
      "thoughtful",
      "slightly rushed",
    ] as const),
    energy: pick(seed, "state/energy", ["low", "medium", "high"] as const),
    shortTermGoal: pick(seed, "state/goal", [
      "Finish the next task without running late.",
      "Reach the next stop and check the rest of the day's plan.",
      "Complete this errand and take a short break.",
    ] as const),
    relationshipState: "Has not met the user before.",
    recentActions: [
      pick(seed, "state/recent-action", [
        "Checked the time on a phone.",
        "Looked up the next part of the route.",
        "Adjusted a bag before moving on.",
      ] as const),
    ],
  };
}
