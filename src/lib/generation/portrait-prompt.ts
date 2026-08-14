import type {
  CanonicalNpcProfileV2,
  NpcCurrentState,
} from "@/lib/npc/contracts";

export type PortraitPromptInput = {
  profile: CanonicalNpcProfileV2;
  currentState: NpcCurrentState;
  place: { ward: string | null; borough: string };
};

function description(label: string, value: string) {
  const normalizedValue = value.trim().replace(/[.!?]+$/, "");
  return `${label}: ${normalizedValue}.`;
}

export function buildPortraitPrompt({
  profile,
  currentState,
  place,
}: PortraitPromptInput): string {
  const { identity, work, appearance } = profile;
  const location = place.ward
    ? `${place.ward}, ${place.borough}, London`
    : `${place.borough}, London`;

  const sections = [
    "Create a realistic documentary photograph of one fictional adult.",
    description(
      "Identity",
      `${identity.age} years old (${identity.ageBand} adult age band); pronouns: ${identity.pronouns}; statistical sex: ${identity.statisticalSex}`,
    ),
    description("Ethnic group", identity.ethnicGroup),
  ];

  if (work.occupationTitle) {
    sections.push(
      description(
        "Occupation",
        `${work.occupationTitle} (${work.economicActivity})`,
      ),
    );
  } else {
    sections.push(description("Work status", work.economicActivity));
  }

  if (work.annualIncomeBand) {
    sections.push(description("Income band", work.annualIncomeBand));
  }

  sections.push(
    description("Everyday presentation", appearance.presentation),
    description("Clothing", appearance.clothing.join(", ")),
    description(
      "Possessions",
      appearance.possessions.length > 0
        ? appearance.possessions.join(", ")
        : "none specified",
    ),
    description("Portrait direction", appearance.portraitDescriptor),
    description("Current task", currentState.currentTask),
    description("Reason for being there", currentState.reasonForLocation),
    description("Mood", currentState.mood),
    description("Energy", currentState.energy),
    description("Location context", location),
    "Use occupation and income only to keep the ordinary wardrobe and setting plausible. Never use ethnicity to infer occupation, income, personality, behavior, beauty, or social status.",
    "Photography requirements: a candid, ordinary documentary photograph with natural skin texture, subtle asymmetry, flyaway hair, realistic clothing wear, an unforced pose, natural London light and weather, and one person in an uncrowded frame.",
    "Avoid beauty retouching, fashion-editorial styling, exaggerated cinematic color grading, strong background blur, fantasy styling, or resemblance to any named real person; no text, logo, watermark, border, or collage.",
  );

  return sections.join("\n");
}
