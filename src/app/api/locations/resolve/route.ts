import { env } from "@/lib/config/env";
import { createDatabase } from "@/lib/db/client";
import { GoogleLocationAdapter } from "@/lib/location/google-location-adapter";
import { createResolveLocationHandler } from "@/lib/location/location-resolution-handler";
import { resolveLondonGeography } from "@/lib/location/london-geography-repository";
import { MockLocationAdapter } from "@/lib/location/mock-location-adapter";
import { createLocationResolver } from "@/lib/location/resolve-location";
import { InMemoryRequestThrottle } from "@/lib/observability/request-throttle";

const locationAdapter =
  env.providerMode === "live"
    ? new GoogleLocationAdapter({ apiKey: env.googleMapsServerKey! })
    : new MockLocationAdapter();

const resolveLocation = createLocationResolver({
  resolveGeography: (coordinates) =>
    resolveLondonGeography(createDatabase(), coordinates),
  locationAdapter,
});

const throttle = new InMemoryRequestThrottle({
  clientLimit: 12,
  globalLimit: 120,
  windowMs: 60_000,
});

export const POST = createResolveLocationHandler({
  resolveLocation,
  throttle,
});
