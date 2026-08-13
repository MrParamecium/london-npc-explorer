# London Statistical NPC Generation Implementation Plan

Date: 2026-08-13  
Source design: `docs/superpowers/specs/2026-08-13-london-statistical-npc-generation-design.md`  
Status: Ready for execution after user approval

## 1. Goal and Checkpoint

Deliver Loop 4 as one complete, non-AI workflow:

1. A signed-in user selects a supported Greater London coordinate.
2. The server locks a versioned set of official statistics and creates a random
   seed.
3. A deterministic conditional sampler produces one adult fictional NPC aged 18
   to 90.
4. The NPC, current state, narrative, seed, versions, and field provenance are
   committed atomically without a portrait, conversation, or memory.
5. The explorer reveals the complete profile, supports generation history, and
   explains the source and fallback level of every displayed field.

This plan removes the current hard-coded NPC and chat simulation from the real
workflow. DeepSeek, OpenRouter, image generation, conversation, Street View, and
the public game API remain outside Loop 4.

Estimated implementation time is **14 to 20 focused hours**, normally 2 to 3
working days. The largest uncertainty is auditing and transforming official
source files, not the sampler or interface code.

## 2. Execution Rules

Each task starts with a failing test or data validation, implements one bounded
behavior, runs its focused verification, and ends with a commit only when that
checkpoint passes.

Before changing a Next.js route, page, or client boundary, re-read the relevant
guide under `node_modules/next/dist/docs/` as required by `AGENTS.md`. In
particular:

- Generation and history Route Handlers remain server owned and uncached.
- Clerk identity is resolved on the server; the browser never supplies an owner
  ID.
- Database, source-import, and sampling modules import `server-only` where
  appropriate.
- No official source download or transformation runs inside an end-user request.

Additional invariants:

- No model API and no Google API is called by Loop 4 generation.
- No suppressed source cell is converted into zero.
- Ethnic group has no outgoing sampling dependency.
- A public request cannot choose a seed or dataset version.
- No incomplete job exposes an NPC ID.
- Existing user changes are preserved; migrations are additive and reviewed
  before applying to Neon.

## 3. Fixed V1 Metric Registry

The implementation begins with this closed registry. An imported release cannot
activate unless all required metrics are available at least at Greater London
level.

| Metric ID                | Population/denominator               | Preferred source                    | Required | Used for                                         |
| ------------------------ | ------------------------------------ | ----------------------------------- | -------- | ------------------------------------------------ |
| `adult_age_sex`          | Adults 18 to 90                      | ONS mid-2024 small-area estimates   | Yes      | Age band, exact age, statistical sex category    |
| `ethnic_group`           | Usual residents                      | Census 2021                         | Yes      | Independent ethnic-group marginal                |
| `household_context`      | Person-weighted adults in households | Audited Census 2021 table           | Yes      | Household structure                              |
| `housing_tenure`         | Households                           | Census 2021                         | Yes      | Housing tenure                                   |
| `highest_qualification`  | Adults in scope                      | Census 2021                         | Yes      | Highest qualification                            |
| `economic_activity`      | Adults in scope                      | Census 2021                         | Yes      | Economic activity branch                         |
| `occupation_major_group` | Workers in scope                     | Census 2021, SOC 2020               | Yes      | Occupation major group                           |
| `work_pattern`           | Employed adults                      | Audited Census 2021 table           | Yes      | Employee/self-employed and full/part-time branch |
| `travel_to_work`         | Workers with a workplace             | Census 2021                         | Yes      | Main commute mode                                |
| `employee_earnings`      | Published employee population        | ASHE 2025 provisional               | Yes      | Employee income band only                        |
| `imd_decile`             | LSOA area                            | English Indices of Deprivation 2025 | Yes      | Neighbourhood context only                       |

Current ward data is imported only when its code system matches the ward codes
stored by the location resolver. A source that cannot support current wards does
not get force-mapped; that metric proceeds from LSOA to borough and London.

The registry requires these population concepts, not invented cross-tables. A
metric may include age, household, work-pattern, or occupation condition
dimensions only when the audited official table publishes them at that geography
and denominator. Otherwise the sampler uses the approved hierarchical marginal
rule and labels that derivation in provenance.

Source lock is a hard gate. A household-count table cannot stand in for a
person-weighted adult household distribution, and separately published London
and occupation earnings tables cannot be multiplied into a fictional
London-by-occupation table. If a required concept has no auditable public source
even at London level, Task 3 stops for a design revision instead of fabricating
it.

Non-statistical fields use the versioned template library. Names are drawn from
one London V1 fictional-name pool independently of ethnic group, following the
approved no-outgoing-edge rule.

## 4. Task 1: Schema V2 and Statistical Contracts

Estimate: 60 to 90 minutes.

### Files

- Modify `src/lib/npc/contracts.ts`
- Modify `src/lib/npc/contracts.test.ts`
- Modify `src/lib/generation/contracts.ts`
- Modify `src/lib/generation/contracts.test.ts`
- Add `src/lib/statistics/contracts.ts`
- Add `src/lib/statistics/contracts.test.ts`
- Add `src/lib/statistics/metric-registry.ts`
- Add `src/lib/statistics/metric-registry.test.ts`
- Modify `tests/fixtures/domain.ts`

### Steps

1. Add failing tests for canonical profile schema version 2, including employee,
   self-employed, unemployed, student, retired, carer, and other inactive
   branches; nullable occupation/income; adult age consistency; and rejection of
   unknown fields. Preserve a read-only schema for any stored V1 profile; only
   new generation may emit V2.
2. Replace the ambiguous V2 `culturalBackground` field with explicit statistical
   identity fields. Keep pronouns as a separate rule-derived presentation field.
3. Add strict contracts for weighted categories, conditional bundles, source
   quality, suppression, active version sets, and a field-provenance map keyed by
   canonical JSON pointer paths.
4. Add `profile_only` and `full` generation modes. Require an NPC for both
   completed modes, but require a portrait only for `full`.
5. Replace prompt-only provenance with required `probabilityEngineVersion` and
   `templateVersion`; make text and image provider IDs nullable.
6. Add structured failure codes for missing statistics, invalid distributions,
   exhausted compatibility retries, authentication, and persistence.
7. Define the fixed metric registry with denominator type, condition dimensions,
   permitted fallback levels, and required/optional status.
8. Add a dependency-policy assertion that fails when `ethnic_group` appears in
   the condition dimensions for any downstream metric.

### Verification

```bash
pnpm test -- src/lib/npc src/lib/generation src/lib/statistics
pnpm typecheck
```

### Checkpoint

The TypeScript domain can represent the full approved profile honestly without
fake jobs, fake incomes, fake portraits, or model identifiers.

## 5. Task 2: Persistence for Profile-Only NPCs and Reproducibility

Estimate: 75 to 105 minutes.

### Files

- Modify `src/lib/db/schema.ts`
- Modify `src/lib/db/schema.test.ts`
- Add the next generated Drizzle migration under `drizzle/`
- Modify `src/lib/db/queries/generation-jobs.ts`
- Add `src/lib/db/queries/generation-jobs.test.ts`
- Add `src/lib/db/queries/profile-npcs.ts`
- Add `src/lib/db/queries/profile-npcs.test.ts`
- Modify `scripts/verify-database.ts`

### Steps

1. Add failing schema tests for generation mode, a locked job version set,
   nullable NPC portrait, field provenance, and mode-aware completion checks.
2. Add `mode` and an immutable `version_set` JSON value to generation jobs so an
   idempotent retry cannot switch datasets after activation changes. Backfill
   completed legacy jobs from their linked NPC version set; allow null only on a
   pre-migration incomplete job, which new code refuses to resume.
3. Add an optional compatibility-set key to dataset versions. Every statistical
   source in one manifest must share this key; boundary-only legacy versions may
   remain null.
4. Add `field_provenance` JSONB to NPCs, make `portrait_url` nullable, and replace
   the unconditional portrait check with a full-mode completion rule.
5. Extend job queries to create or reuse a job with server seed, mode, and locked
   versions; transition stages safely; and mark structured failures without
   exposing a result NPC.
6. Add `completeProfileNpcAtomically`, using one data-modifying SQL statement to
   insert the NPC and complete its profile-only job together.
7. Keep `completeEncounterAtomically` for future full generation, but do not
   create a conversation or initial memory from the profile-only path.
8. Add owner-scoped queries for one visible NPC and cursor-based history. Require
   the linked job to be completed before returning either.
9. Generate and inspect the SQL migration before running it. Verify existing rows
   remain valid and no user-owned record is deleted.

### Verification

```bash
pnpm db:generate
pnpm db:check
pnpm test -- src/lib/db
pnpm db:verify
```

### Checkpoint

Neon can store a reproducible profile-only NPC atomically, and current full-mode
constraints remain enforceable.

## 6. Task 3: Audited Official-Data Source Lock

Estimate: 90 to 150 minutes.

### Files

- Add `data/manifests/london-npc-statistics-v1.json`
- Add `docs/data/london-npc-statistics-v1.md`
- Add `scripts/data/source-registry.ts`
- Add `scripts/data/source-registry.test.ts`
- Add small, redistributable samples under `tests/fixtures/statistics/`
- Modify `.gitignore`

### Steps

1. Resolve the exact downloadable file or API endpoint for each approved source:
   ONS mid-2024 small-area population, Census 2021 topic tables, ASHE 2025
   provisional, and IMD 2025.
2. Record publisher, canonical URL, file URL, dataset ID, release label,
   observation date, retrieval timestamp, licence, raw classification, geography
   code system, transform version, byte size, and SHA-256 checksum.
3. Inspect the source workbook or CSV headers and write an explicit mapping from
   raw codes to every registry category. Do not infer meaning from display labels
   alone.
4. Document denominator and quality rules, especially household versus person
   populations, ASHE reliability flags, Census disclosure handling, and
   suppressed cells.
5. Check in only the manifest, mappings, and small licensed test extracts. Keep
   large raw downloads in an ignored cache directory and make every download
   checksum-verifiable.
6. Add a source audit test that rejects a missing checksum, moving “latest” URL,
   unsupported licence, unknown geography version, or undocumented category.

### Verification

```bash
pnpm test -- scripts/data/source-registry.test.ts
pnpm secrets:check
git status --short
```

### Checkpoint

Every number that can influence an NPC has a pinned, reviewable source and
meaning before transformation code is trusted.

## 7. Task 4: Repeatable Statistics Import and Atomic Activation

Estimate: 3 to 5 focused hours.

### Files

- Add `scripts/data/import-london-statistics.ts`
- Add `scripts/data/importers/download-source.ts`
- Add `scripts/data/importers/ons-population.ts`
- Add `scripts/data/importers/census-2021.ts`
- Add `scripts/data/importers/ashe-2025.ts`
- Add `scripts/data/importers/imd-2025.ts`
- Add `scripts/data/importers/reweight-census.ts`
- Add `scripts/data/importers/validate-release.ts`
- Add focused tests next to each importer
- Modify `package.json`

### Steps

1. Add failing fixture tests for raw-code mapping, 18-to-90 filtering,
   suppression preservation, denominator separation, unknown categories, and
   invalid weights.
2. Implement streaming or row-batched parsers so large source files are not held
   fully in memory. Use workbook/CSV parsers, never ad hoc line splitting.
3. Normalize each source into the strict statistical bundle contract. Retain raw
   counts and quality flags long enough to validate. For a reweighted metric,
   store both the original normalized weights and adjusted weights plus method
   audit metadata in `area_statistics`; do not copy entire raw workbooks into the
   database.
4. Build required LSOA, eligible ward, borough, and Greater London bundles using
   official code relationships. Do not spatially guess a ward mapping.
5. Reweight only the Census age structure against the newer mid-2024 age margin.
   Record the input versions, algorithm ID, convergence threshold, and iteration
   count. Do not alter ethnicity or unrelated margins.
6. Convert ASHE employee earnings into fixed GBP annual bands only for supported
   populations. Select only dimensions jointly published in one audited ASHE
   table; never synthesize a London-by-occupation-by-work-pattern cross-table from
   separate tables. Broaden detail or fall back to the supported London employee
   distribution when quality rules fail.
7. Validate non-negative finite weights, sum tolerance, expected category sets,
   required London coverage, geography existence, source completeness, and the
   anti-dependency policy.
8. Write every source version in the manifest compatibility set as `pending`,
   bulk insert its statistics, and validate all database counts. In one
   transaction, supersede the prior statistical set and activate the complete new
   set. A failed or partial import remains non-active and cannot affect
   generation.
9. Add `pnpm data:statistics -- --manifest ...` plus dry-run and validate-only
   modes. Print counts and safe identifiers, never connection details.

### Verification

```bash
pnpm test -- scripts/data/importers
pnpm data:statistics -- --manifest data/manifests/london-npc-statistics-v1.json --dry-run
pnpm data:statistics -- --manifest data/manifests/london-npc-statistics-v1.json
pnpm db:verify
```

### Checkpoint

Neon holds one complete, mutually compatible active real-data set, and a partial
or unreliable release cannot become visible to generation.

## 8. Task 5: Active Version Resolver and Spatial Fallback

Estimate: 60 to 90 minutes.

### Files

- Add `src/lib/statistics/active-version-set.ts`
- Add `src/lib/statistics/active-version-set.test.ts`
- Add `src/lib/statistics/spatial-statistics-repository.ts`
- Add `src/lib/statistics/spatial-statistics-repository.test.ts`
- Add `src/lib/statistics/build-probability-bundle.ts`
- Add `src/lib/statistics/build-probability-bundle.test.ts`

### Steps

1. Add failing tests for a complete active set, missing source, duplicate active
   source, activation race, suppressed small-area metric, missing ward metric,
   borough fallback, London fallback, and missing required London metric.
2. Resolve the required active dataset IDs once at job creation, require one
   shared compatibility-set key, sort the IDs by source key, and persist the
   complete version set on the job.
3. Load all candidate statistics for the location and locked versions in one
   bounded query, then resolve each metric independently through
   `LSOA -> ward -> borough -> London`.
4. Skip absent, suppressed, unreliable, empty, or non-normalizable candidates.
   Return a structured diagnostic if no valid London candidate exists.
5. Attach dataset ID, source release, transform version, actual geography code,
   and fallback level to every resolved distribution.
6. Return one immutable probability bundle to the sampler; sampling code cannot
   query the database or silently switch versions.

### Verification

```bash
pnpm test -- src/lib/statistics/active-version-set.test.ts src/lib/statistics/spatial-statistics-repository.test.ts src/lib/statistics/build-probability-bundle.test.ts
pnpm typecheck
```

### Checkpoint

One generation job sees one consistent version set and knows exactly which
geography supplied every metric.

## 9. Task 6: Deterministic Conditional Sampler and Templates

Estimate: 2.5 to 4 focused hours.

### Files

- Add `src/lib/sampling/deterministic-random.ts`
- Add `src/lib/sampling/deterministic-random.test.ts`
- Add `src/lib/sampling/weighted-draw.ts`
- Add `src/lib/sampling/weighted-draw.test.ts`
- Add `src/lib/sampling/compatibility.ts`
- Add `src/lib/sampling/compatibility.test.ts`
- Add `src/lib/sampling/london-npc-sampler.ts`
- Add `src/lib/sampling/london-npc-sampler.test.ts`
- Add `src/lib/sampling/london-npc-sampler.distribution.test.ts`
- Add `src/lib/npc/template-library.ts`
- Add `src/lib/npc/template-library.test.ts`

### Steps

1. Add fixed-vector tests for named randomness derived from HMAC-SHA-256 with the
   seed as key and a versioned, domain-separated path as message. Convert a stable
   53-bit value to `[0, 1)` so results do not depend on process state or draw
   order.
2. Implement weighted selection with strict finite/non-negative checks, stable
   category order, and no accidental last-category bias.
3. Sample in the approved order: age/sex, independent ethnic group, household,
   tenure, qualification, activity, worker branch, occupation, work pattern,
   employee income, commute, and current context. Use an audited official
   conditional only when its published dimensions match; otherwise use the named
   hierarchical marginal rule and record it as a rule-derived step.
4. Keep direct dependency edges in one declarative graph. Add a test that rejects
   any edge from ethnic group and deterministic occupation/family-role rules from
   gender.
5. Add named compatibility rules for retirement, student work, occupation,
   employee income, household denominators, and commute populations. Use at most
   three deterministic retry suffixes.
6. Build a versioned fictional template library for independent names, pronouns,
   employer type, routine, appearance text, clothing, possessions, neutral
   history, values, speech style, boundaries, mood, task, and short-term goal.
7. Produce canonical profile schema v2, current state, narrative, and complete
   field provenance. Mark every field as statistical, rule, or template.
8. Add byte-equivalence tests for the same seed/bundle/engine/template versions
   and change-isolation tests proving a new template path does not change prior
   statistical draws.
9. Run fixed-seed bulk samples per registry metric. Require each category's
   deviation to remain within `max(0.015, 4 * standard error)` and exclude
   categories whose expected count is too small for that assertion.

### Verification

```bash
pnpm test -- src/lib/sampling src/lib/npc/template-library.test.ts
pnpm typecheck
```

### Checkpoint

The same seed and versions produce byte-equivalent JSON, while large samples
track the imported distributions within documented tolerance.

## 10. Task 7: Authenticated Generation and History APIs

Estimate: 90 to 130 minutes.

### Files

- Add `src/lib/generation/profile-generation-service.ts`
- Add `src/lib/generation/profile-generation-service.test.ts`
- Add `src/lib/generation/profile-generation-handler.ts`
- Add `src/lib/generation/profile-generation-handler.test.ts`
- Add `src/app/api/npcs/generate/route.ts`
- Add `src/app/api/npcs/generate/route.test.ts`
- Add `src/app/api/npcs/route.ts`
- Add `src/app/api/npcs/route.test.ts`
- Add `src/app/api/npcs/[npcId]/route.ts`
- Add `src/app/api/npcs/[npcId]/route.test.ts`

### Steps

1. Re-read the installed Next.js Route Handler and authentication guidance before
   creating these files.
2. Add failing tests for signed-out requests, unsynchronized Clerk users, invalid
   coordinates, outside-London points, missing active statistics, successful
   profile generation, structured failure, and secret-safe responses.
3. Validate the public request as coordinates plus idempotency key only. Generate
   the opaque seed and lock active versions on the server.
4. Resolve or reuse the normalized stored location, then create or reuse one
   profile-only job owned by the current app user.
5. For a new job, load the probability bundle, sample and validate the profile,
   atomically persist it, and return only the complete response. Mark failures
   without creating an NPC.
6. For a repeated idempotency key, return the existing completed result, existing
   safe failure, or current in-progress status; never run the sampler twice.
7. Apply the existing replaceable request-throttle boundary to prevent concurrent
   duplicate user generations without treating it as the production distributed
   quota system.
8. Add owner-scoped cursor history and one-NPC detail routes. Return 404 rather
   than reveal whether another user's NPC exists.
9. Assert in tests that Google, text-model, image-model, conversation, and memory
   dependencies are never called.

### Verification

```bash
pnpm test -- src/lib/generation/profile-generation-service.test.ts src/lib/generation/profile-generation-handler.test.ts src/app/api/npcs
pnpm lint
pnpm typecheck
```

### Checkpoint

A synchronized Clerk user can generate, retry idempotently, list, and reopen only
their own completed statistical NPCs without spending provider credits.

## 11. Task 8: Explorer Generation State, Profile, Sources, and History

Estimate: 2.5 to 3.5 focused hours.

### Files

- Add `src/components/explorer/use-npc-generation.ts`
- Add `src/components/explorer/use-npc-generation.test.tsx`
- Add `src/components/explorer/npc-profile.tsx`
- Add `src/components/explorer/npc-profile.test.tsx`
- Add `src/components/explorer/data-source-inspector.tsx`
- Add `src/components/explorer/data-source-inspector.test.tsx`
- Add `src/components/explorer/npc-history.tsx`
- Add `src/components/explorer/npc-history.test.tsx`
- Modify `src/components/explorer/explorer-shell.tsx`
- Modify `src/components/explorer/explorer-shell.test.tsx`
- Modify `src/components/auth/auth-aware-explorer.tsx`
- Modify `src/app/globals.css`

### Steps

1. Add failing hook tests for authentication resume, idempotency-key reuse,
   one-request-at-a-time behavior, generation stages, stale-response suppression,
   failure preservation, generate-another, history loading, and reopening an NPC.
2. Replace `MOCK_NPCS`, timer completion, local-only history, and fake chat replies
   with the generation and history APIs. Do not show a chat composer in Loop 4.
3. Keep the existing map and layout. Enable generation only when location is
   resolved, supported, and authentication is ready.
4. Keep the prior visible NPC during a new request. Reveal a successful result in
   one update and append it to persistent history.
5. Render an initials avatar with a stable size, then show identity, household,
   employee/self-employed/non-working branch, income only when supported, daily
   life, appearance, character, and current-state sections without nested cards.
6. Add a **Data sources** action that opens an accessible drawer or dialog grouped
   by profile section. Show source release, metric, geography level/code, and
   statistical/rule/template kind.
7. Add persistent cursor history with loading, empty, error, and reopen states.
   Long names and occupation labels must wrap without changing control sizes.
8. Add accessible status announcements, dialog focus management, escape/close
   behavior, mobile scrolling, and fixed geometry for generation controls.
9. State near the generated profile that it is one fictional sample from local
   distributions, not a description of a real resident.

### Verification

```bash
pnpm test -- src/components/explorer
pnpm lint
pnpm typecheck
```

### Checkpoint

The current webpage presents real persistent NPC profiles and transparent source
provenance without fake AI dialogue or a fake portrait.

## 12. Task 9: End-to-End, Live-Data, and Visual Acceptance

Estimate: 90 to 150 minutes.

### Files

- Modify `tests/e2e/explorer.spec.ts`
- Add `tests/e2e/npc-generation.spec.ts`
- Add `scripts/verify-statistical-generation.ts`
- Modify `package.json`
- Update setup documentation only where commands or environment requirements
  changed

### Steps

1. Add deterministic browser fixtures for a supported coordinate, generated
   worker, generated non-worker, provenance fallback, new-generation failure, and
   history reopening.
2. Cover signed-out generation resume, one complete reveal, generate another,
   source inspection, history persistence, and previous-NPC preservation after a
   failed request.
3. Add a Neon smoke script that loads the active real-data version set and
   generates fixed internal seeds for at least Westminster, Camden, Croydon, and
   City of London. Validate age, profile schema, provenance coverage, fallback,
   and exact replay.
4. Run the distribution calibration suite against the normalized real-data
   bundle, not only tiny fixtures.
5. Start the local app and use Playwright at 1440x900, 1024x768, 390x844, and
   360x800. Capture screenshots for idle, generating, complete profile, data
   sources, history, non-worker, and error-preservation states.
6. Inspect screenshots for blank regions, overflow, text overlap, clipped
   controls, unstable panel dimensions, fake portrait remnants, and stale chat
   UI. Check browser console and failed network requests.
7. Run the complete project gate, inspect the final diff for secrets or raw source
   files, then commit and push the implementation.

### Verification

```bash
pnpm statistics:verify
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm secrets:check
git diff --check
git status --short
```

### Checkpoint

Loop 4 passes automated, live-data, desktop, and mobile acceptance with no model
or Google usage in the generation path.

## 13. Implementation Commit Sequence

Use small commits so a failing data source or UI regression can be isolated:

1. `feat: add statistical npc v2 contracts`
2. `feat: support profile-only npc persistence`
3. `data: lock london npc source registry`
4. `feat: import versioned london statistics`
5. `feat: resolve spatial probability bundles`
6. `feat: sample deterministic london npc profiles`
7. `feat: add authenticated npc generation api`
8. `feat: connect explorer to statistical npc generation`
9. `test: verify loop 4 statistical generation`

Do not combine the real-data import and interface replacement in one commit.

## 14. Completion Definition

Loop 4 is complete only when all of the following are true:

- A signed-in user can generate multiple adult NPCs from a supported London
  coordinate and reopen them from persistent history.
- Real imported source releases, not hard-coded demo distributions, supply every
  required statistical metric.
- The same saved seed, coordinate identity, dataset version set, engine version,
  and template version reproduce byte-equivalent canonical JSON.
- Every displayed leaf field is traceable as statistical, rule, or template, and
  statistical fields show their actual geography fallback.
- Worker and non-worker profiles are valid without placeholder occupations,
  incomes, portraits, conversations, or memories.
- Ethnic group does not condition any other generated attribute.
- Generation does not call DeepSeek, OpenRouter, an image model, or Google Maps.
- Unit, integration, calibration, end-to-end, build, secret, and visual checks all
  pass.

The next loop can then add one model-backed capability at a time: first dialogue,
then portrait generation, without changing the statistical identity already
stored for an NPC.
