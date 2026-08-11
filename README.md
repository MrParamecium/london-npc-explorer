# London NPC Atlas

A coordinate-based London explorer that builds statistically grounded NPCs,
generates their portrait, and keeps an ongoing conversation with them.

Loop 0 runs entirely in mock mode. It includes the Night Glass explorer shell,
Greater London coordinate validation, atomic mock generation, chat, and encounter
history. External maps, data, authentication, models, and storage are added behind
provider boundaries in later loops.

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
```

## Project Notes

- [V1 design](docs/superpowers/specs/2026-08-11-london-npc-explorer-design.md)
- [Implementation plan](docs/superpowers/plans/2026-08-11-london-npc-explorer-implementation.md)

Secrets belong in `.env.local` and the Vercel environment, never in Git.
