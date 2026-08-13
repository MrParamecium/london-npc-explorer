"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import { LoaderCircle, SendHorizontal } from "lucide-react";

import { useNpcDialogue } from "./use-npc-dialogue";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function humanizeEmotion(emotion: string) {
  return emotion.replaceAll("_", " ");
}

export function NpcDialogue({
  npcId,
  npcName,
  fetchImpl,
}: {
  npcId: string;
  npcName: string;
  fetchImpl?: typeof fetch;
}) {
  const [draft, setDraft] = useState("");
  const { turns, status, error, send } = useNpcDialogue(npcId, fetchImpl);
  const isSending = status === "sending";
  const givenName = firstName(npcName);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || isSending) return;

    if (await send(draft)) setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="dialogue-workspace" aria-labelledby="dialogue-title">
      <div className="dialogue-heading">
        <div>
          <span className="eyebrow">Live encounter</span>
          <h3 id="dialogue-title">Talk with {givenName}</h3>
        </div>
        <span className="dialogue-page-state">Page only</span>
      </div>

      <div className="dialogue-log" aria-live="polite">
        {turns.length === 0 ? (
          <p className="dialogue-empty">
            Start with what you notice, or ask {givenName} what brings them
            here.
          </p>
        ) : (
          turns.map((turn) =>
            turn.role === "user" ? (
              <article
                className="dialogue-turn dialogue-turn-user"
                key={turn.id}
              >
                <span>You</span>
                <p>{turn.content}</p>
              </article>
            ) : (
              <article
                className="dialogue-turn dialogue-turn-npc"
                key={turn.id}
              >
                <span>{givenName}</span>
                <p>{turn.content}</p>
                <p className="dialogue-action">{turn.action}</p>
                <small className="dialogue-emotion">
                  {humanizeEmotion(turn.emotion)}
                </small>
              </article>
            ),
          )
        )}
      </div>

      <form className="dialogue-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={`dialogue-${npcId}`}>
          Message {npcName}
        </label>
        <textarea
          id={`dialogue-${npcId}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Say something to ${givenName}...`}
          maxLength={4_000}
          rows={3}
          disabled={isSending}
        />
        <button
          type="submit"
          aria-label="Send message"
          title="Send message"
          disabled={isSending || !draft.trim()}
        >
          {isSending ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <SendHorizontal size={17} />
          )}
        </button>
      </form>

      <div className="dialogue-status" aria-live="polite">
        {isSending ? (
          <p role="status">{givenName} is responding...</p>
        ) : error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p>Enter sends / Shift+Enter adds a line</p>
        )}
      </div>
    </section>
  );
}
