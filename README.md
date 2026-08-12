# London NPC Atlas

A coordinate-based London explorer that builds statistically grounded NPCs,
generates their portrait, and keeps an ongoing conversation with them.

The current location loop resolves official London LSOA, 2026 ward, and borough
boundaries from Neon/PostGIS. Mock mode provides deterministic nearby context and
a clickable 2D preview without Google billing. Live mode swaps in Google Maps,
reverse geocoding, and Places without changing the application contract.

## Local Development

Requirements: Node.js 20+ and pnpm.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm secrets:check
```

## Project Notes

- [V1 design](docs/superpowers/specs/2026-08-11-london-npc-explorer-design.md)
- [Implementation plan](docs/superpowers/plans/2026-08-11-london-npc-explorer-implementation.md)
- [Google Maps setup](docs/google-maps-setup.md)
- [Overall architecture](docs/architecture.md)

Secrets belong in `.env.local` and the Vercel environment, never in Git.
