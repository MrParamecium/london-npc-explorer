import { describe, expect, it } from "vitest";

import { resolveGoogleMapsConfig } from "./google-maps-config";

describe("resolveGoogleMapsConfig", () => {
  it("allows mock mode without Google credentials", () => {
    expect(
      resolveGoogleMapsConfig({
        providerMode: "mock",
        browserKey: undefined,
        serverKey: undefined,
      }),
    ).toEqual({
      enabled: false,
      browserKey: undefined,
      serverKey: undefined,
    });
  });

  it("requires both Google keys in live mode", () => {
    expect(() =>
      resolveGoogleMapsConfig({
        providerMode: "live",
        browserKey: undefined,
        serverKey: undefined,
      }),
    ).toThrow("Live provider mode requires both Google Maps keys.");
  });

  it("rejects a partial Google key pair in every mode", () => {
    expect(() =>
      resolveGoogleMapsConfig({
        providerMode: "mock",
        browserKey: "browser-key",
        serverKey: undefined,
      }),
    ).toThrow("Google Maps requires both browser and server keys.");
  });

  it("enables Google Maps when both keys are present", () => {
    expect(
      resolveGoogleMapsConfig({
        providerMode: "live",
        browserKey: "browser-key",
        serverKey: "server-key",
      }),
    ).toEqual({
      enabled: true,
      browserKey: "browser-key",
      serverKey: "server-key",
    });
  });
});
