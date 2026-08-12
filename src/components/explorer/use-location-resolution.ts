"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  LocationResolutionErrorSchema,
  ResolvedLocationSchema,
  type Coordinates,
  type ResolvedLocation,
} from "@/lib/location/contracts";
import {
  coordinateCacheKey,
  normalizeCoordinates,
} from "@/lib/location/coordinate-normalization";

export type LocationResolutionStatus =
  "idle" | "resolving" | "ready" | "partial" | "unsupported" | "error";

type LocationResolutionState = {
  status: LocationResolutionStatus;
  result: ResolvedLocation | null;
  error: string | null;
  stale: boolean;
};

const INITIAL_STATE: LocationResolutionState = {
  status: "idle",
  result: null,
  error: null,
  stale: false,
};

function resultStatus(result: ResolvedLocation): LocationResolutionStatus {
  if (!result.supported) return "unsupported";
  if (!result.address || !result.provenance.googleResolvedAt) return "partial";
  return "ready";
}

export function useLocationResolution(fetchImpl: typeof fetch = fetch) {
  const [state, setState] = useState(INITIAL_STATE);
  const cacheRef = useRef(new Map<string, ResolvedLocation>());
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const resolve = useCallback(
    async (input: Coordinates) => {
      const coordinates = normalizeCoordinates(input);
      const cacheKey = coordinateCacheKey(coordinates);
      const cached = cacheRef.current.get(cacheKey);

      controllerRef.current?.abort();
      const requestId = ++requestRef.current;

      if (cached) {
        setState({
          status: resultStatus(cached),
          result: cached,
          error: null,
          stale: false,
        });
        return cached;
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      setState((current) => ({
        status: "resolving",
        result: current.result,
        error: null,
        stale: current.result !== null,
      }));

      try {
        const response = await fetchImpl("/api/locations/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(coordinates),
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (requestId !== requestRef.current) return null;

        if (!response.ok) {
          const error = LocationResolutionErrorSchema.safeParse(payload);
          throw new Error(
            error.success
              ? error.data.error.message
              : "Location lookup failed. Try again.",
          );
        }

        const result = ResolvedLocationSchema.parse(payload);
        cacheRef.current.set(cacheKey, result);
        setState({
          status: resultStatus(result),
          result,
          error: null,
          stale: false,
        });
        return result;
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestRef.current) {
          return null;
        }

        setState((current) => ({
          status: "error",
          result: current.result,
          error:
            error instanceof Error
              ? error.message
              : "Location lookup failed. Try again.",
          stale: current.result !== null,
        }));
        return null;
      }
    },
    [fetchImpl],
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { ...state, resolve };
}
