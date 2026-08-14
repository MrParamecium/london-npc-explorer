"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Coordinates } from "@/lib/location/contracts";
import {
  ProfileGenerationResponseSchema,
  ProfileHistoryResponseSchema,
  PublicApiErrorSchema,
  PublicProfileNpcSchema,
  type PublicProfileNpc,
} from "@/lib/generation/public-profile-contracts";

type GenerationState = "idle" | "generating" | "ready" | "error";
type HistoryState = "idle" | "loading" | "ready" | "error";
export type NpcGenerationStage = "profile" | "portrait" | "persistence";

const MAX_STATUS_ATTEMPTS = 15;

function newIdempotencyKey() {
  return `npc-${
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }`;
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Request aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = PublicApiErrorSchema.safeParse(payload);
  return parsed.success
    ? parsed.data.error.message
    : "NPC service is temporarily unavailable.";
}

function prependUnique(history: PublicProfileNpc[], npc: PublicProfileNpc) {
  return [npc, ...history.filter((item) => item.npcId !== npc.npcId)];
}

function coarseStage(stage: string): NpcGenerationStage {
  if (stage === "portrait") return "portrait";
  if (stage === "persistence" || stage === "completed") return "persistence";
  return "profile";
}

const STAGE_ORDER: Record<NpcGenerationStage, number> = {
  profile: 0,
  portrait: 1,
  persistence: 2,
};

export function useNpcGeneration(fetchImpl: typeof fetch = fetch) {
  const [state, setState] = useState<GenerationState>("idle");
  const [stage, setStage] = useState<NpcGenerationStage>("profile");
  const [npc, setNpc] = useState<PublicProfileNpc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PublicProfileNpc[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const historyControllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (coordinates: Coordinates) => {
      generationControllerRef.current?.abort();
      const controller = new AbortController();
      generationControllerRef.current = controller;
      const idempotencyKey = newIdempotencyKey();

      setState("generating");
      setStage("profile");
      setError(null);

      const portraitTimer = window.setTimeout(() => {
        if (!controller.signal.aborted) setStage("portrait");
      }, 800);

      try {
        for (let attempt = 0; attempt < MAX_STATUS_ATTEMPTS; attempt += 1) {
          const response = await fetchImpl("/api/npcs/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ coordinates, idempotencyKey }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(await readError(response));

          const result = ProfileGenerationResponseSchema.parse(
            await response.json(),
          );
          const responseStage = coarseStage(result.stage);
          setStage((current) =>
            STAGE_ORDER[responseStage] >= STAGE_ORDER[current]
              ? responseStage
              : current,
          );

          if (result.status === "completed" && result.npc) {
            window.clearTimeout(portraitTimer);
            setStage("persistence");
            await wait(250, controller.signal);
            setNpc(result.npc);
            setHistory((current) => prependUnique(current, result.npc!));
            setState("ready");
            return result.npc;
          }
          if (result.status === "failed") {
            throw new Error(
              result.failure?.message ?? "NPC generation failed. Try again.",
            );
          }

          await wait(800, controller.signal);
        }
        throw new Error("NPC generation timed out. Try again.");
      } catch (requestError) {
        if (controller.signal.aborted) return null;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "NPC generation failed. Try again.",
        );
        setState("error");
        return null;
      } finally {
        window.clearTimeout(portraitTimer);
      }
    },
    [fetchImpl],
  );

  const loadHistory = useCallback(
    async ({ append = false }: { append?: boolean } = {}) => {
      historyControllerRef.current?.abort();
      const controller = new AbortController();
      historyControllerRef.current = controller;
      const cursor = append ? nextCursor : null;
      if (append && !cursor) return;

      setHistoryState("loading");
      setHistoryError(null);
      try {
        const search = new URLSearchParams({ limit: "20" });
        if (cursor) search.set("cursor", cursor);
        const response = await fetchImpl(`/api/npcs?${search}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readError(response));
        const result = ProfileHistoryResponseSchema.parse(
          await response.json(),
        );
        setHistory((current) =>
          append
            ? [
                ...current,
                ...result.items.filter(
                  (item) =>
                    !current.some((existing) => existing.npcId === item.npcId),
                ),
              ]
            : result.items,
        );
        setNextCursor(result.nextCursor);
        setHistoryState("ready");
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setHistoryError(
          requestError instanceof Error
            ? requestError.message
            : "NPC history is temporarily unavailable.",
        );
        setHistoryState("error");
      }
    },
    [fetchImpl, nextCursor],
  );

  const reopen = useCallback(
    async (npcId: string) => {
      setError(null);
      try {
        const response = await fetchImpl(`/api/npcs/${npcId}`);
        if (!response.ok) throw new Error(await readError(response));
        const selected = PublicProfileNpcSchema.parse(await response.json());
        setNpc(selected);
        setState("ready");
        return selected;
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "NPC could not be reopened.",
        );
        return null;
      }
    },
    [fetchImpl],
  );

  const resetForLocation = useCallback(() => {
    generationControllerRef.current?.abort();
    setState(npc ? "ready" : "idle");
    setStage("profile");
    setError(null);
  }, [npc]);

  useEffect(
    () => () => {
      generationControllerRef.current?.abort();
      historyControllerRef.current?.abort();
    },
    [],
  );

  return {
    state,
    stage,
    npc,
    error,
    history,
    historyState,
    historyError,
    nextCursor,
    generate,
    loadHistory,
    reopen,
    resetForLocation,
  };
}
