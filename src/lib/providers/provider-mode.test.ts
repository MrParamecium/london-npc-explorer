import { describe, expect, it } from "vitest";

import { resolveProviderMode } from "./provider-mode";

describe("resolveProviderMode", () => {
  it("defaults to mock mode", () => {
    expect(resolveProviderMode(undefined)).toBe("mock");
  });

  it("accepts live mode", () => {
    expect(resolveProviderMode("live")).toBe("live");
  });

  it("rejects unsupported modes", () => {
    expect(() => resolveProviderMode("preview")).toThrow();
  });
});
