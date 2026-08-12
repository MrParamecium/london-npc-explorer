import {
  NearbyPlaceSchema,
  ResolvedAddressSchema,
  type Coordinates,
  type NearbyPlace,
  type NearbyPlaceCategory,
  type ResolvedAddress,
} from "./contracts";
import {
  coordinateCacheKey,
  normalizeCoordinates,
} from "./coordinate-normalization";
import type { LocationAdapter } from "./location-adapter";

const MOCK_PLACES: Array<{
  name: string;
  primaryType: string;
  category: NearbyPlaceCategory;
}> = [
  { name: "Corner Cup", primaryType: "cafe", category: "food" },
  { name: "Market Kitchen", primaryType: "restaurant", category: "food" },
  { name: "Daily Market", primaryType: "supermarket", category: "retail" },
  {
    name: "High Street Pharmacy",
    primaryType: "pharmacy",
    category: "healthcare",
  },
  {
    name: "Neighbourhood Health Centre",
    primaryType: "doctor",
    category: "healthcare",
  },
  { name: "Local Bus Stop", primaryType: "bus_station", category: "transit" },
  {
    name: "City Rail Station",
    primaryType: "train_station",
    category: "transit",
  },
  {
    name: "Community Library",
    primaryType: "library",
    category: "culture_community",
  },
  { name: "Pocket Park", primaryType: "park", category: "park" },
  {
    name: "Local Primary School",
    primaryType: "school",
    category: "education",
  },
];

function hashCoordinate(coordinates: Coordinates) {
  return [...coordinateCacheKey(coordinates)].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
}

export class MockLocationAdapter implements LocationAdapter {
  async reverseGeocode(input: Coordinates): Promise<ResolvedAddress> {
    const coordinates = normalizeCoordinates(input);
    const seed = hashCoordinate(coordinates);
    const streetNumber = (seed % 180) + 1;

    return ResolvedAddressSchema.parse({
      formatted: `${streetNumber} Atlas Street, London EC1A 1AA, UK`,
      street: `${streetNumber} Atlas Street`,
      neighbourhood: "Central London",
      postalCode: "EC1A 1AA",
      placeId: `mock-address-${seed}`,
    });
  }

  async searchNearby(input: Coordinates): Promise<NearbyPlace[]> {
    const coordinates = normalizeCoordinates(input);
    const seed = hashCoordinate(coordinates);

    return MOCK_PLACES.map((place, index) => {
      const angle = ((seed % 360) + index * 137.5) * (Math.PI / 180);
      const distance = 0.00035 + index * 0.000035;

      return NearbyPlaceSchema.parse({
        placeId: `mock-place-${seed}-${index}`,
        name: place.name,
        primaryType: place.primaryType,
        category: place.category,
        shortAddress: `${index + 1} Atlas Street`,
        coordinates: normalizeCoordinates({
          latitude: coordinates.latitude + Math.cos(angle) * distance,
          longitude: coordinates.longitude + Math.sin(angle) * distance,
        }),
      });
    });
  }
}
