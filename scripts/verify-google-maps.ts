import { performance } from "node:perf_hooks";

import { createDatabase } from "../src/lib/db/client";
import { GoogleLocationAdapter } from "../src/lib/location/google-location-adapter";
import { resolveLondonGeography } from "../src/lib/location/london-geography-repository";

const KNOWN_LONDON_POINT = { latitude: 51.513615, longitude: -0.09835 };
const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;

function requireKeyPair() {
  const keyCount = [browserKey, serverKey].filter(Boolean).length;
  if (keyCount === 0) {
    throw new Error(
      "Google Maps is not configured. Add both keys to .env.local first.",
    );
  }
  if (keyCount === 1) {
    throw new Error("Google Maps requires both browser and server keys.");
  }
  if (process.env.NODE_ENV === "test") {
    throw new Error("Live Google credentials cannot run in the test process.");
  }
}

async function checkMapsJavaScript() {
  const startedAt = performance.now();
  const url = new URL("https://maps.googleapis.com/maps/api/js");
  url.searchParams.set("key", browserKey!);
  url.searchParams.set("loading", "async");
  url.searchParams.set("v", "weekly");

  const response = await fetch(url, {
    headers: { Referer: "http://localhost:3000/" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Maps JavaScript API returned HTTP ${response.status}.`);
  }

  return Math.round(performance.now() - startedAt);
}

async function verifyGoogleMaps() {
  requireKeyPair();

  const database = createDatabase();
  const locationAdapter = new GoogleLocationAdapter({ apiKey: serverKey! });
  const geographyStartedAt = performance.now();
  const geography = await resolveLondonGeography(database, KNOWN_LONDON_POINT);
  const geographyMs = Math.round(performance.now() - geographyStartedAt);
  if (!geography.supported) {
    throw new Error("The known London point did not resolve in PostGIS.");
  }

  const [mapsJavaScriptMs, geocodingCheck, placesCheck] = await Promise.all([
    checkMapsJavaScript(),
    timed(() => locationAdapter.reverseGeocode(KNOWN_LONDON_POINT)),
    timed(() => locationAdapter.searchNearby(KNOWN_LONDON_POINT)),
  ]);
  if (!geocodingCheck.value) {
    throw new Error("Geocoding API returned no address for the known point.");
  }

  console.info(
    JSON.stringify(
      {
        status: "ok",
        mapsJavaScriptMs,
        geocodingMs: geocodingCheck.elapsedMs,
        placesMs: placesCheck.elapsedMs,
        geographyMs,
        nearbyPlaceCount: placesCheck.value.length,
        geography: {
          lsoa: geography.geography.lsoa.code,
          ward: geography.geography.ward?.code ?? null,
          borough: geography.geography.borough.code,
        },
      },
      null,
      2,
    ),
  );
}

async function timed<T>(operation: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await operation();
  return {
    value,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

verifyGoogleMaps().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Verification failed.",
  );
  process.exitCode = 1;
});
