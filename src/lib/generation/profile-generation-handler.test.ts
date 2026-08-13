import { describe, expect, it, vi } from "vitest";

import { InMemoryRequestThrottle } from "@/lib/observability/request-throttle";

import { createProfileGenerationHandler } from "./profile-generation-handler";
import { ProfileGenerationError } from "./profile-generation-service";

function request(body: unknown) {
  return new Request("http://localhost/api/npcs/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  coordinates: { latitude: 51.5202, longitude: -0.0979 },
  idempotencyKey: "loop4-handler-001",
};

function throttle() {
  return new InMemoryRequestThrottle({
    clientLimit: 6,
    globalLimit: 60,
    windowMs: 60_000,
  });
}

describe("profile generation handler", () => {
  it("rejects signed-out requests before parsing or generation", async () => {
    const generate = vi.fn();
    const handler = createProfileGenerationHandler({
      getAuthenticatedUserId: async () => null,
      ensureUser: vi.fn(),
      generate,
      throttle: throttle(),
    });

    const response = await handler(request(validBody));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("validates the public request and does not accept extra fields", async () => {
    const generate = vi.fn();
    const handler = createProfileGenerationHandler({
      getAuthenticatedUserId: async () => "user_2handlerOwner",
      ensureUser: vi.fn(),
      generate,
      throttle: throttle(),
    });

    const response = await handler(
      request({ ...validBody, apiKey: "AIza-never-return-this" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "Enter valid coordinates and a generation key.",
        retryable: false,
      },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("passes only authenticated ownership to generation", async () => {
    const ensureUser = vi.fn(async (userId: string) => userId);
    const generate = vi.fn().mockResolvedValue({ status: "completed" });
    const handler = createProfileGenerationHandler({
      getAuthenticatedUserId: async () => "user_2handlerOwner",
      ensureUser,
      generate,
      throttle: throttle(),
    });

    const response = await handler(request(validBody));

    expect(response.status).toBe(200);
    expect(ensureUser).toHaveBeenCalledWith("user_2handlerOwner");
    expect(generate).toHaveBeenCalledWith({
      ownerId: "user_2handlerOwner",
      ...validBody,
    });
  });

  it("returns a structured outside-London failure without internal details", async () => {
    const handler = createProfileGenerationHandler({
      getAuthenticatedUserId: async () => "user_2handlerOwner",
      ensureUser: async (userId) => userId,
      generate: vi
        .fn()
        .mockRejectedValue(
          new ProfileGenerationError(
            "unsupported_location",
            "This coordinate is outside the supported Greater London area.",
            false,
          ),
        ),
      throttle: throttle(),
    });

    const response = await handler(request(validBody));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(422);
    expect(serialized).toContain("unsupported_location");
    expect(serialized).not.toMatch(/postgres|secret|AIza/i);
  });

  it("returns 429 with retry-after for repeated user requests", async () => {
    const generate = vi.fn().mockResolvedValue({ status: "queued" });
    const handler = createProfileGenerationHandler({
      getAuthenticatedUserId: async () => "user_2handlerOwner",
      ensureUser: async (userId) => userId,
      generate,
      throttle: new InMemoryRequestThrottle({
        clientLimit: 1,
        globalLimit: 10,
        windowMs: 60_000,
      }),
    });

    await handler(request(validBody));
    const response = await handler(
      request({ ...validBody, idempotencyKey: "loop4-handler-002" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
