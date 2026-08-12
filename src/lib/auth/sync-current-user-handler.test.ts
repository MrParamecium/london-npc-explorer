import { describe, expect, it, vi } from "vitest";

import { createSyncCurrentUserHandler } from "./sync-current-user-handler";

describe("sync current user handler", () => {
  it("returns 401 without a Clerk session", async () => {
    const ensureUser = vi.fn<(userId: string) => Promise<string>>();
    const handler = createSyncCurrentUserHandler({
      getAuthenticatedUserId: async () => null,
      ensureUser,
    });

    const response = await handler();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
    expect(ensureUser).not.toHaveBeenCalled();
  });

  it("uses only the authenticated Clerk user ID", async () => {
    const ensureUser = vi.fn(async (userId: string) => userId);
    const handler = createSyncCurrentUserHandler({
      getAuthenticatedUserId: async () => "user_2authenticatedOwner",
      ensureUser,
    });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: "user_2authenticatedOwner",
    });
    expect(ensureUser).toHaveBeenCalledWith("user_2authenticatedOwner");
  });
});
