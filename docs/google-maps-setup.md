# Google Maps Setup

The app remains usable with `PROVIDER_MODE=mock`. Configure Google only after the
Cloud billing account is ready.

## Required APIs

Enable these APIs in the same Google Cloud project:

- Maps JavaScript API.
- Geocoding API.
- Places API (New).

Create two different keys. Never reuse the browser key on the server.

## Browser Key

Set `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and restrict the key to **Websites**.
Allow only the origins that actually host the app, for example:

```text
http://localhost:3000/*
http://127.0.0.1:3000/*
https://london-npc-explorer.vercel.app/*
https://your-final-domain.example/*
```

Under API restrictions, allow only **Maps JavaScript API**. The browser key is
visible in browser requests by design; website and API restrictions are its
protection.

## Server Key

Set `GOOGLE_MAPS_SERVER_KEY` only in `.env.local` and Vercel server environment
variables. Under API restrictions, allow only:

- Geocoding API.
- Places API (New).

Do not add this key to a `NEXT_PUBLIC_` variable. Vercel's standard serverless
egress IPs are not fixed, so an IP application restriction needs Vercel Secure
Compute or another fixed-egress proxy. Until fixed egress exists, use a separate
server key with strict API restrictions, conservative quotas, and no client
exposure.

## Initial Cost Guardrails

Start below expected traffic and increase only after reviewing usage:

- Maps JavaScript API: 1,000 map loads per day.
- Geocoding API: 1,000 requests per day.
- Places API (New) Nearby Search: 250 requests per day.
- Application throttle: 12 requests per client per minute and 120 requests per
  running server instance per minute.

Google Cloud quota dimensions vary by API. When a daily limit is unavailable,
choose the nearest stricter per-minute limit. A billing budget alert sends a
notification but does not stop requests; an API quota is the enforceable guard.

## Enable Live Mode

Add both keys together and switch provider mode:

```env
PROVIDER_MODE=live
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
```

Then run:

```bash
pnpm secrets:check
pnpm google:verify
```

`google:verify` makes one controlled request through each configured Google API
and one PostGIS geography lookup. It prints only status, latency, nearby count,
and official geography codes. It never prints either key or a raw provider
response.
