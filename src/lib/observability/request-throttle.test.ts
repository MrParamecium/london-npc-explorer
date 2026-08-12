import { describe, expect, it } from "vitest";

import { InMemoryRequestThrottle } from "./request-throttle";

describe("InMemoryRequestThrottle", () => {
  it("limits one client without blocking another", () => {
    const throttle = new InMemoryRequestThrottle({
      clientLimit: 2,
      globalLimit: 10,
      windowMs: 60_000,
      now: () => 1_000,
    });

    expect(throttle.check("client-a").allowed).toBe(true);
    expect(throttle.check("client-a").allowed).toBe(true);
    expect(throttle.check("client-a")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(throttle.check("client-b").allowed).toBe(true);
  });

  it("enforces a global ceiling", () => {
    const throttle = new InMemoryRequestThrottle({
      clientLimit: 10,
      globalLimit: 2,
      windowMs: 60_000,
      now: () => 1_000,
    });

    expect(throttle.check("client-a").allowed).toBe(true);
    expect(throttle.check("client-b").allowed).toBe(true);
    expect(throttle.check("client-c").allowed).toBe(false);
  });

  it("reports when every exceeded limit will be open", () => {
    let now = 1_000;
    const throttle = new InMemoryRequestThrottle({
      clientLimit: 2,
      globalLimit: 2,
      windowMs: 60_000,
      now: () => now,
    });

    expect(throttle.check("client-a").allowed).toBe(true);
    now = 11_000;
    expect(throttle.check("client-a").allowed).toBe(true);
    now = 21_000;
    expect(throttle.check("client-a")).toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
  });

  it("opens a fresh window after the configured interval", () => {
    let now = 1_000;
    const throttle = new InMemoryRequestThrottle({
      clientLimit: 1,
      globalLimit: 10,
      windowMs: 60_000,
      now: () => now,
    });

    expect(throttle.check("client-a").allowed).toBe(true);
    expect(throttle.check("client-a").allowed).toBe(false);
    now = 61_000;
    expect(throttle.check("client-a").allowed).toBe(true);
  });
});
