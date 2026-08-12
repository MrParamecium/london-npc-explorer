import { describe, expect, it } from "vitest";

import {
  clearPendingGenerationIntent,
  consumePendingGenerationIntent,
  readPendingGenerationIntent,
  savePendingGenerationIntent,
} from "./pending-generation-intent";

const NOW = new Date("2026-08-12T08:00:00.000Z");

describe("pending generation intent", () => {
  it("stores and consumes the minimum versioned payload once", () => {
    savePendingGenerationIntent(
      sessionStorage,
      { latitude: 51.5202, longitude: -0.0979 },
      NOW,
    );

    expect(readPendingGenerationIntent(sessionStorage, NOW)).toEqual({
      version: 1,
      action: "generate_npc",
      latitude: 51.5202,
      longitude: -0.0979,
      createdAt: NOW.toISOString(),
    });

    expect(consumePendingGenerationIntent(sessionStorage, NOW)).not.toBeNull();
    expect(consumePendingGenerationIntent(sessionStorage, NOW)).toBeNull();
  });

  it("deletes an intent older than fifteen minutes", () => {
    savePendingGenerationIntent(
      sessionStorage,
      { latitude: 51.5202, longitude: -0.0979 },
      NOW,
    );

    expect(
      readPendingGenerationIntent(
        sessionStorage,
        new Date("2026-08-12T08:15:00.001Z"),
      ),
    ).toBeNull();
    expect(sessionStorage).toHaveLength(0);
  });

  it("deletes malformed or out-of-range payloads", () => {
    sessionStorage.setItem(
      "london-npc-atlas:pending-generation",
      JSON.stringify({
        version: 1,
        action: "generate_npc",
        latitude: 40.7128,
        longitude: -74.006,
        createdAt: NOW.toISOString(),
        token: "must-not-be-stored",
      }),
    );

    expect(readPendingGenerationIntent(sessionStorage, NOW)).toBeNull();
    expect(sessionStorage).toHaveLength(0);
  });

  it("can be cancelled explicitly", () => {
    savePendingGenerationIntent(
      sessionStorage,
      { latitude: 51.5202, longitude: -0.0979 },
      NOW,
    );

    clearPendingGenerationIntent(sessionStorage);

    expect(readPendingGenerationIntent(sessionStorage, NOW)).toBeNull();
  });
});
