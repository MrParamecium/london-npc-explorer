import type { ProviderMode } from "@/lib/providers/provider-mode";

type GoogleMapsConfigInput = {
  providerMode: ProviderMode;
  browserKey: string | undefined;
  serverKey: string | undefined;
};

export function resolveGoogleMapsConfig(input: GoogleMapsConfigInput) {
  const keyCount = [input.browserKey, input.serverKey].filter(Boolean).length;

  if (keyCount === 1) {
    throw new Error("Google Maps requires both browser and server keys.");
  }

  if (input.providerMode === "live" && keyCount === 0) {
    throw new Error("Live provider mode requires both Google Maps keys.");
  }

  return {
    enabled: keyCount === 2,
    browserKey: input.browserKey,
    serverKey: input.serverKey,
  };
}
