# NemoKon

A small, open scaffold for a **personal AI assistant**: [Mastra](https://mastra.ai) agent + NVIDIA **Nemotron**
served by **Nebius Token Factory** (OpenAI-compatible API) + an **OpenShell** port for sandboxed code.
Built for the Nebius *Personal AI* track. Apache-2.0.

It is a scaffold, not a product: the pieces are thin and each sits behind a port you can replace.
All names and data in this repo are fake.

## What is in it

| Path | Package | Role |
| --- | --- | --- |
| `packages/channel` | `@nemokon/channel` | `MessagingChannel` port + echo (in-memory) and stdout adapters |
| `packages/contracts` | `@nemokon/contracts` | zod schemas: agent turn, tasks, schedules, code run, browser research |
| `packages/memory` | `@nemokon/memory` | Mastra `LibSQLStore` / `Memory`, default `file:./mastra.db` |
| `packages/agent` | `@nemokon/agent` | Agent factory, execution limits, Token Factory provider config |
| `packages/tools` | `@nemokon/tools` | `taskCreate/List/Update/Close`, `scheduleCreate` (one-shot), `remember`/`forget` (stub), `webSearch` (optional), `sendMessage` |
| `packages/sandbox` | `@nemokon/sandbox` | `SandboxClient` port + OpenShell client stub (you supply the transport) |
| `apps/demo` | `@nemokon/demo` | Hono server: `POST /turn {conversationId,text}` → reply text |

Also: `config.example.yaml` (assistant tone, language `vi`/`en`, model per task), `prompts/personal-assistant.example.md`
(a 13-line neutral prompt), `data/sample/` (fake tasks and notes).

## Setup

Requirements: Node >= 20, pnpm 9 (`corepack enable` or `npm i -g pnpm@9.15.0`).

```bash
pnpm install
pnpm typecheck      # tsc --noEmit in every package (via turbo)
pnpm test           # node:test + tsx; no network or API key needed
pnpm build          # tsdown
```

## Nebius Token Factory

1. Create an account and an API key at <https://tokenfactory.nebius.com/>.
2. Pick a Nemotron model on the Token Factory *Models* page (copy its model id).
3. Configure the demo:

```bash
cp apps/demo/.env.example apps/demo/.env
# edit apps/demo/.env:
#   NEBIUS_API_KEY=<your key>
#   NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b   # or any id from the Models page
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEBIUS_API_KEY` | (required) | Token Factory key. Never commit it. |
| `NEBIUS_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | Model id. `models.chat` in the config overrides it. |
| `NEBIUS_BASE_URL` | `https://api.tokenfactory.nebius.com/v1/` | OpenAI-compatible endpoint. |
| `TAVILY_API_KEY` | unset | Turns on the `webSearch` tool. |
| `DEMO_TOKEN` | unset | If set, `POST /turn` needs `Authorization: Bearer <value>`. |
| `PORT` | `8787` | The demo binds to `127.0.0.1` only. |

The default model id comes from Nebius' Nemotron 3 Super announcement; check it still exists in your account.

## Run the demo

```bash
pnpm --filter @nemokon/demo start        # or: pnpm dev (watch mode)

curl -s localhost:8787/turn \
  -H 'content-type: application/json' \
  -d '{"conversationId":"demo","text":"What tasks do I have open?"}'
# {"replyText":"...","modelId":"nvidia/nemotron-3-super-120b-a12b"}
```

Conversation `demo` is pre-filled with fake tasks and notes from `data/sample/` (`sample_data.enabled` in the config).
Use another `conversationId` for an empty slate. Thread memory is stored in `./mastra.db` (git-ignored) in the working directory.
Task, schedule and note stores are in memory and reset on restart.

The demo has no user accounts. It listens on loopback only; if you expose it, set `DEMO_TOKEN` and put it behind TLS.

## Personal AI track: how the pieces map

- **Assistant behaviour**: `config.example.yaml` + `prompts/personal-assistant.example.md`.
- **Reasoning model**: Nemotron through Token Factory (`@nemokon/agent`, Mastra's OpenAI-compatible model config).
- **Personal state**: tasks, one-shot reminders, remembered facts, thread memory (`@nemokon/tools`, `@nemokon/memory`).
- **Safe code execution**: `@nemokon/sandbox` defines the port; wire [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) as described in `packages/sandbox/README.md`.
- **Channels**: implement `MessagingChannel` for your chat app; the demo uses stdout.

## Status and limits

- The OpenShell client is a stub: it validates input and output but does not call OpenShell until you supply a transport.
- `scheduleCreate` records a one-shot schedule; nothing fires it. Call `ScheduleStore.listDue()` from your own timer.
- `remember`/`forget` are a stub over an in-memory store.
- Browser contracts are defined; there is no browser worker here.

## License

Apache-2.0, see [LICENSE](LICENSE).
