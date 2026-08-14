import { describe, expect, it, vi } from "vitest";

import type { ProfileNpcRecord } from "@/lib/db/queries/profile-npcs";

import { createProfileHistoryHandler } from "./profile-history-handler";

const npc = {
  id: "44444444-4444-4444-8444-444444444444",
  ownerId: "user_2historyOwner",
  locationId: "11111111-1111-4111-8111-111111111111",
  generationJobId: "33333333-3333-4333-8333-333333333333",
  seed: "loop4history0001",
  canonicalProfile: { schemaVersion: 2 },
  currentState: { mood: "calm" },
  versionSet: { datasetVersionIds: [] },
  fieldProvenance: {},
  narrative: "A fictional London resident is waiting near the station.",
  portraitUrl:
    "https://store.public.blob.vercel-storage.com/npc-portraits/history.png",
  visibleAt: new Date("2026-08-13T00:00:00.000Z"),
  createdAt: new Date("2026-08-13T00:00:00.000Z"),
  updatedAt: new Date("2026-08-13T00:00:00.000Z"),
} as unknown as ProfileNpcRecord;

describe("profile history handler", () => {
  it("returns owner-scoped serialized items", async () => {
    const list = vi.fn().mockResolvedValue({ items: [npc], nextCursor: null });
    const handler = createProfileHistoryHandler({
      getAuthenticatedUserId: async () => "user_2historyOwner",
      ensureUser: async (userId) => userId,
      list,
    });

    const response = await handler(
      new Request("http://localhost/api/npcs?limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({
      ownerId: "user_2historyOwner",
      cursor: null,
      limit: 10,
    });
    expect(body.items[0]).toMatchObject({ npcId: npc.id, seed: npc.seed });
    expect(body.items[0]).not.toHaveProperty("ownerId");
    expect(body.items[0]).not.toHaveProperty("generationJobId");
  });

  it("rejects invalid cursor and limit before querying", async () => {
    const list = vi.fn();
    const handler = createProfileHistoryHandler({
      getAuthenticatedUserId: async () => "user_2historyOwner",
      ensureUser: async (userId) => userId,
      list,
    });

    const response = await handler(
      new Request("http://localhost/api/npcs?limit=51&cursor=not-a-uuid"),
    );

    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
});
