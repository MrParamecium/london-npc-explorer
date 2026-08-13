# NPC Dialogue Frontend Design

Date: 2026-08-14  
Status: Approved for implementation

## 1. Objective

Connect the existing NPC profile interface to the authenticated OpenRouter
dialogue endpoint. A signed-in user can hold a multi-turn conversation with the
currently selected fictional NPC without leaving the explorer.

V1 conversation state exists only in the current browser page. Refreshing the
page, generating another NPC, or reopening a different NPC starts a new
conversation. Persisted conversations, streaming tokens, voice, model controls,
and long-term agent memory are outside this loop.

## 2. Confirmed Interaction

1. A completed NPC profile reveals a dialogue section below the profile.
2. The user enters one message and submits it with the send button or Enter.
3. The existing transcript remains visible while the response is pending.
4. The browser posts the complete page-local transcript, ending with the new
   user message, to `POST /api/chat/{npcId}`.
5. The NPC response displays speech, action, and emotion as one response unit.
6. The user can continue the conversation; each request carries the complete
   transcript needed by the stateless backend.
7. Changing the active NPC clears the transcript and draft so one character
   never inherits another character's conversation.

The UI uses the NPC's saved identity and does not expose provider or model
selection. Token and cost metadata remain available in the parsed response for
diagnostics but are not shown in the normal conversation interface.

## 3. Component Boundaries

`useNpcDialogue` owns the current transcript, request state, draft-independent
send operation, safe response parsing, and reset-on-NPC behavior. It accepts a
replaceable `fetch` implementation so component tests do not call OpenRouter.

`NpcDialogue` renders the transcript, action and emotion details, an accessible
composer, pending state, and retryable error text. It receives the active NPC ID
and display name rather than the full statistical profile.

`ExplorerShell` composes the dialogue below `NpcProfile`. Generation, profile
history, and dialogue remain separate state machines. A failed dialogue request
must not hide or replace the NPC profile.

## 4. Data Flow

The frontend stores display messages with user or assistant roles. Assistant
responses retain the structured reply but send only the NPC speech back as the
assistant conversation content on the next request. The endpoint remains the
authority for authentication, NPC ownership, request size, throttling, system
prompt construction, provider timeout, and output validation.

Successful responses are parsed with `ChatResponseSchema`. Public API errors are
parsed with the existing safe error schema. Unknown or invalid responses become
a generic retryable message and never expose upstream response bodies.

Only one dialogue request may be active. A second submit while pending is
disabled. Changing NPC aborts the active request and discards any late response.

## 5. UI and Accessibility

The dialogue is an unframed continuation of the right-hand NPC workspace, not a
nested decorative card. User and NPC turns have distinct but restrained
alignment and colour treatment within the existing light blue and coral palette.

The composer has a stable-height text area, an icon send button with a tooltip,
and an explicit label for assistive technology. Enter submits; Shift+Enter adds a
line break. The transcript uses `aria-live="polite"`; request and error states do
not resize the surrounding layout unexpectedly.

On mobile, message text wraps without horizontal scrolling and the composer
remains within the 390-pixel viewport used by the existing visual checks.

## 6. Failure Handling

- `401`: show a concise sign-in/session message without clearing the transcript.
- `404`: report that the NPC is unavailable; keep the profile visible.
- `429`: show the safe rate-limit message and allow a later retry.
- `503` or `504`: preserve the draft and transcript and allow the same message to
  be retried.
- Invalid response or network failure: show a generic temporary failure message.
- NPC change or component unmount: abort the request without showing an error.

The user's pending text is removed only after a successful NPC response. This
keeps the exact message available when a request fails.

## 7. Testing and Acceptance

Component tests cover successful multi-turn requests, pending-button behaviour,
safe failures with retained drafts, and transcript reset when the NPC changes.
Explorer tests confirm that a generated NPC exposes the real dialogue composer
instead of the placeholder.

The loop is complete when type checking, focused tests, the full test suite, and
the production build pass, and desktop/mobile browser inspection shows no
overflow or overlapping controls. A fake fetch validates the complete UI path;
one live OpenRouter smoke test may be run only with the server-side local key and
must not print or persist that key.
