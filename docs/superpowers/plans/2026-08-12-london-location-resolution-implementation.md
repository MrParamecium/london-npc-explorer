# London Location Resolution Implementation Plan

Date: 2026-08-12  
Source design: `docs/superpowers/specs/2026-08-12-london-location-resolution-design.md`  
Status: Ready for execution

## 1. Goal and Checkpoint

Deliver one complete public workflow:

1. Enter a London coordinate or click the 2D map.
2. Resolve it through one provider-neutral API.
3. Display its official LSOA, current ward, borough, Google address, and up to ten
   representative nearby places.
4. Reject unsupported points before paid Google place lookup.
5. Remain fully usable in deterministic mock mode without Google credentials.

Street View, demographic imports, NPC generation logic, and production deployment
remain outside this plan.

Estimated implementation time is 4 to 6 focused hours after Google Cloud and
boundary-source access are configured. Google Cloud setup takes approximately 15
to 25 minutes, excluding billing-account verification.

## 2. Execution Rules

Each task starts with a failing test or explicit data check, implements one
bounded behavior, runs focused verification, and ends with a commit only when the
checkpoint passes.

Implementation follows the installed Next.js 16 documentation:

- `POST` Route Handlers are uncached by default.
- The interactive Google map is isolated in a narrow Client Component.
- Server-only provider code owns the secret key.
- `NEXT_PUBLIC_` values are treated as browser-visible build-time values.

No key is pasted into chat, committed to Git, logged, included in test fixtures,
or returned by an API response.

## 3. Task 1: Provider-Neutral Location Contracts

Estimate: 30 to 45 minutes.

### Files

- Modify `src/lib/location/contracts.ts`
- Modify `src/lib/location/contracts.test.ts`
- Add `src/lib/location/coordinate-normalization.ts`
- Add `src/lib/location/coordinate-normalization.test.ts`
- Modify `tests/fixtures/domain.ts`

### Steps

1. Add failing tests for supported, unsupported, partial, and invalid resolved
   location responses.
2. Define strict Zod schemas for official geography labels, address display data,
   nearby places, provenance, and structured resolver failures.
3. Add six-decimal coordinate normalization and a stable cache-key helper.
4. Prove nearby results are capped at ten and unknown provider fields are
   rejected or explicitly stripped at the adapter boundary.

### Verification

```bash
pnpm test -- src/lib/location
pnpm typecheck
```

### Checkpoint

All following work shares one validated response schema and coordinate identity.

## 4. Task 2: Versioned Official Boundary Storage and Import

Estimate: 60 to 90 minutes.

### Files

- Modify `src/lib/db/schema.ts`
- Add `drizzle/0001_geography_boundaries.sql`
- Add `data/manifests/london-boundaries-v1.json`
- Add `scripts/data/import-london-boundaries.ts`
- Add `src/lib/location/london-geography-repository.ts`
- Add `src/lib/location/london-geography-repository.test.ts`
- Modify `package.json`

### Steps

1. Add failing schema and repository tests for point-in-polygon lookup and dataset
   provenance.
2. Add a geography-boundary table with level, official code, name, release label,
   source, and indexed multipolygon geometry in SRID 4326.
3. Add a manifest with exact official source URLs, release identifiers, licences,
   checksums, and transform version.
4. Build a repeatable importer that validates geometry, reprojects when required,
   and activates a complete version atomically.
5. Implement one PostGIS query that resolves Greater London inclusion, LSOA,
   ward, and borough for a normalized point without assuming ward-to-LSOA nesting.
6. Verify known fixtures in Westminster, Camden, Croydon, and City of London.

### Verification

```bash
pnpm db:generate
pnpm db:check
pnpm test -- src/lib/location/london-geography-repository.test.ts
pnpm db:verify
```

### Checkpoint

Neon can classify a coordinate using versioned official polygons without calling
Google.

## 5. Task 3: Google Geocoding and Places Adapter

Estimate: 45 to 60 minutes.

### Files

- Modify `.env.example`
- Modify `src/lib/config/env.ts`
- Add `src/lib/location/google-location-adapter.ts`
- Add `src/lib/location/google-location-adapter.test.ts`
- Add `src/lib/location/mock-location-adapter.ts`
- Add `src/lib/location/location-adapter.ts`

### Steps

1. Add failing tests for successful reverse geocoding, ten-place truncation,
   minimum field masks, timeout, malformed payload, zero results, and independent
   Geocoding or Places failure.
2. Add `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_SERVER_KEY`
   validation. Allow neither key in mock mode; require both in live mode; reject a
   partial pair.
3. Implement an injectable fetch-based server adapter with explicit timeout and
   no automatic provider-response logging.
4. Request only the approved Google display fields and normalize place types into
   the seven approved context categories.
5. Implement the deterministic mock adapter against the same interface.

### Verification

```bash
pnpm test -- src/lib/location/google-location-adapter.test.ts
pnpm typecheck
```

### Checkpoint

The live and mock providers return the same validated application contract.

## 6. Task 4: Public Location Resolution API

Estimate: 35 to 50 minutes.

### Files

- Add `src/lib/location/resolve-location.ts`
- Add `src/lib/location/resolve-location.test.ts`
- Add `src/app/api/locations/resolve/route.ts`
- Add `src/app/api/locations/resolve/route.test.ts`
- Add `src/lib/observability/request-throttle.ts`
- Add `src/lib/observability/request-throttle.test.ts`

### Steps

1. Add failing tests for invalid input, supported points, unsupported points,
   partial provider failure, timeout, throttling, and secret-safe errors.
2. Resolve official geography first and return immediately for an unsupported
   point, proving the Google adapter receives zero calls.
3. For supported points, start reverse geocoding and nearby search in parallel and
   merge independent partial results.
4. Add a conservative in-process development throttle behind a replaceable
   interface. Document that distributed production enforcement is a later
   hardening task.
5. Return structured JSON status codes without Clerk authentication because map
   exploration is public.

### Verification

```bash
pnpm test -- src/app/api/locations/resolve src/lib/location/resolve-location.test.ts
pnpm lint
pnpm typecheck
```

### Checkpoint

One public endpoint safely resolves location context and blocks paid work outside
London.

## 7. Task 5: Interactive Map and Shared Selection State

Estimate: 60 to 90 minutes.

### Files

- Add `src/components/explorer/google-map.tsx`
- Add `src/components/explorer/map-panel.tsx`
- Add `src/components/explorer/location-sidebar.tsx`
- Add `src/components/explorer/use-location-resolution.ts`
- Add `src/components/explorer/use-location-resolution.test.tsx`
- Modify `src/components/explorer/explorer-shell.tsx`
- Modify `src/components/explorer/explorer-shell.test.tsx`
- Modify `src/app/globals.css`

### Steps

1. Add failing component tests for coordinate submission, map selection callback,
   resolving and partial states, unsupported points, retry, stale-response
   suppression, and textual nearby-place access.
2. Extract location UI from the existing monolithic shell while preserving its
   authentication and mock NPC behavior.
3. Add one selection controller using `AbortController` and a monotonically
   increasing request ID. Cache repeated normalized coordinates for the browser
   session.
4. Load Google Maps only when the browser key exists and only inside the map
   component. Keep the existing deterministic mock map otherwise.
5. Render a distinct selected marker and category markers without allowing marker
   content to resize the map.
6. Add fixed resolving, ready, partial, unsupported, and error regions with
   accessible status semantics and stable desktop/mobile geometry.

### Verification

```bash
pnpm test -- src/components/explorer
pnpm typecheck
pnpm lint
```

### Checkpoint

Coordinate entry and map click visibly converge on one current resolved location.

## 8. Task 6: Cost Guards and Configuration Verification

Estimate: 25 to 40 minutes.

### Files

- Add `scripts/verify-google-maps-config.ts`
- Modify `package.json`
- Modify `.env.example`
- Add `docs/setup/google-maps.md`

### Steps

1. Add a verification script that checks key presence without printing values,
   confirms the three expected APIs respond, and refuses production credentials
   in test fixtures.
2. Document separate browser/server key restrictions, localhost and Vercel
   referrers, and recommended starting quotas.
3. Record the distinction between billing alerts and enforceable service quotas.
4. Add a live-mode smoke check that makes one known London request and reports
   only status, latency, count, and normalized geography.

### Verification

```bash
pnpm google:verify
git grep -nE 'AIza[0-9A-Za-z_-]{20,}' -- . ':!pnpm-lock.yaml'
```

### Checkpoint

Keys are restricted, hidden, and testable before live mode is enabled.

## 9. Task 7: End-to-End and Visual Acceptance

Estimate: 40 to 60 minutes.

### Files

- Add `tests/e2e/location-selection.spec.ts`
- Modify `tests/e2e/explorer.spec.ts`
- Modify `playwright.config.ts` only if auth-free map tests require an isolated
  mock environment

### Steps

1. Test equivalent results from coordinate entry and a mocked map-click event.
2. Test outside-London, empty nearby places, provider partial failure, rapid
   reselection, retry, and missing-key mock behavior.
3. Run desktop and mobile workflows with deterministic intercepted provider
   responses.
4. Start the application with real local credentials and perform one controlled
   live smoke request.
5. Inspect screenshots at desktop and mobile sizes for map, marker, control, text,
   and NPC-panel overlap.

### Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:e2e
```

### Checkpoint

A public user can resolve a real London point on a responsive 2D map, while mock
mode and all previous authentication and NPC-shell behavior remain healthy.

## 10. Commit Sequence

Use focused commits after each passing checkpoint:

1. `feat: define resolved location contracts`
2. `feat: import London geography boundaries`
3. `feat: add Google location provider`
4. `feat: expose public location resolver`
5. `feat: add interactive London map`
6. `docs: document Google Maps safeguards`
7. `test: verify London location workflow`

Do not combine Google Cloud credentials, downloaded transient source archives, or
test artifacts with any commit.

