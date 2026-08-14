import { describe, expect, it, vi } from "vitest";

import type { ProfileNpcRecord } from "@/lib/db/queries/profile-npcs";

import { createProfileDetailHandler } from "./profile-detail-handler";

const npc = {
  id: "44444444-4444-4444-8444-444444444444",
  ownerId: "user_2detailOwner",
  locationId: "11111111-1111-4111-8111-111111111111",
  generationJobId: "33333333-3333-4333-8333-333333333333",
  seed: "loop4detail0001",
  canonicalProfile: { schemaVersion: 2 },
  currentState: { mood: "calm" },
  versionSet: { datasetVersionIds: [] },
  fieldProvenance: {},
  narrative: "A fictional London resident is waiting near the station.",
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/detail.png",
  visibleAt: new Date("2026-08-13T00:00:00.000Z"),
  createdAt: new Date("2026-08-13T00:00:00.000Z"),
  updatedAt: new Date("2026-08-13T00:00:00.000Z"),
} as unknown as ProfileNpcRecord;

const context = (npcId: string) => ({ params: Promise.resolve({ npcId }) });

describe("profile detail handler", () => {
  it("returns a serialized owner-scoped NPC", async () => {
    const get = vi.fn().mockResolvedValue(npc);
    const handler = createProfileDetailHandler({
      getAuthenticatedUserId: async () => "user_2detailOwner",
      ensureUser: async (userId) => userId,
      get,
    });

    const response = await handler(
      new Request(
        "http://localhost/api/npcs/44444444-4444-4444-8444-444444444444",
      ),
      context(npc.id),
    );

    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledWith("user_2detailOwner", npc.id);
    expect(await response.json()).toMatchObject({ npcId: npc.id });
  });

  it("returns 404 for another user's or missing NPC", async () => {
    const handler = createProfileDetailHandler({
      getAuthenticatedUserId: async () => "user_2detailOwner",
      ensureUser: async (userId) => userId,
      get: vi.fn().mockResolvedValue(null),
    });

    const response = await handler(
      new Request("http://localhost/api/npcs"),
      context(npc.id),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "NPC not found.", retryable: false },
    });
  });
});
