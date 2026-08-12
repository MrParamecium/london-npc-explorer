import { z } from "zod";

import {
  CoordinatesSchema,
  NearbyPlaceSchema,
  ResolvedAddressSchema,
  type Coordinates,
  type NearbyPlace,
  type NearbyPlaceCategory,
  type ResolvedAddress,
} from "./contracts";
import {
  LocationProviderError,
  type LocationAdapter,
} from "./location-adapter";

export { LocationProviderError } from "./location-adapter";

const GEOCODING_ENDPOINT = "https://geocode.googleapis.com/v4/geocode/location";
const NEARBY_SEARCH_ENDPOINT =
  "https://places.googleapis.com/v1/places:searchNearby";
const DEFAULT_TIMEOUT_MS = 5_000;
const SEARCH_RADIUS_METERS = 500;
const MAX_NEARBY_RESULTS = 10;

const GEOCODING_FIELD_MASK = [
  "results.placeId",
  "results.formattedAddress",
  "results.addressComponents.longText",
  "results.addressComponents.types",
].join(",");

const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.shortFormattedAddress",
  "places.location",
].join(",");

const INCLUDED_PLACE_TYPES = [
  "restaurant",
  "cafe",
  "bakery",
  "supermarket",
  "convenience_store",
  "shopping_mall",
  "bus_station",
  "train_station",
  "subway_station",
  "school",
  "university",
  "hospital",
  "pharmacy",
  "doctor",
  "park",
  "museum",
  "library",
  "community_center",
] as const;

const AddressComponentSchema = z.object({
  longText: z.string().trim().min(1),
  types: z.array(z.string()),
});

const GeocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        placeId: z.string().trim().min(8).optional(),
        formattedAddress: z.string().trim().min(1),
        addressComponents: z.array(AddressComponentSchema).optional(),
      }),
    )
    .optional()
    .default([]),
});

const NearbySearchResponseSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string().trim().min(8),
        displayName: z.object({ text: z.string().trim().min(1) }),
        primaryType: z.string().trim().min(1),
        shortFormattedAddress: z.string().trim().min(1).optional(),
        location: CoordinatesSchema,
      }),
    )
    .optional()
    .default([]),
});

const PLACE_TYPE_CATEGORIES: Record<string, NearbyPlaceCategory> = {
  restaurant: "food",
  cafe: "food",
  bakery: "food",
  bar: "food",
  meal_takeaway: "food",
  supermarket: "retail",
  convenience_store: "retail",
  shopping_mall: "retail",
  clothing_store: "retail",
  store: "retail",
  bus_station: "transit",
  train_station: "transit",
  subway_station: "transit",
  transit_station: "transit",
  school: "education",
  university: "education",
  library: "culture_community",
  hospital: "healthcare",
  pharmacy: "healthcare",
  doctor: "healthcare",
  park: "park",
  playground: "park",
  museum: "culture_community",
  performing_arts_theater: "culture_community",
  cultural_center: "culture_community",
  community_center: "culture_community",
};

type FetchImplementation = typeof fetch;

type GoogleLocationAdapterOptions = {
  apiKey: string;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
};

function parseProviderResponse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new LocationProviderError(
      "invalid_response",
      "Google location provider returned an unexpected response.",
      { cause: result.error },
    );
  }

  return result.data;
}

function addressPart(
  components: z.infer<typeof AddressComponentSchema>[],
  acceptedTypes: string[],
) {
  return (
    components.find((component) =>
      acceptedTypes.some((type) => component.types.includes(type)),
    )?.longText ?? null
  );
}

export function normalizeNearbyPlaceCategory(
  primaryType: string,
): NearbyPlaceCategory {
  return PLACE_TYPE_CATEGORIES[primaryType] ?? "culture_community";
}

export class GoogleLocationAdapter implements LocationAdapter {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: GoogleLocationAdapterOptions) {
    this.apiKey = z.string().trim().min(1).parse(options.apiKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = z
      .number()
      .int()
      .positive()
      .parse(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  async reverseGeocode(input: Coordinates): Promise<ResolvedAddress | null> {
    const coordinates = CoordinatesSchema.parse(input);
    const url = new URL(GEOCODING_ENDPOINT);
    url.searchParams.set("location.latitude", String(coordinates.latitude));
    url.searchParams.set("location.longitude", String(coordinates.longitude));
    url.searchParams.set("languageCode", "en");
    url.searchParams.set("regionCode", "GB");

    const payload = parseProviderResponse(
      GeocodingResponseSchema,
      await this.requestJson(url, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": GEOCODING_FIELD_MASK,
        },
      }),
    );
    const result = payload.results[0];

    if (!result) {
      return null;
    }

    const components = result.addressComponents ?? [];
    const route = addressPart(components, ["route"]);
    const streetNumber = addressPart(components, ["street_number"]);
    const street = [streetNumber, route].filter(Boolean).join(" ") || null;

    return ResolvedAddressSchema.parse({
      formatted: result.formattedAddress,
      street,
      neighbourhood: addressPart(components, [
        "neighborhood",
        "sublocality_level_1",
        "sublocality",
        "postal_town",
      ]),
      postalCode: addressPart(components, ["postal_code"]),
      placeId: result.placeId ?? null,
    });
  }

  async searchNearby(input: Coordinates): Promise<NearbyPlace[]> {
    const coordinates = CoordinatesSchema.parse(input);
    const payload = parseProviderResponse(
      NearbySearchResponseSchema,
      await this.requestJson(NEARBY_SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
        body: JSON.stringify({
          includedTypes: INCLUDED_PLACE_TYPES,
          maxResultCount: MAX_NEARBY_RESULTS,
          rankPreference: "DISTANCE",
          languageCode: "en",
          regionCode: "GB",
          locationRestriction: {
            circle: {
              center: coordinates,
              radius: SEARCH_RADIUS_METERS,
            },
          },
        }),
      }),
    );

    return payload.places.slice(0, MAX_NEARBY_RESULTS).map((place) =>
      NearbyPlaceSchema.parse({
        placeId: place.id,
        name: place.displayName.text,
        primaryType: place.primaryType,
        category: normalizeNearbyPlaceCategory(place.primaryType),
        shortAddress: place.shortFormattedAddress ?? null,
        coordinates: place.location,
      }),
    );
  }

  private async requestJson(input: string | URL, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new LocationProviderError(
          "provider_unavailable",
          "Google location provider request failed.",
          { status: response.status },
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw new LocationProviderError(
          "invalid_response",
          "Google location provider returned invalid JSON.",
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof LocationProviderError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new LocationProviderError(
          "provider_timeout",
          "Google location provider request timed out.",
          { cause: error },
        );
      }

      throw new LocationProviderError(
        "provider_unavailable",
        "Google location provider could not be reached.",
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
