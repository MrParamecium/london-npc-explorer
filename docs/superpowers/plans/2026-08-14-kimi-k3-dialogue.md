# Kimi K3 NPC Dialogue Integration

## Goal

Replace the NPC dialogue runtime provider with the official Moonshot API using
the `kimi-k3` model while keeping the existing `DialogueProvider` contract,
structured NPC reply validation, timeout handling, and safe API errors.

## Implementation Steps

1. Add `MOONSHOT_API_KEY` and `MOONSHOT_MODEL` to environment parsing and the
   example environment file. Keep the key server-only.
2. Implement a Moonshot-compatible dialogue provider against
   `https://api.moonshot.cn/v1/chat/completions`, mapping usage metadata and
   validating the existing `AgentReply` JSON contract.
3. Switch `/api/chat/[npcId]` to the Moonshot provider, leaving OpenRouter
   available for the later image-generation loop.
4. Add provider tests for request shape, authorization, timeout behavior, and
   malformed replies.
5. Run typecheck, lint, unit tests, and a live Kimi smoke test when the account
   has K3 access. Kimi's official K3 guide currently requires a minimum 10 RMB
   recharge before K3 calls can succeed.

## Verification

- No API key appears in source, browser code, or logs.
- Local `.env.local` and deployment settings use `MOONSHOT_API_KEY`.
- Chat responses continue to satisfy `ChatResponseSchema`.
- The next loop adds OpenRouter GPT Image 2 as a separate portrait-generation
  provider after the dialogue path is stable.
