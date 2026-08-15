import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NpcDialogue } from "./npc-dialogue";

const NPC_ID = "11111111-1111-4111-8111-111111111111";
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
const emptyHistory = { messages: [] };

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

describe("NpcDialogue", () => {
  it("renders an accessible composer and a structured NPC reply", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(emptyHistory))
      .mockResolvedValueOnce(jsonResponse(completion));

    render(
      <NpcDialogue
        npcId={NPC_ID}
        npcName="Rowan Ellis"
        fetchImpl={fetchImpl}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Talk with Rowan" }),
    ).toBeInTheDocument();
    const composer = screen.getByLabelText("Message Rowan Ellis");
    await waitFor(() => expect(composer).toBeEnabled());
    expect(screen.getByText("Saved")).toBeInTheDocument();
    await user.type(composer, "Are you waiting long?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText("Only a minute. The library opens shortly."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Rowan folds the local notice back into their canvas bag.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("quietly amused")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("retains the exact draft after a safe route failure", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(emptyHistory))
      .mockResolvedValueOnce(
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

    render(
      <NpcDialogue
        npcId={NPC_ID}
        npcName="Rowan Ellis"
        fetchImpl={fetchImpl}
      />,
    );

    const composer = screen.getByLabelText("Message Rowan Ellis");
    await waitFor(() => expect(composer).toBeEnabled());
    await user.type(composer, "  Please try that again.  ");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The NPC took too long to respond. Try again.",
    );
    expect(composer).toHaveValue("  Please try that again.  ");
  });

  it("disables the composer while the NPC reply is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(emptyHistory))
      .mockReturnValueOnce(pending.promise);

    render(
      <NpcDialogue
        npcId={NPC_ID}
        npcName="Rowan Ellis"
        fetchImpl={fetchImpl}
      />,
    );

    const composer = screen.getByLabelText("Message Rowan Ellis");
    await waitFor(() => expect(composer).toBeEnabled());
    await user.type(composer, "Are you waiting long?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Rowan is responding");

    pending.resolve(jsonResponse(completion));
    expect(
      await screen.findByText("Only a minute. The library opens shortly."),
    ).toBeInTheDocument();
  });

  it("submits with Enter and keeps a newline with Shift+Enter", async () => {
    const user = userEvent.setup();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(emptyHistory))
      .mockResolvedValueOnce(jsonResponse(completion));

    render(
      <NpcDialogue
        npcId={NPC_ID}
        npcName="Rowan Ellis"
        fetchImpl={fetchImpl}
      />,
    );

    const composer = screen.getByLabelText("Message Rowan Ellis");
    await waitFor(() => expect(composer).toBeEnabled());
    await user.type(composer, "First line{shift>}{enter}{/shift}Second line");

    expect(composer).toHaveValue("First line\nSecond line");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await user.type(composer, "{enter}");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      messages: [{ role: "user", content: "First line\nSecond line" }],
    });
  });
});
