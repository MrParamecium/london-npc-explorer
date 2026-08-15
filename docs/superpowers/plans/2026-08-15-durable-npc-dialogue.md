# Durable NPC Dialogue Implementation Plan

**Goal:** Persist authenticated NPC conversations, restore them after refresh,
use server-owned history for future replies, and retain provider usage metadata.

**Architecture:** Reuse the existing `conversations`, `messages`, and
`npc_memories` tables. The chat route lazily creates a conversation for old and
new NPCs, loads a bounded canonical transcript, calls the provider, then stores
the user/NPC exchange and optional memory update in one SQL statement. The
client hydrates from `GET /api/chat/{npcId}` and continues to use the existing
POST composer.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod, Drizzle ORM,
Neon PostgreSQL, Vitest, React Testing Library.

## Constraints

- No database migration: the required V1 tables and columns already exist.
- Only completed, portrait-backed NPCs owned by the authenticated user can be
  read or changed.
- Provider prompts use database-owned history, not assistant messages supplied
  by the browser.
- Prompt context is bounded to the most recent 39 saved messages plus the new
  user turn.
- Transcript history returned to the browser is bounded to 40 messages.
- Provider metadata stores only validated provider, model, token usage, and
  cost fields. It never stores keys or raw upstream bodies.
- A failed provider call writes no user or NPC message.
- An exchange is visible only after both messages are saved.

## Tasks

1. Add dialogue history response contracts and tests.
2. Add owner-scoped conversation creation, bounded history loading, and atomic
   exchange/memory persistence queries with SQL-shape tests.
3. Extend the chat handler with a safe GET history handler and POST persistence.
4. Wire the route to the new queries and use canonical server-side history.
5. Hydrate the React dialogue state from saved history and replace the
   `Page only` label with a saved-state indicator.
6. Run focused and full verification, update `docs/HANDOFF.md`, commit, push,
   and smoke-test the deployed history endpoint without sending a paid message.

## Verification

```bash
pnpm exec vitest run src/lib/db/queries/dialogues.test.ts
pnpm exec vitest run src/lib/ai/chat-handler.test.ts
pnpm exec vitest run src/components/explorer/use-npc-dialogue.test.tsx
pnpm exec vitest run src/components/explorer/npc-dialogue.test.tsx
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm secrets:check
```
