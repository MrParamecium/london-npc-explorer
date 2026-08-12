# Clerk Authentication and Resume Flow Design

Date: 2026-08-12  
Status: Approved for specification review

## 1. Objective

Add authentication without blocking public exploration. A signed-out visitor can
open the London workbench, enter coordinates, and inspect public location UI.
Generating an NPC, chatting, and reading encounter history require a valid Clerk
session.

The first release supports:

- Google sign-in.
- Email verification-code sign-in for any deliverable email address.
- A Clerk-hosted sign-in experience displayed as a modal over the workbench.
- Automatic continuation of the pending NPC generation after sign-in.

Password authentication, phone authentication, WeChat, QQ, organizations, roles,
and anonymous generation are outside this loop.

## 2. Confirmed User Flow

1. The visitor selects or enters a London coordinate.
2. The visitor clicks **Generate NPC**.
3. If already signed in, generation starts immediately.
4. If signed out, the browser stores a minimal pending intent and opens Clerk's
   official sign-in modal without navigating away from the workbench.
5. The user completes Google sign-in or an email verification code.
6. The application creates or confirms the local `app_users` row using the stable
   Clerk user ID.
7. The modal closes, the exact coordinates are restored, and generation starts
   automatically once.
8. The pending intent is removed before or as the generation request starts so a
   refresh cannot trigger an unbounded retry loop.

Closing or cancelling the modal does not start generation. The selected location
remains available and the user can try again.

## 3. Architecture

### 3.1 Clerk Integration

The root layout uses `ClerkProvider`. Next.js `proxy.ts` runs
`clerkMiddleware()` for application and API routes but does not globally protect
the workbench. Authorization remains close to each protected server resource.

The account control uses Clerk's prebuilt components:

- Signed out: a sign-in control that opens the modal.
- Signed in: a compact user control with account and sign-out actions.
- Generate intent: the workbench opens the same modal programmatically or through
  Clerk's modal-capable control.

The application does not implement OAuth redirects, verification-code handling,
account linking, or session cookies itself.

### 3.2 Pending Generation Intent

The browser stores one versioned record in `sessionStorage`:

```json
{
  "version": 1,
  "action": "generate_npc",
  "latitude": 51.5202,
  "longitude": -0.0979,
  "createdAt": "2026-08-12T00:00:00.000Z"
}
```

The record contains no user ID, session token, API key, generated profile, or
provider data. It is validated before use and expires after 15 minutes. Invalid,
expired, or unsupported records are deleted.

After Clerk reports a signed-in session, a client-side coordinator consumes the
intent exactly once. It restores the coordinate state, removes the stored intent,
ensures the local user exists, and dispatches the normal generation command. The
generation endpoint's idempotency key remains the final protection against
duplicate paid work.

### 3.3 Local User Synchronization

`current-app-user.ts` reads `auth()` on the server and rejects missing sessions.
For authenticated users it calls the existing idempotent `ensureAppUser()` query
with Clerk's stable `userId`.

The local `app_users` table stores only that identifier and timestamps. Clerk
remains the identity source of truth; email addresses, OAuth profiles, passwords,
verification codes, and tokens are not copied into Neon.

### 3.4 Protected Resources

Map exploration and location selection remain public. Every Route Handler or
Server Action that generates an NPC, sends a chat message, reads history, or reads
private encounter data performs its own server-side `auth()` check.

Unauthenticated JSON requests return:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Sign in to continue."
  }
}
```

with HTTP status `401`. The browser interprets this response as a request to open
the sign-in modal. It never treats hidden UI as authorization.

All repository queries continue to require the Clerk-derived `ownerId`; request
body or query-string user IDs are ignored.

## 4. UI Behavior

The modal uses Clerk's maintained sign-in component with restrained appearance
variables matching the existing Transit Paper palette. It remains visually a
Clerk authentication surface rather than a custom imitation.

Desktop and mobile requirements:

- The workbench and selected coordinate remain visible behind the overlay.
- The modal fits within the viewport and scrolls internally when necessary.
- Focus is trapped in the modal, Escape or the close control cancels, and focus
  returns to the generate button.
- Loading, OAuth redirect, verification-code, and error states do not resize the
  workbench layout.
- Account controls reserve stable space to avoid navigation shifts while Clerk is
  loading.

No instructional marketing copy is added to the application UI.

## 5. Failure Handling

- **Clerk unavailable:** keep the coordinate, show a concise retryable error, and
  do not call generation.
- **Modal cancelled:** retain coordinate selection and clear or retain only a
  non-executing intent; reopening requires another explicit Generate click.
- **Expired intent:** remove it and require another Generate click.
- **Local user synchronization failure:** do not generate; show a retryable server
  error while preserving the coordinate.
- **Generation returns 401:** reopen sign-in only after an explicit user action;
  do not create a modal loop.
- **Duplicate callback or rapid state updates:** consume the intent once and rely
  on the server idempotency key as a second guard.

Authentication errors never include Clerk tokens, email verification codes, or
provider response bodies in client messages or application logs.

## 6. Configuration

Local and deployment environments require:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

Clerk Dashboard configuration enables Google and email verification codes. Local,
Vercel preview, and production origins are added through Clerk's supported domain
configuration. No secrets are committed to Git; `.env.local` remains ignored.

The app continues to run in provider mock mode when Clerk keys are absent during
non-authenticated UI development. Authentication-specific integration tests use
test configuration rather than production credentials.

## 7. Testing and Acceptance

Unit and component tests cover:

- Pending-intent schema validation and expiry.
- Single consumption after authentication.
- Cancellation and invalid intent behavior.
- Stable loading and signed-in account-control states.

Route tests cover:

- Missing sessions return `401` for protected JSON resources.
- A valid Clerk user creates or reuses the matching `app_users` row.
- Client-supplied owner IDs cannot override the authenticated owner.

End-to-end tests cover desktop and mobile:

- Signed-out users can open the workbench and select a coordinate.
- Generate opens the sign-in modal without losing the coordinate.
- Test authentication closes the modal and continues generation once.
- Cancelling does not generate.
- Signed-in account controls render without overflow.

Loop 2 is complete when public exploration remains usable, both selected sign-in
methods are configured, protected resources reject anonymous requests, and a
successful sign-in resumes the exact pending coordinate once.
