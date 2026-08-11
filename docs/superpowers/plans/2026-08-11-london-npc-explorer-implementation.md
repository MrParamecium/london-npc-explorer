# London NPC Explorer V1 Implementation Plan

Date: 2026-08-11
Source design: `docs/superpowers/specs/2026-08-11-london-npc-explorer-design.md`
Status: Ready for execution after user review

## 1. Execution Method

Implementation uses short vertical loops. Every loop must:

1. Start with a failing automated test or an explicit verification script.
2. Build the smallest complete behaviour for that loop.
3. Run focused tests and the relevant end-to-end smoke path.
4. Produce a visible or inspectable checkpoint.
5. Commit only after the checkpoint passes.

Provider adapters must support mock mode from the beginning. No secret is requested in chat or committed to the repository.

Estimated engineering time for V1 is 14 to 20 focused hours, excluding Google Cloud billing setup, Google OAuth production verification, Clerk configuration, and API account approvals.

## 2. Planned Stack

- Next.js App Router with TypeScript.
- pnpm for dependency and lockfile management.
- Tailwind CSS plus CSS custom properties for the restrained Night Glass system.
- Vercel deployment and Functions.
- Clerk for Google OAuth and email verification codes.
- Neon PostgreSQL with PostGIS.
- Drizzle ORM and migrations.
- Vercel Blob for NPC portraits.
- Google Maps JavaScript, Geocoding, Places, and Street View.
- `@googlemaps/js-api-loader` for controlled browser SDK loading.
- Official DeepSeek API with `deepseek-v4-flash`.
- OpenRouter with GPT Image 2.
- Zod for request and provider-response validation.
- Vitest and React Testing Library for unit and component tests.
- Playwright for browser workflows and visual checks.
- Local provider adapter fakes and Playwright request interception for deterministic tests.

## 3. Repository Shape

```text
src/
  app/
    api/
      locations/resolve/route.ts
      npc-generations/route.ts
      npc-generations/[jobId]/route.ts
      npcs/[npcId]/messages/route.ts
      npcs/[npcId]/route.ts
      npcs/route.ts
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    layout.tsx
    page.tsx
  components/
    auth/
    explorer/
    generation/
    npc/
    chat/
  lib/
    auth/
    db/
    location/
    statistics/
    npc/
    generation/
    agent/
    providers/
    observability/
  styles/
scripts/
  data/
  verification/
data/
  manifests/
drizzle/
tests/
  fixtures/
  integration/
  e2e/
```

Implementation must retain these ownership boundaries. Framework-generated configuration files may be added without moving domain logic into route or page components.

## 4. Milestones

### Milestone A: Interactive Mock Product

Loops 0 through 3 produce a deployable app with authentication, London map selection, Street View, and deterministic mock NPC reveal.

### Milestone B: Data-Grounded NPC Generation

Loops 4 through 7 add official London data, conditional sampling, real DeepSeek generation, real portrait generation, and persistent history.

### Milestone C: Persistent Agent

Loops 8 and 9 add conversation, structured behaviour, long-term memory, and robust saved encounter navigation.

### Milestone D: Production Hardening

Loops 10 and 11 complete failure states, budget protection, observability, full testing, and Vercel deployment.

## 5. Loop 0: Project Foundation and Mock Mode

Estimate: 30 to 45 minutes.

### Objective

Create a healthy Next.js project that can run and test without external accounts.

### Files

- `package.json`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/lib/config/env.ts`
- `src/lib/providers/provider-mode.ts`
- `tests/setup.ts`
- `.env.example`
- `playwright.config.ts`
- `vitest.config.ts`

### Steps

1. Scaffold the current stable Next.js App Router with TypeScript and package-manager lockfile.
2. Add linting, formatting, Vitest, Testing Library, and Playwright.
3. Add Zod-based environment validation with `mock` and `live` provider modes.
4. Create the Night Glass design tokens without building the full page.
5. Add a health page and a test proving the app renders in mock mode with no secrets.

### Verification

- Typecheck, lint, and unit tests pass.
- Playwright opens the home page at desktop and mobile sizes.
- No secret-like values appear in the client bundle or repository.

### Checkpoint

The app boots locally and shows a minimal London Explorer shell.

## 6. Loop 1: Database and Domain Contracts

Estimate: 60 to 90 minutes.

### Objective

Define persistence and provider-neutral domain schemas before UI or AI logic depends on them.

### Files

- `src/lib/db/client.ts`
- `src/lib/db/schema.ts`
- `src/lib/db/queries/*.ts`
- `src/lib/location/contracts.ts`
- `src/lib/npc/contracts.ts`
- `src/lib/agent/contracts.ts`
- `src/lib/generation/contracts.ts`
- `drizzle.config.ts`
- `drizzle/*`
- `tests/fixtures/*.ts`

### Steps

1. Write failing schema-validation tests for locations, canonical profiles, generation jobs, agent replies, and memory updates.
2. Implement Zod contracts and inferred TypeScript types.
3. Define Drizzle tables for users, dataset versions, area statistics, locations, generation jobs, NPCs, conversations, messages, and memories.
4. Enable required PostGIS extensions through a migration.
5. Add repository methods with ownership checks and transaction boundaries.

### Verification

- Contract fixtures pass and invalid fixtures fail for the expected field.
- Migrations apply to a temporary or development Neon database.
- A generation transaction cannot create a visible NPC without its completed job and portrait URL.

### Checkpoint

A script creates and reads a fully linked mock NPC encounter from PostgreSQL.

## 7. Loop 2: Clerk Authentication and Resume Flow

Estimate: 45 to 60 minutes, excluding Clerk dashboard setup.

### Objective

Allow public exploration while protecting generation, chat, and history.

### Files

- `src/proxy.ts`
- `src/app/layout.tsx`
- `src/app/sign-in/[[...sign-in]]/page.tsx`
- `src/app/sign-up/[[...sign-up]]/page.tsx`
- `src/components/auth/account-control.tsx`
- `src/lib/auth/current-app-user.ts`
- `tests/e2e/auth.spec.ts`

### Steps

1. Write an end-to-end test showing public map access and protected generation.
2. Install Clerk using its current Next.js 16 `proxy.ts` integration pattern while keeping authorization checks at each protected Route Handler and data resource.
3. Configure Google OAuth and email-code flows through Clerk settings.
4. Create or retrieve the local `app_users` record after sign-in.
5. Preserve selected coordinates through the sign-in redirect and resume generation intent.

### Verification

- Signed-out users can open the workbench and select a location.
- Generate opens authentication.
- Successful test authentication returns to the exact selected coordinates.
- Protected API routes reject missing or invalid sessions.

### Checkpoint

Authentication is complete without blocking map exploration.

## 8. Loop 3: London Explorer and Street View

Estimate: 90 to 120 minutes.

### Objective

Deliver the real map-first experience before adding paid AI operations.

### Files

- `src/components/explorer/explorer-workbench.tsx`
- `src/components/explorer/coordinate-input.tsx`
- `src/components/explorer/map-panel.tsx`
- `src/components/explorer/street-view-panel.tsx`
- `src/components/explorer/location-sidebar.tsx`
- `src/app/api/locations/resolve/route.ts`
- `src/lib/location/google-maps-adapter.ts`
- `src/lib/location/london-boundary.ts`
- `tests/e2e/location-selection.spec.ts`

### Steps

1. Write tests for coordinate parsing, valid London points, outside-London points, and unavailable Street View.
2. Add the Greater London boundary as a versioned GeoJSON project asset for fast V1 validation; the data-import loop also loads statistical boundaries into PostGIS.
3. Build map click and coordinate entry as two controls over one selected-location state.
4. Implement server-side Geocoding and Places resolution with policy-compliant caching.
5. Load Maps JavaScript and Street View in the browser with restricted keys and required attribution.
6. Search for a nearest outdoor panorama within 100 metres and show the designed fallback when absent.

### Verification

- Known points in Westminster, Camden, Croydon, and City of London resolve correctly.
- Points outside Greater London never call paid AI providers.
- Map controls, labels, and Street View do not overlap at desktop or mobile widths.
- Google-sourced content and ONS/GLA fields remain distinguishable in persistence.

### Checkpoint

The user can explore a real London coordinate and see its local context without generating an NPC.

## 9. Loop 4: Official London Data Import

Estimate: 2 to 3 hours for the first repeatable import.

### Objective

Create a reproducible, versioned statistical foundation instead of embedding hand-written probabilities.

### Files

- `data/manifests/london-v1.json`
- `scripts/data/download-sources.ts`
- `scripts/data/normalize-geographies.ts`
- `scripts/data/import-statistics.ts`
- `src/lib/statistics/source-manifest.ts`
- `src/lib/statistics/geography-fallback.ts`
- `tests/integration/data-import.test.ts`

### Steps

1. Write tests against small licensed fixtures for source versioning, geography joins, probability normalization, and fallback levels.
2. Create a manifest for Census 2021 cross-tabs, mid-2024 SAPE, ASHE 2025, IMD 2025, and selected GLA datasets.
3. Download or document manual download inputs without committing large raw files.
4. Normalize geography identifiers and map each statistic to its valid spatial resolution.
5. Convert counts and estimates into versioned distributions with sample-size and confidence metadata.
6. Import boundaries and statistics into Neon.
7. Produce a coverage report for every Greater London LSOA, ward, and borough.

### Verification

- Imported distribution rows identify source, release, geography, and transform version.
- Probabilities sum within tolerance.
- Missing LSOA variables fall back to ward, borough, then Greater London.
- The coverage report contains no unexplained missing Greater London geography.

### Checkpoint

A coordinate can retrieve a complete, source-labelled statistical context without an LLM.

## 10. Loop 5: Conditional Profile Sampler

Estimate: 90 to 120 minutes.

### Objective

Generate coherent canonical profiles from statistics and a reproducible seed.

### Files

- `src/lib/npc/random.ts`
- `src/lib/npc/dependency-graph.ts`
- `src/lib/npc/profile-sampler.ts`
- `src/lib/npc/compatibility-rules.ts`
- `src/lib/npc/profile-provenance.ts`
- `tests/npc/profile-sampler.test.ts`
- `tests/npc/statistical-sanity.test.ts`

### Steps

1. Write deterministic-seed, impossible-combination, and statistical-sanity tests.
2. Implement a seeded random source independent of provider SDKs.
3. Sample the approved dependency graph in order.
4. Attach source provenance and fallback precision to every sampled group.
5. Sample appearance separately from personality and socioeconomic values.
6. Add anti-stereotype invariants and tests showing that protected attributes do not deterministically fix income, personality, or appearance.
7. Generate a compact portrait-facts object and immutable agent-facts object from the same profile.

### Verification

- The same coordinate, seed, and dataset version reproduce the same canonical profile.
- Large sample runs stay within expected distribution tolerances.
- Constraint tests prevent invalid ages, jobs, household states, and income relationships.
- DeepSeek is not imported by the sampler module.

### Checkpoint

The app can generate and display a complete mock NPC backed by official data and provenance.

## 11. Loop 6: Generation Job and DeepSeek Narrative

Estimate: 75 to 105 minutes.

### Objective

Turn the locked canonical profile into validated narrative and agent configuration without letting the model change facts.

### Files

- `src/lib/providers/deepseek.ts`
- `src/lib/providers/mock-deepseek.ts`
- `src/lib/generation/narrative-prompt.ts`
- `src/lib/generation/generate-narrative.ts`
- `src/lib/generation/job-service.ts`
- `src/app/api/npc-generations/route.ts`
- `src/app/api/npc-generations/[jobId]/route.ts`
- `tests/integration/deepseek-generation.test.ts`

### Steps

1. Write adapter tests for success, invalid JSON, timeout, 402, 429, and 5xx responses.
2. Implement the official DeepSeek adapter with server-only configuration and opaque Clerk-derived `user_id`.
3. Build a versioned prompt that distinguishes immutable facts, permitted creative details, and prohibited contradictions.
4. Validate structured output and retry repair once when appropriate.
5. Create generation jobs with idempotency keys and named progress stages.
6. Stream stage-only server-sent events from the generation request without exposing partial profile fields; persist every stage so the client can recover job status after a disconnect.

### Verification

- Provider errors normalize to stable internal error types.
- Narrative output cannot overwrite immutable profile fields.
- Duplicate requests with one idempotency key create one job and one provider call.
- The mock adapter supports the complete flow without external spend.

### Checkpoint

A real or mock DeepSeek response creates a validated narrative and agent configuration for the locked NPC.

## 12. Loop 7: Portrait Generation, Blob Storage, and Atomic Reveal

Estimate: 75 to 105 minutes.

### Objective

Generate the portrait from locked visual facts and make the NPC visible only after durable storage succeeds.

### Files

- `src/lib/providers/openrouter-image.ts`
- `src/lib/providers/mock-image.ts`
- `src/lib/generation/portrait-prompt.ts`
- `src/lib/generation/generate-portrait.ts`
- `src/lib/storage/portrait-store.ts`
- `src/lib/generation/complete-generation.ts`
- `src/components/generation/location-first-progress.tsx`
- `tests/integration/atomic-generation.test.ts`

### Steps

1. Write tests for valid images, invalid MIME type, temporary URLs, provider failure, Blob failure, and transaction failure.
2. Implement the OpenRouter image adapter and hard API-key budget handling.
3. Build a documentary-realism prompt from canonical visual facts only.
4. Download the provider image server-side, validate its type and size, and upload it to Vercel Blob.
5. Run narrative and portrait work concurrently after profile locking.
6. Complete the database transaction only when narrative, agent configuration, and Blob URL all exist.
7. Implement the approved location-first progress UI and atomic reveal.

### Verification

- The UI never renders a portrait-only or profile-only NPC.
- A failed retry keeps the same seed and profile.
- A completed record never points at an expired provider URL.
- Desktop and mobile screenshots show stable panel dimensions throughout progress and reveal.

### Checkpoint

The full real generation flow works from coordinate to saved, photo-complete NPC.

## 13. Loop 8: Encounter History and NPC Detail

Estimate: 45 to 60 minutes.

### Objective

Make every successful encounter recoverable without cluttering the main workbench.

### Files

- `src/app/api/npcs/route.ts`
- `src/app/api/npcs/[npcId]/route.ts`
- `src/components/npc/npc-profile.tsx`
- `src/components/npc/encounter-history.tsx`
- `src/lib/db/queries/npcs.ts`
- `tests/e2e/history.spec.ts`

### Steps

1. Write ownership and ordering tests.
2. Implement paginated encounter history by authenticated user.
3. Restore location, portrait, profile, and conversation when an encounter is selected.
4. Implement Generate Another with a new seed and no mutation of the previous NPC.
5. Add empty, loading, deleted, and failed-job states.

### Verification

- A user cannot request another user's NPC.
- Reloading preserves all completed encounters.
- Generate Another adds a record rather than overwriting one.

### Checkpoint

Users can leave, return, and reopen any prior NPC.

## 14. Loop 9: Persistent Conversation and Behaviour

Estimate: 90 to 120 minutes.

### Objective

Deliver consistent speech, observable behaviour, emotion, and durable memory.

### Files

- `src/app/api/npcs/[npcId]/messages/route.ts`
- `src/lib/agent/context-builder.ts`
- `src/lib/agent/response-validator.ts`
- `src/lib/agent/memory-selector.ts`
- `src/lib/agent/memory-summary.ts`
- `src/components/chat/chat-panel.tsx`
- `src/components/chat/action-line.tsx`
- `tests/agent/continuity.test.ts`
- `tests/e2e/chat.spec.ts`

### Steps

1. Write continuity tests showing immutable facts cannot drift across turns.
2. Build context from canonical profile, current state, recent messages, and long-term memory.
3. Require the approved `speech`, `action`, `emotion`, and `memory_update` contract.
4. Save the message pair transactionally, then update mutable state and memory.
5. Summarize memory only after configured thresholds and retain source message references.
6. Build the chat UI with retry, preserved drafts, long-text handling, and clear action presentation.

### Verification

- The NPC retains fixed facts after long conversations.
- Important user facts survive reload and memory compaction.
- Failed calls do not write assistant messages or memory updates.
- Normal conversation is not subject to a visible daily quota.

### Checkpoint

A saved NPC behaves as a persistent agent across sessions.

## 15. Loop 10: Failure States, Budgets, and Observability

Estimate: 60 to 90 minutes.

### Objective

Make external failures understandable, recoverable, and financially bounded.

### Files

- `src/lib/observability/logger.ts`
- `src/lib/observability/usage.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/security/circuit-breaker.ts`
- `src/components/explorer/error-state.tsx`
- `src/components/generation/generation-error.tsx`
- `tests/integration/provider-errors.test.ts`

### Steps

1. Define normalized error types and user-facing messages.
2. Add Neon-backed one-in-flight generation enforcement, per-user burst counters, maximum input sizes, and output token bounds. Do not rely on function-process memory for limits.
3. Add provider-usage accounting and a global paid-operation circuit breaker.
4. Configure OpenRouter hard budget guidance and DeepSeek prepaid-balance monitoring.
5. Add correlation IDs and structured logs without secrets or unnecessary personal data.
6. Build all approved error, retry, no-Street-View, outside-London, and budget-exhausted states.

### Verification

- Failure-injection tests cover every provider and persistence boundary.
- Saved content stays readable while paid operations are paused.
- A duplicate click cannot create duplicate spend.
- Log snapshots contain no API keys, auth tokens, or verification codes.

### Checkpoint

The app degrades predictably under missing data, provider failures, abuse, and exhausted budgets.

## 16. Loop 11: Full QA and Vercel Deployment

Estimate: 90 to 120 minutes, excluding external account setup.

### Objective

Verify the complete product and publish a production-shaped V1.

### Files

- `tests/e2e/full-encounter.spec.ts`
- `tests/e2e/mobile.spec.ts`
- `scripts/verification/check-client-secrets.ts`
- `README.md`
- `vercel.json` only if runtime configuration requires it

### Steps

1. Run all unit, integration, and end-to-end suites.
2. Exercise the complete live-provider path with controlled test budgets.
3. Capture desktop and mobile screenshots for every primary and failure state.
4. Check canvas and Street View render pixels to detect blank map content.
5. Run accessibility checks for keyboard navigation, labels, contrast, focus, and reduced motion.
6. Scan client output and Git history for secrets.
7. Document local setup, data import, provider configuration, budget controls, and deployment.
8. Deploy to Vercel and repeat smoke tests against the deployment URL.

### Verification

- All V1 acceptance criteria from the design spec pass.
- No layout overlap or clipped text appears at supported viewports.
- Live-provider costs remain inside the configured test budget.
- Production environment variables are server-only and restricted at each provider.

### Checkpoint

The deployed V1 supports the full flow: explore London, authenticate, generate and reveal a grounded NPC, converse, reload, and resume.

## 17. External Setup Checkpoints

The following are deferred until the relevant loop and must never be pasted into chat:

- Clerk publishable and secret keys.
- Google OAuth client credentials configured inside Clerk.
- Google Maps browser key restricted by HTTP referrer.
- Google Maps server key restricted by API and server environment where supported.
- Neon pooled and migration database URLs.
- Vercel Blob token.
- DeepSeek API key and prepaid budget.
- OpenRouter API key with a hard spending limit.

Keys belong in local `.env.local` during development and Vercel encrypted environment variables in deployment.

## 18. Go/No-Go Gates

- Do not enable live AI providers until mock-mode generation, persistence, and retries pass.
- Do not import full London data until fixture-based transformations pass.
- Do not expose generation publicly until idempotency, ownership, and circuit-breaker tests pass.
- Do not enable production Google OAuth until the redirect domains are final.
- Do not call V1 complete until the full encounter workflow passes on desktop and mobile against the deployed URL.
