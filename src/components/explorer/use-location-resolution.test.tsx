import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { validResolvedLocation } from "../../../tests/fixtures/domain";
import { useLocationResolution } from "./use-location-resolution";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useLocationResolution", () => {
  it("resolves and caches an equivalent normalized coordinate", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(validResolvedLocation));
    const { result } = renderHook(() => useLocationResolution(fetchImpl));

    await act(() =>
      result.current.resolve({ latitude: 51.5202004, longitude: -0.0979004 }),
    );
    await act(() =>
      result.current.resolve({ latitude: 51.52020049, longitude: -0.09790049 }),
    );

    expect(result.current.status).toBe("ready");
    expect(result.current.result).toEqual(validResolvedLocation);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("labels provider-degraded results as partial", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ...validResolvedLocation,
        address: null,
      }),
    );
    const { result } = renderHook(() => useLocationResolution(fetchImpl));

    await act(() => result.current.resolve(validResolvedLocation.coordinates));

    expect(result.current.status).toBe("partial");
  });

  it("labels an outside-London result as unsupported", async () => {
    const unsupported = {
      coordinates: { latitude: 53.4808, longitude: -2.2426 },
      supported: false,
      geography: null,
      address: null,
      nearbyPlaces: [],
      provenance: {
        geographyDatasets: ["LAD May 2025 BGC V2"],
        googleResolvedAt: null,
      },
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(unsupported));
    const { result } = renderHook(() => useLocationResolution(fetchImpl));

    await act(() => result.current.resolve(unsupported.coordinates));

    expect(result.current.status).toBe("unsupported");
    expect(result.current.result).toEqual(unsupported);
  });

  it("discards a late response from an older selection", async () => {
    let releaseFirst: ((response: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      releaseFirst = resolve;
    });
    const secondResult = {
      ...validResolvedLocation,
      coordinates: { latitude: 51.5014, longitude: -0.1419 },
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(jsonResponse(secondResult));
    const { result } = renderHook(() => useLocationResolution(fetchImpl));

    let firstPromise: Promise<unknown>;
    act(() => {
      firstPromise = result.current.resolve(validResolvedLocation.coordinates);
    });
    await act(() => result.current.resolve(secondResult.coordinates));
    releaseFirst?.(jsonResponse(validResolvedLocation));
    await act(() => firstPromise!);

    await waitFor(() => expect(result.current.result).toEqual(secondResult));
  });

  it("keeps a structured, secret-safe route error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "rate_limited",
            message: "Too many location requests. Try again shortly.",
            retryable: true,
          },
        },
        429,
      ),
    );
    const { result } = renderHook(() => useLocationResolution(fetchImpl));

    await act(() => result.current.resolve(validResolvedLocation.coordinates));

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "Too many location requests. Try again shortly.",
    );
  });
});
