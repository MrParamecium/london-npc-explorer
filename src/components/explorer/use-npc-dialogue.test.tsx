import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useNpcDialogue } from "./use-npc-dialogue";

const completion = {
  reply: {
    speech: "Only a minute. The library opens shortly.",
    action: "Rowan folds the local notice back into their canvas bag.",
    emotion: "quietly_amused",
    memory_update: null,
  },
  metadata: {
    provider: "openrouter",
    model: "openai/gpt-4.1-mini",
    usage: {
      promptTokens: 300,
      completionTokens: 42,
      totalTokens: 342,
      costUsd: 0.0001,
    },
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

describe("useNpcDialogue", () => {
  it("sends the page-local transcript and retains structured NPC replies", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(completion));
    const { result } = renderHook(() =>
      useNpcDialogue("11111111-1111-4111-8111-111111111111", fetchImpl),
    );

    await act(() => result.current.send("Are you waiting long?"));

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/chat/11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Are you waiting long?" }],
        }),
      }),
    );
    expect(result.current.turns).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Are you waiting long?",
      }),
      expect.objectContaining({
        role: "assistant",
        content: completion.reply.speech,
        action: completion.reply.action,
        emotion: completion.reply.emotion,
      }),
    ]);

    await act(() => result.current.send("Do you come here every day?"));

    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      messages: [
        { role: "user", content: "Are you waiting long?" },
        { role: "assistant", content: completion.reply.speech },
        { role: "user", content: "Do you come here every day?" },
      ],
    });
  });

  it("keeps the transcript unchanged when the safe route response fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "provider_timeout",
            message: "The NPC took too long to respond. Try again.",
            retryable: true,
          },
        },
        504,
      ),
    );
    const { result } = renderHook(() =>
      useNpcDialogue("11111111-1111-4111-8111-111111111111", fetchImpl),
    );

    let sent = true;
    await act(async () => {
      sent = await result.current.send("Are you still there?");
    });

    expect(sent).toBe(false);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(
      "The NPC took too long to respond. Try again.",
    );
    expect(result.current.turns).toEqual([]);
  });

  it("hides invalid upstream response details behind a generic error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ upstream: "unexpected payload" }));
    const { result } = renderHook(() =>
      useNpcDialogue("11111111-1111-4111-8111-111111111111", fetchImpl),
    );

    await act(() => result.current.send("Can you hear me?"));

    expect(result.current.error).toBe(
      "The NPC is temporarily unavailable. Try again.",
    );
    expect(result.current.error).not.toContain("upstream");
    expect(result.current.turns).toEqual([]);
  });

  it("aborts and ignores a late response when the active NPC changes", async () => {
    const pending = deferred<Response>();
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ npcId }) => useNpcDialogue(npcId, fetchImpl),
      { initialProps: { npcId: "11111111-1111-4111-8111-111111111111" } },
    );

    let sendPromise!: Promise<boolean>;
    act(() => {
      sendPromise = result.current.send("Hello from the first conversation.");
    });
    const signal = fetchImpl.mock.calls[0]?.[1]?.signal;

    rerender({ npcId: "22222222-2222-4222-8222-222222222222" });

    expect(signal?.aborted).toBe(true);
    expect(result.current.turns).toEqual([]);
    expect(result.current.status).toBe("idle");

    pending.resolve(jsonResponse(completion));
    await act(() => sendPromise);

    expect(result.current.turns).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
