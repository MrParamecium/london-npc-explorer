# NPC Dialogue Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the explorer's dialogue placeholder with a tested, page-local, multi-turn NPC conversation that calls the authenticated OpenRouter chat endpoint.

**Architecture:** A client hook owns the active NPC transcript, request lifecycle, safe parsing, cancellation, and reset behavior. A focused presentation component owns the composer and structured reply rendering, while `ExplorerShell` only supplies the current NPC and replaceable fetch dependency.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod, Vitest, React Testing Library, lucide-react, CSS.

**Spec:** `docs/superpowers/specs/2026-08-14-npc-dialogue-frontend-design.md`

## Global Constraints

- Conversations remain only in current React page state; refresh clears them.
- Changing the active NPC aborts pending dialogue and clears transcript and draft.
- Do not add database tables, migrations, streaming, voice, model controls, or long-term memory.
- The browser calls only `POST /api/chat/{npcId}` and never receives `OPENROUTER_API_KEY`.
- Failed requests preserve the existing transcript and the user's draft.
- Use the existing light blue and coral operational interface; no floating support-chat bubble or nested decorative card.
- The complete interface must fit a 390-pixel viewport without horizontal overflow.

---

## File Structure

- Create `src/components/explorer/use-npc-dialogue.ts`: client dialogue state machine and API adapter.
- Create `src/components/explorer/use-npc-dialogue.test.tsx`: hook request, failure, cancellation, and reset tests.
- Create `src/components/explorer/npc-dialogue.tsx`: transcript, structured assistant turn, composer, and keyboard interaction.
- Create `src/components/explorer/npc-dialogue.test.tsx`: accessible UI, successful send, retained draft, and keyboard tests.
- Modify `src/components/explorer/explorer-shell.tsx`: replace placeholder with `NpcDialogue` and inject `dialogueFetch` for tests.
- Modify `src/components/explorer/explorer-shell.test.tsx`: verify a generated NPC exposes the real composer and endpoint wiring.
- Modify `src/app/globals.css`: replace placeholder styles with stable responsive dialogue styles.

### Task 1: Dialogue State and API Adapter

**Files:**

- Create: `src/components/explorer/use-npc-dialogue.ts`
- Test: `src/components/explorer/use-npc-dialogue.test.tsx`

**Interfaces:**

- Consumes: `ChatResponseSchema`, `PublicApiErrorSchema`, active `npcId`, and optional `fetchImpl: typeof fetch`.
- Produces: `useNpcDialogue(npcId, fetchImpl)` returning `{ turns, status, error, send }` where `send(content: string): Promise<boolean>`.
- Produces: exported `DialogueTurn` discriminated union for `NpcDialogue`.

- [ ] **Step 1: Write the failing success and multi-turn hook tests**

Use `renderHook` and `act` from React Testing Library. Resolve a valid response:

```ts
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
```

Assert the first POST body is:

```ts
{
  messages: [{ role: "user", content: "Are you waiting long?" }],
}
```

After the response, send a second user turn and assert its body includes the prior user message, prior assistant `speech`, and new user message in order. Assert the local assistant turn retains `action` and `emotion` for display.

- [ ] **Step 2: Run the hook test and verify it fails**

Run:

```bash
pnpm exec vitest run src/components/explorer/use-npc-dialogue.test.tsx
```

Expected: FAIL because `use-npc-dialogue.ts` does not exist.

- [ ] **Step 3: Implement the minimal dialogue hook**

Define the public types and state:

```ts
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
```

Build the request messages from existing turns, mapping assistant turns to their `content` speech only. POST JSON to `/api/chat/${npcId}` with an `AbortController`, parse successes with `ChatResponseSchema`, and parse public failures with `PublicApiErrorSchema`. Append the user and assistant turns only after a successful response, return `true`, and return `false` while retaining transcript on safe failure.

Generate stable page-local IDs using bound `globalThis.crypto?.randomUUID?.()` with a timestamp/random fallback. Keep only one active request; abort it before a replacement request.

- [ ] **Step 4: Add failure, abort, and NPC-reset tests**

Cover these exact cases:

```ts
expect(result.current.error).toBe(
  "The NPC took too long to respond. Try again.",
);
expect(result.current.turns).toEqual([]);
```

Rerender the hook from NPC A to NPC B while a deferred request is active. Assert the original request signal is aborted, the late response is ignored, and the transcript remains empty for NPC B.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
pnpm exec vitest run src/components/explorer/use-npc-dialogue.test.tsx
pnpm typecheck
```

Expected: all hook tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the hook**

```bash
git add src/components/explorer/use-npc-dialogue.ts src/components/explorer/use-npc-dialogue.test.tsx
git commit -m "feat: add page-local NPC dialogue state"
```

### Task 2: Accessible Dialogue Component

**Files:**

- Create: `src/components/explorer/npc-dialogue.tsx`
- Test: `src/components/explorer/npc-dialogue.test.tsx`

**Interfaces:**

- Consumes: `npcId: string`, `npcName: string`, optional `fetchImpl: typeof fetch`.
- Consumes: `useNpcDialogue(npcId, fetchImpl)` from Task 1.
- Produces: `NpcDialogue` component rendered by `ExplorerShell` in Task 3.

- [ ] **Step 1: Write failing component interaction tests**

Render `NpcDialogue` with a fake successful fetch. Assert it initially shows heading `Talk with Rowan`, textarea label `Message Rowan Ellis`, and button label `Send message`.

Type `Are you waiting long?`, click Send, and assert:

```ts
expect(
  await screen.findByText("Only a minute. The library opens shortly."),
).toBeInTheDocument();
expect(
  screen.getByText("Rowan folds the local notice back into their canvas bag."),
).toBeInTheDocument();
expect(screen.getByText("quietly amused")).toBeInTheDocument();
expect(screen.getByLabelText("Message Rowan Ellis")).toHaveValue("");
```

Add a rejected-response test that asserts the exact draft remains in the textarea and the safe server message is shown with `role="alert"`.

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
pnpm exec vitest run src/components/explorer/npc-dialogue.test.tsx
```

Expected: FAIL because `NpcDialogue` does not exist.

- [ ] **Step 3: Implement the component**

Use a controlled textarea with `maxLength={4000}`. Submit a trimmed draft through the hook and clear it only when `send` returns `true`. Handle keyboard behavior exactly:

```ts
if (event.key === "Enter" && !event.shiftKey) {
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
```

Render an empty transcript prompt, user turns, assistant speech, action, and humanized emotion. Use `aria-live="polite"` on the transcript, `role="status"` while sending, and a lucide `SendHorizontal` icon button with `aria-label` and `title`.

- [ ] **Step 4: Add pending and keyboard tests**

Use a deferred fetch to assert the send button and textarea are disabled while pending and the status text is visible. Verify Enter submits once and Shift+Enter leaves a newline without calling fetch.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
pnpm exec vitest run src/components/explorer/npc-dialogue.test.tsx src/components/explorer/use-npc-dialogue.test.tsx
pnpm typecheck
```

Expected: all dialogue tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the component**

```bash
git add src/components/explorer/npc-dialogue.tsx src/components/explorer/npc-dialogue.test.tsx
git commit -m "feat: add NPC dialogue composer"
```

### Task 3: Explorer Integration and Responsive Styling

**Files:**

- Modify: `src/components/explorer/explorer-shell.tsx:128-140,632-650`
- Modify: `src/components/explorer/explorer-shell.test.tsx:175-200`
- Modify: `src/app/globals.css:1380-1469`

**Interfaces:**

- Consumes: `NpcDialogue` from Task 2.
- Adds: optional `dialogueFetch?: typeof fetch` prop to `ExplorerShell` for deterministic tests.
- Preserves: all existing generation, history, profile, and authentication interfaces.

- [ ] **Step 1: Extend the existing explorer test to fail on the placeholder**

Inject a fake `dialogueFetch`, generate `fixtureNpc`, then assert:

```ts
expect(
  screen.getByRole("heading", { name: "Talk with Rowan" }),
).toBeInTheDocument();
expect(screen.getByLabelText("Message Rowan Ellis")).toBeInTheDocument();
expect(
  screen.queryByText("Dialogue connects in the next loop"),
).not.toBeInTheDocument();
```

Send one message and assert `dialogueFetch` receives `/api/chat/${fixtureNpc.npcId}` with `method: "POST"`.

- [ ] **Step 2: Run the explorer test and verify it fails**

Run:

```bash
pnpm exec vitest run src/components/explorer/explorer-shell.test.tsx
```

Expected: FAIL because the placeholder still renders.

- [ ] **Step 3: Wire `NpcDialogue` into `ExplorerShell`**

Remove the placeholder markup and its unused `MessageSquareText` import. Add `dialogueFetch` beside `npcFetch`, then render:

```tsx
{
  npcGeneration.npc ? (
    <NpcDialogue
      key={npcGeneration.npc.npcId}
      npcId={npcGeneration.npc.npcId}
      npcName={npcGeneration.npc.canonicalProfile.identity.fictionalName}
      fetchImpl={dialogueFetch}
    />
  ) : null;
}
```

The `key` guarantees the component draft resets immediately when another NPC becomes active.

- [ ] **Step 4: Replace placeholder CSS with dialogue workspace styles**

Create stable classes for `.dialogue-workspace`, `.dialogue-heading`, `.dialogue-log`, `.dialogue-turn`, `.dialogue-action`, `.dialogue-emotion`, `.dialogue-empty`, `.dialogue-form`, and `.dialogue-status`.

Use a fixed composer grid `minmax(0, 1fr) 38px`, textarea `min-height: 64px`, `resize: vertical`, `overflow-wrap: anywhere`, 5-pixel radii, and existing CSS variables only. Add a `max-width: 440px` rule that retains the two-column composer while keeping both tracks inside the viewport.

- [ ] **Step 5: Run focused frontend verification**

Run:

```bash
pnpm exec prettier --check src/components/explorer/npc-dialogue.tsx src/components/explorer/use-npc-dialogue.ts src/components/explorer/explorer-shell.tsx src/app/globals.css
pnpm exec eslint src/components/explorer/npc-dialogue.tsx src/components/explorer/use-npc-dialogue.ts src/components/explorer/explorer-shell.tsx
pnpm exec vitest run src/components/explorer/npc-dialogue.test.tsx src/components/explorer/use-npc-dialogue.test.tsx src/components/explorer/explorer-shell.test.tsx
pnpm typecheck
```

Expected: formatting, lint, focused tests, and TypeScript all PASS.

- [ ] **Step 6: Commit explorer integration**

```bash
git add src/components/explorer/explorer-shell.tsx src/components/explorer/explorer-shell.test.tsx src/app/globals.css
git commit -m "feat: connect explorer dialogue UI"
```

### Task 4: Full Verification and Live Smoke Test

**Files:**

- Modify only if verification finds an in-scope defect in files from Tasks 1-3.

**Interfaces:**

- Verifies the complete browser-to-route contract; produces no new public API.

- [ ] **Step 1: Run the complete automated suite**

Run sequentially to avoid the repository's prior filesystem timeout:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm secrets:check
git diff --check
```

Expected: all tests, type checking, production build, secret scan, and diff check PASS.

- [ ] **Step 2: Start a mock visual-QA server**

Start Next.js with Clerk disabled and provider mock mode on a free port. Use injected fake API responses in browser QA so no OpenRouter credits are spent merely checking layout.

Verify at desktop and `390x844`:

- the dialogue follows the NPC profile;
- message text and action text wrap;
- the composer does not overflow;
- pending and error text do not overlap controls;
- `document.documentElement.scrollWidth === window.innerWidth` on mobile.

- [ ] **Step 3: Run one authenticated live smoke request**

Using the local server-side `OPENROUTER_API_KEY`, authenticate with the existing Clerk development user, open one owned saved NPC, and send one short message. Confirm a structured NPC reply appears and the server emits no secret value or raw upstream body.

If Clerk local proxying remains unavailable, record the exact proxy error and verify the same route handler with its authenticated fake-provider tests; do not weaken authentication or expose a development bypass.

- [ ] **Step 4: Final commit and push**

If QA required code changes, commit them with:

```bash
git add src/components/explorer src/app/globals.css
git commit -m "fix: polish NPC dialogue states"
```

Then push the clean `main` branch:

```bash
git push origin main
git status --short --branch
```

Expected: `main...origin/main` with no modified or untracked files.
