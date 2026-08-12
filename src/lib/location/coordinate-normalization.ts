import { CoordinatesSchema, type Coordinates } from "./contracts";

const COORDINATE_PRECISION = 6;

function roundCoordinate(value: number) {
  const rounded = Number(value.toFixed(COORDINATE_PRECISION));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeCoordinates(input: Coordinates): Coordinates {
  const coordinates = CoordinatesSchema.parse(input);

  return {
    latitude: roundCoordinate(coordinates.latitude),
    longitude: roundCoordinate(coordinates.longitude),
  };
}

export function coordinateCacheKey(input: Coordinates) {
  const coordinates = normalizeCoordinates(input);
  return [coordinates.latitude, coordinates.longitude]
    .map((coordinate) => coordinate.toFixed(COORDINATE_PRECISION))
    .join(",");
}
