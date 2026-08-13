"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatResponseSchema } from "@/lib/ai/contracts";
import { PublicApiErrorSchema } from "@/lib/generation/public-profile-contracts";

export type DialogueTurn =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      action: string;
      emotion: string;
    };

type DialogueStatus = "idle" | "sending" | "error";

type DialogueState = {
  npcId: string;
  turns: DialogueTurn[];
  status: DialogueStatus;
  error: string | null;
};

const GENERIC_DIALOGUE_ERROR = "The NPC is temporarily unavailable. Try again.";

class PublicDialogueError extends Error {}

function emptyDialogue(npcId: string): DialogueState {
  return { npcId, turns: [], status: "idle", error: null };
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

  if (dialogue.npcId !== npcId) {
    setDialogue(emptyDialogue(npcId));
  }

  const currentDialogue =
    dialogue.npcId === npcId ? dialogue : emptyDialogue(npcId);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestVersionRef.current += 1;

    return () => {
      controllerRef.current?.abort();
      requestVersionRef.current += 1;
    };
  }, [npcId]);

  const send = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return false;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;

      setDialogue((current) => ({
        ...(current.npcId === npcId ? current : emptyDialogue(npcId)),
        status: "sending",
        error: null,
      }));

      const messages = [
        ...currentDialogue.turns.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        { role: "user" as const, content: trimmedContent },
      ];

      try {
        const response = await fetchImpl(`/api/chat/${npcId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages }),
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
            { id: newTurnId(), role: "user", content: trimmedContent },
            {
              id: newTurnId(),
              role: "assistant",
              content: completion.reply.speech,
              action: completion.reply.action,
              emotion: completion.reply.emotion,
            },
          ],
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
    [currentDialogue.turns, fetchImpl, npcId],
  );

  return { ...currentDialogue, send };
}
