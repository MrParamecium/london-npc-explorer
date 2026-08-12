import type { Coordinates, NearbyPlace, ResolvedAddress } from "./contracts";

export interface LocationAdapter {
  reverseGeocode(coordinates: Coordinates): Promise<ResolvedAddress | null>;
  searchNearby(coordinates: Coordinates): Promise<NearbyPlace[]>;
}

export type LocationProviderErrorCode =
  "provider_timeout" | "provider_unavailable" | "invalid_response";

export class LocationProviderError extends Error {
  readonly code: LocationProviderErrorCode;
  readonly status: number | null;

  constructor(
    code: LocationProviderErrorCode,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, { cause: options?.cause });
    this.name = "LocationProviderError";
    this.code = code;
    this.status = options?.status ?? null;
  }
}
