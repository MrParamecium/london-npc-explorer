import { describe, expect, it, vi } from "vitest";

import { validResolvedLocation } from "../../../../../tests/fixtures/domain";
import { createResolveLocationHandler } from "@/lib/location/location-resolution-handler";

function request(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/locations/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/locations/resolve", () => {
  it("returns a public supported result", async () => {
    const resolveLocation = vi.fn().mockResolvedValue(validResolvedLocation);
    const handler = createResolveLocationHandler({
      resolveLocation,
      throttle: { check: () => ({ allowed: true }) },
    });

    const response = await handler(request(validResolvedLocation.coordinates));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(validResolvedLocation);
    expect(resolveLocation).toHaveBeenCalledWith(
      validResolvedLocation.coordinates,
    );
  });

  it("rejects malformed or extra coordinate fields", async () => {
    const resolveLocation = vi.fn();
    const handler = createResolveLocationHandler({
      resolveLocation,
      throttle: { check: () => ({ allowed: true }) },
    });

    const response = await handler(
      request({ latitude: 91, longitude: -0.1, apiKey: "do-not-return" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "Enter a valid latitude and longitude.",
        retryable: false,
      },
    });
    expect(resolveLocation).not.toHaveBeenCalled();
  });

  it("returns 429 with a retry interval", async () => {
    const resolveLocation = vi.fn();
    const handler = createResolveLocationHandler({
      resolveLocation,
      throttle: {
        check: () => ({ allowed: false, retryAfterSeconds: 42 }),
      },
    });

    const response = await handler(
      request(validResolvedLocation.coordinates, {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({
      error: {
        code: "rate_limited",
        message: "Too many location requests. Try again shortly.",
        retryable: true,
      },
    });
    expect(resolveLocation).not.toHaveBeenCalled();
  });

  it("does not expose database or provider error details", async () => {
    const handler = createResolveLocationHandler({
      resolveLocation: vi
        .fn()
        .mockRejectedValue(
          new Error("postgresql://owner:secret@host and AIza-secret-key"),
        ),
      throttle: { check: () => ({ allowed: true }) },
    });

    const response = await handler(request(validResolvedLocation.coordinates));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toContain("geography_unavailable");
    expect(serialized).not.toMatch(/postgres|secret|AIza/i);
  });
});
