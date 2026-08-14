import { describe, expect, it } from "vitest";

import {
  validCanonicalProfileV2,
  validCurrentState,
} from "../../../tests/fixtures/domain";
import {
  CanonicalNpcProfileV2Schema,
  NpcCurrentStateSchema,
} from "../npc/contracts";
import { buildPortraitPrompt } from "./portrait-prompt";

describe("buildPortraitPrompt", () => {
  it("uses only approved locked-profile fields in a deterministic order", () => {
    const profile = CanonicalNpcProfileV2Schema.parse(validCanonicalProfileV2);
    const currentState = NpcCurrentStateSchema.parse(validCurrentState);
    const inputWithPrivateAddress = {
      profile,
      currentState,
      place: { ward: "Aldersgate", borough: "City of London" },
      address: { formatted: "PRIVATE-ADDRESS-MARKER" },
    };

    const prompt = buildPortraitPrompt(inputWithPrivateAddress);

    expect(prompt).toContain("fictional adult");
    expect(prompt).toContain("31 years old");
    expect(prompt).toContain("olive field jacket");
    expect(prompt).toContain("Aldersgate, City of London");
    expect(prompt).toContain("natural skin texture");
    expect(prompt).toContain("no text, logo, watermark");
    expect(prompt).not.toContain("PRIVATE-ADDRESS-MARKER");
    expect(prompt).not.toContain(
      validCanonicalProfileV2.character.personalHistory,
    );
    expect(prompt).not.toContain(validCanonicalProfileV2.character.speechStyle);
    expect(buildPortraitPrompt(inputWithPrivateAddress)).toBe(prompt);
  });

  it("keeps ethnicity, occupation, and income in independent descriptions", () => {
    const prompt = buildPortraitPrompt({
      profile: CanonicalNpcProfileV2Schema.parse(validCanonicalProfileV2),
      currentState: NpcCurrentStateSchema.parse(validCurrentState),
      place: { ward: "Aldersgate", borough: "City of London" },
    });
    const sections = prompt.split("\n");

    expect(sections).toContain(
      "Ethnic group: Black British, Nigerian heritage.",
    );
    expect(sections).toContain(
      "Occupation: Museum programme coordinator (employed).",
    );
    expect(sections).toContain("Income band: GBP 38k-44k.");
    expect(prompt.toLowerCase()).not.toContain("because of their ethnicity");
  });

  it("omits character and other current-state details that are not visual inputs", () => {
    const currentState = NpcCurrentStateSchema.parse(validCurrentState);
    const prompt = buildPortraitPrompt({
      profile: CanonicalNpcProfileV2Schema.parse(validCanonicalProfileV2),
      currentState: {
        ...currentState,
        shortTermGoal: "PRIVATE-GOAL-MARKER",
        relationshipState: "PRIVATE-RELATIONSHIP-MARKER",
        recentActions: ["PRIVATE-ACTION-MARKER"],
      },
      place: { ward: null, borough: "Hackney" },
    });

    expect(prompt).toContain("Hackney, London");
    expect(prompt).not.toContain("PRIVATE-STORY-MARKER");
    expect(prompt).not.toContain("PRIVATE-SPEECH-MARKER");
    expect(prompt).not.toContain("PRIVATE-GOAL-MARKER");
    expect(prompt).not.toContain("PRIVATE-RELATIONSHIP-MARKER");
    expect(prompt).not.toContain("PRIVATE-ACTION-MARKER");
  });
});
