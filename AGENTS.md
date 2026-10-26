# AGENTS.md

NemoKon: pnpm + turbo TypeScript monorepo (Node >= 20). Mastra agent, Nebius Token Factory (OpenAI-compatible), OpenShell sandbox port.

## Commands

- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build` (run from the repo root; all must pass before a commit).
- Demo: `pnpm --filter @nemokon/demo start`. Tests need no API key or network.
- Wrap long commands in `timeout`; use non-watch modes in scripts.

## Layout

- `packages/*` export TypeScript source (`src/index.ts`); `apps/demo` is the only app.
- Dependency direction: `contracts` <- `channel`/`sandbox`/`memory` <- `tools`/`agent` <- `apps/demo`. `agent` and `tools` do not import each other.
- Conversation id reaches tools through Mastra's request context (`CONVERSATION_ID_CONTEXT_KEY`), never from model input.

## Rules

- Public Apache-2.0 repo. No secrets, no `.env`, no real names, partners, hostnames or customer data. Samples are fake.
- Config is read from the environment or a YAML file passed at runtime; keep secrets out of YAML.
- Do not claim integrations that are stubs (OpenShell transport, memory notes, scheduler runner).
- Keep packages thin: add a port plus a small adapter, not a framework.
