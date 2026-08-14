import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  validCanonicalProfileV2,
  validCurrentState,
} from "../../../tests/fixtures/domain";

import { useNpcGeneration } from "./use-npc-generation";

const coordinates = { latitude: 51.5202, longitude: -0.0979 };
const portraitUrl =
  "https://store.public.blob.vercel-storage.com/npc-portraits/job.png";

function completedResponse() {
  return new Response(
    JSON.stringify({
      jobId: "33333333-3333-4333-8333-333333333333",
      status: "completed",
      stage: "completed",
      npcId: "44444444-4444-4444-8444-444444444444",
      failure: null,
      npc: {
        npcId: "44444444-4444-4444-8444-444444444444",
        locationId: "11111111-1111-4111-8111-111111111111",
        seed: "fixture-npc-seed-001",
        canonicalProfile: validCanonicalProfileV2,
        currentState: validCurrentState,
        versionSet: {
          datasetVersionIds: ["22222222-2222-4222-8222-222222222222"],
          probabilityEngineVersion: "london-conditional-v1",
          templateVersion: "london-fiction-v1",
          textModel: null,
          imageModel: "openai/gpt-image-2",
        },
        fieldProvenance: {
          "/identity/age": {
            kind: "statistical",
            datasetVersionId: "22222222-2222-4222-8222-222222222222",
            metric: "adult_age_sex",
            geographyLevel: "lsoa",
            geographyCode: "E01000001",
            sourceRelease: "mid-2024",
            transformVersion: "statistics-v1",
          },
        },
        narrative:
          "A fictional London resident is walking towards a scheduled museum programme.",
        portraitUrl,
        visibleAt: "2026-08-14T08:00:00.000Z",
        createdAt: "2026-08-14T08:00:00.000Z",
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("useNpcGeneration", () => {
  it("keeps the new NPC hidden until portrait persistence completes", async () => {
    vi.useFakeTimers();
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const { result } = renderHook(() => useNpcGeneration(fetchImpl));

    act(() => {
      void result.current.generate(coordinates);
    });
    expect(result.current.stage).toBe("profile");
    expect(result.current.npc).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.stage).toBe("portrait");
    expect(result.current.npc).toBeNull();

    await act(async () => {
      resolveResponse?.(completedResponse());
      await Promise.resolve();
    });
    expect(result.current.stage).toBe("persistence");
    expect(result.current.npc).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.npc?.portraitUrl).toBe(portraitUrl);
    expect(result.current.state).toBe("ready");

    vi.useRealTimers();
  });

  it("uses a fresh idempotency key for a manual retry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "portrait_failed",
            message: "Portrait generation failed.",
            retryable: true,
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    const { result } = renderHook(() => useNpcGeneration(fetchImpl));

    await act(async () => {
      await result.current.generate(coordinates);
    });
    expect(result.current.state).toBe("error");

    await act(async () => {
      await result.current.generate(coordinates);
    });

    const firstBody = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body),
    ) as { idempotencyKey: string };
    const secondBody = JSON.parse(
      String(fetchImpl.mock.calls[1]?.[1]?.body),
    ) as { idempotencyKey: string };
    expect(secondBody.idempotencyKey).not.toBe(firstBody.idempotencyKey);
    expect(result.current.npc).toBeNull();
  });
});
