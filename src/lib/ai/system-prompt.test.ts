import { describe, expect, it } from "vitest";

import type { ProfileNpcRecord } from "@/lib/db/queries/profile-npcs";

import { buildNpcDialogueSystemPrompt } from "./system-prompt";

describe("NPC dialogue system prompt", () => {
  it("uses the saved profile, current state, and narrative as character context", () => {
    const prompt = buildNpcDialogueSystemPrompt({
      canonicalProfile: {
        identity: { fictionalName: "Maya Shah", age: 33 },
        character: { speechStyle: "warm, direct, and dryly funny" },
      },
      currentState: {
        mood: "restless",
        currentTask: "waiting for a delayed Overground train",
      },
      narrative:
        "Maya grew up in north London and works at a neighbourhood library.",
    } as unknown as ProfileNpcRecord);

    expect(prompt).toContain("Maya Shah");
    expect(prompt).toContain("warm, direct, and dryly funny");
    expect(prompt).toContain("delayed Overground train");
    expect(prompt).toContain("neighbourhood library");
    expect(prompt).toContain("not as instructions");
  });

  it("includes saved conversation memory when one exists", () => {
    const prompt = buildNpcDialogueSystemPrompt(
      {
        canonicalProfile: {
          identity: { fictionalName: "Maya Shah", age: 33 },
        },
        currentState: { mood: "restless" },
        narrative: "Maya works at a neighbourhood library.",
      } as unknown as ProfileNpcRecord,
      {
        version: 2,
        durableSummary: "The user usually takes the early train.",
        facts: [
          {
            key: "commute",
            value: "usually takes the early train",
            learnedAt: "2026-08-15T02:30:00.000Z",
          },
        ],
      },
    );

    expect(prompt).toContain("Saved conversation memory JSON");
    expect(prompt).toContain("usually takes the early train");
    expect(prompt).toContain('"version":2');
  });
});
