import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPortraitRuntime: vi.fn(),
  generateProfileNpc: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
  ensureCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({
  env: {
    providerMode: "mock",
    openRouterApiKey: undefined,
    openRouterImageModel: "openai/gpt-image-2",
    blobReadWriteToken: undefined,
  },
}));
vi.mock("@/lib/generation/portrait-runtime", () => ({
  createPortraitRuntime: mocks.createPortraitRuntime,
}));
vi.mock("@/lib/generation/profile-generation-service", () => ({
  generateProfileNpc: mocks.generateProfileNpc,
}));
vi.mock("@/lib/auth/current-app-user", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));

import { maxDuration, POST, runtime } from "./route";

describe("NPC generation route", () => {
  it("uses the Node runtime and portrait generation timeout", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(180);
  });

  it("creates one server-side portrait runtime and injects it into generation", async () => {
    const runtimeStub = {
      imageModel: "openai/gpt-image-2",
      generate: vi.fn(),
      store: vi.fn(),
      remove: vi.fn(),
    };
    mocks.createPortraitRuntime.mockReturnValue(runtimeStub);
    mocks.getAuthenticatedUserId.mockResolvedValue("user_routeOwner");
    mocks.ensureCurrentAppUser.mockResolvedValue("user_routeOwner");
    mocks.generateProfileNpc.mockResolvedValue({ status: "queued" });

    const response = await POST(
      new Request("http://localhost/api/npcs/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coordinates: { latitude: 51.5202, longitude: -0.0979 },
          idempotencyKey: "route-portrait-001",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createPortraitRuntime).toHaveBeenCalledWith({
      providerMode: "mock",
      openRouterApiKey: undefined,
      imageModel: "openai/gpt-image-2",
      blobToken: undefined,
    });
    expect(mocks.generateProfileNpc).toHaveBeenCalledWith(
      {
        ownerId: "user_routeOwner",
        coordinates: { latitude: 51.5202, longitude: -0.0979 },
        idempotencyKey: "route-portrait-001",
      },
      { portraitRuntime: runtimeStub },
    );
  });
});
