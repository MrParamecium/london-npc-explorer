"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChatResponseSchema,
  DialogueHistoryResponseSchema,
  type DialogueHistoryTurn,
} from "@/lib/ai/contracts";
import { PublicApiErrorSchema } from "@/lib/generation/public-profile-contracts";

export type DialogueTurn = DialogueHistoryTurn;

type DialogueStatus = "loading" | "idle" | "sending" | "error";

type DialogueState = {
  npcId: string;
  turns: DialogueTurn[];
  status: DialogueStatus;
  error: string | null;
};

const GENERIC_DIALOGUE_ERROR = "The NPC is temporarily unavailable. Try again.";

class PublicDialogueError extends Error {}

function emptyDialogue(
  npcId: string,
  status: DialogueStatus = "loading",
): DialogueState {
  return { npcId, turns: [], status, error: null };
}

function newTurnId() {
  return `turn-${
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }`;
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = PublicApiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error.message : GENERIC_DIALOGUE_ERROR;
}

export function useNpcDialogue(npcId: string, fetchImpl: typeof fetch = fetch) {
  const [dialogue, setDialogue] = useState<DialogueState>(() =>
    emptyDialogue(npcId),
  );
  const controllerRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  const currentDialogue =
    dialogue.npcId === npcId ? dialogue : emptyDialogue(npcId);

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    async function loadHistory() {
      try {
        const response = await fetchImpl(`/api/chat/${npcId}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new PublicDialogueError(await readError(response));
        }
        const history = DialogueHistoryResponseSchema.parse(
          await response.json(),
        );
        if (
          controller.signal.aborted ||
          requestVersion !== requestVersionRef.current
        ) {
          return;
        }

        setDialogue({
          npcId,
          turns: history.messages,
          status: "idle",
          error: null,
        });
        controllerRef.current = null;
      } catch (requestError) {
        if (
          controller.signal.aborted ||
          requestVersion !== requestVersionRef.current
        ) {
          return;
        }

        setDialogue({
          npcId,
          turns: [],
          status: "error",
          error:
            requestError instanceof PublicDialogueError
              ? requestError.message
              : GENERIC_DIALOGUE_ERROR,
        });
        controllerRef.current = null;
      }
    }

    void loadHistory();

    return () => {
      controller.abort();
      requestVersionRef.current += 1;
    };
  }, [fetchImpl, npcId]);

  const send = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();
      if (
        !trimmedContent ||
        currentDialogue.status === "loading" ||
        currentDialogue.status === "sending"
      ) {
        return false;
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;

      setDialogue((current) => ({
        ...(current.npcId === npcId ? current : emptyDialogue(npcId, "idle")),
        status: "sending",
        error: null,
      }));

      try {
        const response = await fetchImpl(`/api/chat/${npcId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: trimmedContent }],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new PublicDialogueError(await readError(response));
        }
        const completion = ChatResponseSchema.parse(await response.json());

        if (
          controller.signal.aborted ||
          requestVersion !== requestVersionRef.current
        ) {
          return false;
        }

        setDialogue({
          npcId,
          turns: [
            ...currentDialogue.turns,
            {
              id: newTurnId(),
              role: "user" as const,
              content: trimmedContent,
            },
            {
              id: newTurnId(),
              role: "assistant" as const,
              content: completion.reply.speech,
              action: completion.reply.action,
              emotion: completion.reply.emotion,
            },
          ].slice(-40),
          status: "idle",
          error: null,
        });
        controllerRef.current = null;
        return true;
      } catch (requestError) {
        if (
          controller.signal.aborted ||
          requestVersion !== requestVersionRef.current
        ) {
          return false;
        }

        setDialogue({
          npcId,
          turns: currentDialogue.turns,
          status: "error",
          error:
            requestError instanceof PublicDialogueError
              ? requestError.message
              : GENERIC_DIALOGUE_ERROR,
        });
        controllerRef.current = null;
        return false;
      }
    },
    [currentDialogue, fetchImpl, npcId],
  );

  return { ...currentDialogue, send };
}
