# Plan: deploy the NemoKon demo to Fly.io

Status: **plan only, nothing implemented.** Written against `main` @ `97de543`.
Audience: Kiro agents (and humans) implementing one unit each without re-asking.

Hosting is settled: **Fly.io**. Rejected earlier: Nebius VM or VPS with Caddy, Render, pausing the deploy.

## 1. Goal and non-goals

Goal: `apps/demo` (`POST /turn`, `GET /health`) runs on a public `https://<app>.fly.dev` URL, protected by a bearer token, with Mastra thread memory (`mastra.db`) on a persistent Fly volume, secrets in Fly secrets, and a repeatable smoke check.

Non-goals (keep the repo thin, see `AGENTS.md`):

- No private Kon or business code, hostnames, customer data or real names in this repo. The Fly app name is the only deploy-specific string that gets committed, and it is not a secret.
- No multi-user accounts, no per-user auth, no database server, no autoscaling.
- No claims that stubs are real. The OpenShell transport, `remember`/`forget` notes and the schedule runner stay stubs after this work.
- No implementation in the planning commit: no `Dockerfile`, `fly.toml` or code changes yet.

## 2. Findings in the current code (why the work is not just a Dockerfile)

Verified by reading the repo at `97de543`:

| # | Finding | Evidence | Consequence |
| - | --- | --- | --- |
| F1 | The server binds `127.0.0.1` only, hard-coded | `apps/demo/src/index.ts`: `serve({ ..., hostname: "127.0.0.1" })` | Fly's proxy cannot reach it. Needs a `HOST` env (default stays `127.0.0.1`). |
| F2 | Production start runs TypeScript source through `tsx`, and `tsx` is a **devDependency** | `apps/demo/package.json`: `"start": "tsx src/index.ts"`; every `packages/*` exports `./src/index.ts` (`publishConfig` only swaps to `dist` at publish time) | `tsdown` output cannot be run directly: workspace packages resolve to `src`. A `--prod` install would drop `tsx`. Move `tsx` to `dependencies` of `apps/demo` and run it as a Node loader. |
| F3 | The libSQL URL comes **only from YAML**: `memory.libsql_url`, default `file:./mastra.db`, relative to the cwd. There is no env override | `apps/demo/src/config.ts` and `index.ts` | Need a deploy config (`config.fly.yaml`) with an absolute `file:/data/mastra.db`, selected with `NEMOKON_CONFIG`. No code change needed for this. |
| F4 | `REPO_ROOT` is computed as three levels above `apps/demo/src` | `config.ts` | The image must keep the layout `/app/apps/demo/src` so that `prompts/`, `data/sample/` and the config file resolve under `/app`. |
| F5 | Tasks, notes and schedules are in-memory and reset on every restart or deploy | `createInMemory*Store` in `index.ts`; README "Status and limits" | Document it. Keep exactly one always-on machine so RAM state is not lost to idle auto-stop. Deploys still reset it. |
| F6 | Auth is one shared `DEMO_TOKEN`. If it is unset, `POST /turn` is open | `app.ts`: `if (options.token && ...)` | Today the loopback bind hides this. Once bound to `0.0.0.0` on a public URL, an unset token means an open, credit-burning endpoint. Add a startup guard: refuse a non-loopback `HOST` without `DEMO_TOKEN`. |
| F7 | `conversationId` is chosen by the client | `agentTurnRequestSchema` | Anyone holding the token can read or write any conversation. Acceptable for a one-owner demo; state it in the docs. |
| F8 | No `SIGTERM` handling | `index.ts` | Node's default exits on `SIGTERM`/`SIGINT`, so it works, but an explicit close lets in-flight turns and the libSQL handle finish. Small, optional. |
| F9 | `/health` returns `{ok:true}` without touching libSQL or the provider | `app.ts` | Fine as a liveness check. It does not prove the DB is writable or the key is valid; the smoke check covers that. |
| F10 | `@libsql/client` ships native binaries for glibc and musl | `pnpm-lock.yaml` lists `@libsql/linux-x64-gnu` and `-musl` | Use a glibc base (`node:22-bookworm-slim`). Avoid Alpine to skip native-binary surprises. |
| F11 | Any thrown error becomes a generic `502` | `app.ts` | Upstream `429` from Token Factory is indistinguishable from a bug. See section 9. |
| F12 | `.gitignore` ignores `*.db*` and `.env*` (keeps `.env.example`) | `.gitignore` | `.dockerignore` must mirror this so a local `mastra.db` or `.env` never enters the build context. |

Branch state at planning time: `main` is **not** protected (`gh api .../branches/main` → `protected: false`), CI is `typecheck`, `test`, `build` on Node 22 with pnpm 9.15.0.

## 3. Decisions (settled) and open items

Settled:

- Platform: Fly.io Machines, **one** machine, one volume.
- Secrets in Fly secrets, never committed: `NEBIUS_API_KEY`, `DEMO_TOKEN`, optional `TAVILY_API_KEY`.
- Non-secret config in `fly.toml [env]` and `config.fly.yaml`.
- Image: multi-stage Docker build on `node:22-bookworm-slim`, pnpm 9.15.0 via corepack, runtime start = `node --import tsx src/index.ts`.
- Single machine because SQLite/libSQL on a Fly volume is single-writer and a Fly volume attaches to exactly one machine.

Open items to confirm (owner of the Fly account answers; implementers use the default shown and flag it in the PR/commit):

| Item | Default in this plan | How to confirm |
| --- | --- | --- |
| `NEBIUS_MODEL` id | `nvidia/nemotron-3-super-120b-a12b` (README says "check it still exists in your account") | Before the first deploy: `curl -sS -H "Authorization: Bearer $NEBIUS_API_KEY" https://api.tokenfactory.nebius.com/v1/models` and look for the id. If missing, change `[env] NEBIUS_MODEL` in `fly.toml`. |
| Fly app name | `nemokon-demo` (names are global; pick another if taken) | `fly apps create` fails if taken. |
| Primary region | `sin` (the owner is in UTC+7; the LLM call dominates latency anyway) | Owner may prefer `fra` if Token Factory is Europe-hosted. Volume and machine must share the region. |
| Machine size | `shared-cpu-1x`, 1 GB RAM (Mastra plus libSQL native; 512 MB is untested and may be tight) | Measure with `fly status` / `fly machine status` after the smoke run; shrink only with evidence. |
| Public URL in the README | Placeholder `https://<app>.fly.dev` | The owner decides whether to publish the real URL. Default: do not. |
| GHCR image and CD | Optional units U6 and U7, off by default | Owner opts in. |

## 4. Target architecture

```
client --HTTPS--> Fly proxy (TLS, force_https) --> machine :8787 (HOST=0.0.0.0)
                                                   |- node --import tsx src/index.ts   (user "node")
                                                   |- /app/...                          (read-only code, config.fly.yaml)
                                                   `- /data  <-- Fly volume "nemokon_data"  (mastra.db, WAL files)
machine --HTTPS--> https://api.tokenfactory.nebius.com/v1/   (NEBIUS_API_KEY from Fly secrets)
```

TLS is terminated by Fly. This resolves the "single `DEMO_TOKEN` over plain HTTP" constraint, because `force_https = true` redirects HTTP and the bearer token only travels over TLS. The container listens on plain HTTP inside Fly's private network.

## 5. Interface contract (so units can be built in parallel)

Every unit must use exactly these names. Changing one means editing this table in the same PR.

| Item | Value |
| --- | --- |
| Fly app name | `nemokon-demo` |
| Primary region | `sin` |
| Volume name / mount path | `nemokon_data` → `/data` (1 GB initial) |
| Internal port | `8787` (`PORT=8787`) |
| Bind | `HOST=0.0.0.0` set in `fly.toml [env]`; code default stays `127.0.0.1` |
| Config file in image | `/app/config.fly.yaml` selected by `NEMOKON_CONFIG=config.fly.yaml` |
| libSQL URL | `file:/data/mastra.db` (set in `config.fly.yaml`) |
| Image layout | `/app` = repo root; app at `/app/apps/demo`; `WORKDIR /app/apps/demo` |
| Run user | `node` (uid 1000) after an entrypoint `chown` of `/data` |
| Start command | `node --import tsx src/index.ts` (cwd `/app/apps/demo`) |
| Health route | `GET /health` → `200 {"ok":true}`, unauthenticated |
| Auth | `Authorization: Bearer $DEMO_TOKEN` on `POST /turn` |
| Secrets | `NEBIUS_API_KEY`, `DEMO_TOKEN`, optional `TAVILY_API_KEY` |
| Plain env (fly.toml) | `HOST`, `PORT`, `NEMOKON_CONFIG`, `NEBIUS_MODEL`, `AGENT_TIMEOUT_MS=55000` |
| Smoke script | `scripts/smoke-fly.sh`, inputs `BASE_URL` and `DEMO_TOKEN` from the environment |
| Deploy workflow | `.github/workflows/deploy.yml`, secret `FLY_API_TOKEN`, repo variable `FLY_DEPLOY=true` |

## 6. Work units

Each unit lists files it owns, so parallel PRs do not touch the same file. Suggested tab labels are for spawners.

Merge order: **U1 first**, then **U2–U5 in parallel**, then U6/U7/U8 (optional), then **U9** (operator, needs the Fly account).

| Unit | Tab label | Owns (files) | Depends on |
| --- | --- | --- | --- |
| U1 | `fly:runtime` | `apps/demo/src/index.ts`, new `apps/demo/src/server-options.ts`, `apps/demo/test/server-options.test.ts`, `apps/demo/package.json`, `pnpm-lock.yaml`, `apps/demo/.env.example` | none |
| U2 | `fly:image` | `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`, `config.fly.yaml` | contract only (U1 for a final local run) |
| U3 | `fly:config` | `fly.toml`, `docs/deploy/fly.md` (runbook) | contract only |
| U4 | `fly:smoke` | `scripts/smoke-fly.sh` | contract only |
| U5 | `fly:docs` | `README.md`, `AGENTS.md` (small additions) | contract only |
| U6 | `fly:limits` (optional) | `apps/demo/src/app.ts`, `apps/demo/src/limits.ts`, tests | U1 merged |
| U7 | `fly:cd` (optional) | `.github/workflows/deploy.yml` | U2, U3 merged |
| U8 | `fly:ghcr` (optional) | extends `.github/workflows/deploy.yml` | U7 |
| U9 | `fly:ship` (operator) | none in repo (creates the real app) | U1–U5, owner approval |

### U1 `fly:runtime`: make the server deployable

Changes:

1. **HOST env.** Read `process.env.HOST?.trim() || "127.0.0.1"`. Pass it as `hostname` to `serve`. Update the startup log and the comment ("Loopback only..." is no longer always true). Keep the default loopback.
2. **Public-bind guard (F6).** If the host is not a loopback address (`127.0.0.1`, `::1`, `localhost`) and `DEMO_TOKEN` is empty, print an error and `process.exit(1)`. Put the pure decision in `apps/demo/src/server-options.ts`:

   ```ts
   export function resolveServerOptions(env: Record<string, string | undefined>): { hostname: string; port: number; token?: string }
   // throws a descriptive Error when hostname is non-loopback and the token is empty
   ```

   `index.ts` calls it and turns the error into `console.error` + exit 1. Also validate `PORT` (integer 1–65535) here.
3. **tsx into `dependencies`** of `apps/demo/package.json` (move it from `devDependencies`, keep the same range `^4.20.0`). Regenerate the lockfile with `pnpm install --lockfile-only` and make sure `pnpm install --frozen-lockfile` still passes (CI uses it). `packages/*` still use `tsx` as a devDependency for their tests; leave them.
4. **Graceful shutdown (F8, small).** Keep the `serve(...)` return value, on `SIGTERM`/`SIGINT` call `server.close()` then `process.exit(0)`, with a hard timeout (about 10 s) that exits `1`. Keep it about 10 lines.
5. `apps/demo/.env.example`: replace the "Server binds to 127.0.0.1 only" line with `HOST` documentation (`# HOST=127.0.0.1 ; set 0.0.0.0 only behind TLS and with DEMO_TOKEN`).
6. **Tests** (node:test + tsx, no network): default host is loopback; `HOST=0.0.0.0` without a token throws; with a token resolves; bad `PORT` throws; whitespace-only token counts as unset (matches `index.ts`, which trims).

Acceptance: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build` all pass from the root. `HOST=0.0.0.0 NEBIUS_API_KEY=x pnpm --filter @nemokon/demo start` exits 1 with a clear message; adding `DEMO_TOKEN=x` starts it.

### U2 `fly:image`: container image

`Dockerfile` (multi-stage, build context = repo root). Skeleton to finish, not to copy blindly:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
WORKDIR /app
# manifests first for layer caching; one COPY per workspace package
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/demo/package.json apps/demo/
COPY packages/agent/package.json packages/agent/
COPY packages/channel/package.json packages/channel/
COPY packages/contracts/package.json packages/contracts/
COPY packages/memory/package.json packages/memory/
COPY packages/tools/package.json packages/tools/
# (sandbox is not a dependency of the demo; skip it unless the lockfile needs it)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @nemokon/demo...

FROM base AS runtime
WORKDIR /app
COPY --from=deps /app/ /app/
COPY apps/demo/src apps/demo/src
COPY packages/*/src ...            # one COPY per package: packages/<name>/src
COPY config.fly.yaml ./
COPY prompts prompts
COPY data/sample data/sample
COPY docker-entrypoint.sh /usr/local/bin/
WORKDIR /app/apps/demo
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/index.ts"]
```

Requirements:

- Keep `/app/apps/demo/src` so `REPO_ROOT` resolves to `/app` (F4). Also copy each workspace package's `package.json` and `src` (they export `src/index.ts`, F2), plus `tsconfig*.json` files that `tsx` reads (`tsconfig.base.json`, per-package `tsconfig.json`). If `tsx` fails to resolve something, add the missing file; do not add `turbo` or `tsdown` to the runtime image.
- No `pnpm build` in the image: the build output is not used by the run path (F2). State this in a comment so nobody "fixes" it later.
- `pnpm install --prod --filter @nemokon/demo...` must keep `node_modules` symlinks working after the `COPY --from=deps`. If copying breaks pnpm's symlinks, build and run in the same stage instead; do not switch to `npm`.
- Fail the build if the lockfile is out of date (`--frozen-lockfile`).
- `docker-entrypoint.sh` (POSIX sh, `set -eu`): `mkdir -p /data`, `chown -R node:node /data` when running as root (Fly volumes mount root-owned), then `exec setpriv --reuid=node --regid=node --init-groups "$@"`. If `setpriv` is missing in the base image, fall back to `exec gosu`; do not run the server as root silently. Mark the script executable (`chmod +x`, commit with mode 755).
- `.dockerignore`: `**/node_modules`, `.git`, `.github`, `.turbo`, `**/dist`, `docs`, `coverage`, `*.log`, `.env`, `.env.*` with `!.env.example`, `*.db`, `*.db-*`, `fly.toml` is allowed in the context (flyctl reads it outside the image anyway). Mirrors `.gitignore` (F12).
- `config.fly.yaml` (no secrets; copy of `config.example.yaml` with these changes):
  - `memory.libsql_url: "file:/data/mastra.db"`.
  - `sample_data.enabled: true` (the data is fake and keeps the README "What tasks do I have open?" example working; the owner can set `false` for a cleaner public demo). Note the seed lives in RAM and is re-applied at each start.
  - `models.chat: null` so `NEBIUS_MODEL` from `fly.toml` applies.
  - Keep `assistant.timezone` at `UTC` unless the owner says otherwise.
  - Header comment explaining it is the Fly deploy config.

Acceptance (local, needs Docker, no Fly):

```bash
timeout 600 docker build -t nemokon-demo:local .
docker volume create nemokon_test_data
docker run --rm -d --name nemokon_t -p 8787:8787 -v nemokon_test_data:/data \
  -e HOST=0.0.0.0 -e NEMOKON_CONFIG=config.fly.yaml \
  -e NEBIUS_API_KEY=dummy -e DEMO_TOKEN=localtoken nemokon-demo:local
curl -fsS localhost:8787/health                                   # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8787/turn \
  -H 'content-type: application/json' -d '{"conversationId":"c","text":"hi"}'   # 401
docker exec nemokon_t id                                           # uid=1000(node)
docker exec nemokon_t ls -l /data                                  # owned by node
docker stop nemokon_t && docker volume rm nemokon_test_data
```

With a dummy key a real `/turn` returns `502`; that is expected and proves the path reaches the provider call. Also check the image size and report it. Clean up the container, the volume and the image afterwards.

### U3 `fly:config`: `fly.toml` and runbook

`fly.toml` (draft; verify field names with `fly config validate` before committing):

```toml
app = "nemokon-demo"
primary_region = "sin"
kill_signal = "SIGTERM"
kill_timeout = "15s"

[build]
  dockerfile = "Dockerfile"

[env]
  HOST = "0.0.0.0"
  PORT = "8787"
  NEMOKON_CONFIG = "config.fly.yaml"
  NEBIUS_MODEL = "nvidia/nemotron-3-super-120b-a12b"   # confirm against the Models page
  AGENT_TIMEOUT_MS = "55000"                            # stay under the proxy idle limit (see section 9)

[mounts]
  source = "nemokon_data"
  destination = "/data"
  initial_size = "1gb"

[http_service]
  internal_port = 8787
  force_https = true
  auto_stop_machines = "off"      # tasks/notes/schedules live in RAM (F5): never idle-stop
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [http_service.concurrency]
    type = "requests"
    soft_limit = 4                # a turn can take tens of seconds; keep this low
    hard_limit = 8

  [[http_service.checks]]
    method = "GET"
    path = "/health"
    interval = "15s"
    timeout = "5s"
    grace_period = "25s"          # Mastra + libSQL migrations at boot

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

Rules:

- **Never put `NEBIUS_API_KEY`, `DEMO_TOKEN` or `TAVILY_API_KEY` in `fly.toml`.**
- No `[deploy] release_command`: it would run on a different machine without the volume.
- Exactly one machine. Document `fly scale count 1` and why `fly scale count 2` is wrong (volumes are per machine, SQLite is single-writer, in-memory stores diverge).
- A deploy replaces the single machine in place (rolling strategy; blue-green is not available with a volume). Expect a short outage and a reset of in-memory tasks per deploy. Say so in the runbook.
- Run `fly config validate` (needs the CLI, no login for pure syntax; if it asks for auth, report that instead of guessing).

`docs/deploy/fly.md` (runbook, operator-facing, copy-paste commands). Sections:

1. **Prerequisites**: `flyctl`, `fly auth login`, Nebius key, confirmed model id.
2. **Create**: `fly apps create nemokon-demo` then `fly volumes create nemokon_data --region sin --size 1` (answer `y` only if prompted about single-volume risk; this plan accepts it).
3. **Secrets** without shell history or committed files:

   ```bash
   DEMO_TOKEN=$(openssl rand -hex 32)
   # paste the Nebius key interactively; do not put it in the command line
   read -rs NEBIUS_API_KEY
   printf 'NEBIUS_API_KEY=%s\nDEMO_TOKEN=%s\n' "$NEBIUS_API_KEY" "$DEMO_TOKEN" | fly secrets import --stage
   # optional: TAVILY_API_KEY the same way
   echo "$DEMO_TOKEN"   # store it in your password manager, then clear the terminal
   unset NEBIUS_API_KEY DEMO_TOKEN
   ```

   `--stage` keeps the secrets staged until the first deploy so the machine does not boot without them.
4. **First deploy**: `fly deploy --remote-only` (builds on Fly's builder, no local Docker needed).
5. **Smoke**: run `scripts/smoke-fly.sh` (U4) and `fly logs`.
6. **Rotate token**: `fly secrets set DEMO_TOKEN=...` (restarts the machine). **Rotate the Nebius key**: same with `NEBIUS_API_KEY`.
7. **Backup/restore**: Fly takes daily volume snapshots (check the retention in `fly volumes snapshots list`; do not promise a number). Restore = `fly volumes create nemokon_data_r --snapshot-id <id>` and re-point the mount. `fly volumes destroy` deletes data; the runbook must flag it as irreversible.
8. **Rollback**: `fly releases`, then `fly deploy --image <previous image ref>`.
9. **Debug**: `fly logs`, `fly ssh console`, `fly machine status`, `fly status`.
10. **Teardown**: `fly apps destroy nemokon-demo` (irreversible; also destroys the volume).
11. **Known limits**: restate F5, F6, F7, and the single-machine rule.

### U4 `fly:smoke`: `scripts/smoke-fly.sh`

Inputs from the environment: `BASE_URL` (required, e.g. `https://nemokon-demo.fly.dev`), `DEMO_TOKEN` (required). Never print the token; never pass it on a command line visible in `ps` (use `curl -H @<(...)` or `--config -` reading from a heredoc). `set -euo pipefail`, every `curl` with `--max-time 90`, exit non-zero on the first failed check, print one line per check (`PASS`/`FAIL`).

Checks, in order:

| # | Check | Expect |
| - | --- | --- |
| S1 | `GET $BASE_URL/health` | `200`, body contains `"ok":true` |
| S2 | `GET http://<host>/health` (plain HTTP) | `301`/`308` redirect to https (`force_https`) |
| S3 | `POST /turn` without a token, valid JSON body | `401` |
| S4 | `POST /turn` with a wrong token | `401` |
| S5 | `POST /turn` with the token and an invalid body (`{}`) | `400` |
| S6 | `POST /turn` with the token, `{"conversationId":"smoke-<ts>","text":"Reply with the single word: pong"}` | `200`, JSON with non-empty `replyText` and `modelId` equal to the configured model |
| S7 | Memory write: with token, `{"conversationId":"smoke-<ts>","text":"Remember this code word: kumquat. Reply OK."}` | `200` |

Persistence check (S8) is documented as a **manual step printed by the script** (the script cannot restart the machine without Fly credentials, and should not need them):

```bash
fly machine restart --app nemokon-demo          # or: fly machines list, then fly machine restart <id>
fly ssh console -C "ls -l /data"                # mastra.db exists, non-zero size, owned by node
BASE_URL=... DEMO_TOKEN=... scripts/smoke-fly.sh --recall smoke-<ts>
```

`--recall <conversationId>` sends "What code word did I give you?" and expects `kumquat` in `replyText` (case-insensitive). This is a model-dependent soft check, so a miss prints `WARN`, not `FAIL`; the hard evidence of persistence is the `/data/mastra.db` file surviving the restart and thread history being returned. Also record in the runbook: after the restart `GET /health` is `200` again within the check grace period.

Also cover: S6 and S7 spend Token Factory tokens (small). The script header must say so. Allow `--no-llm` to skip S6/S7.

Acceptance: `shellcheck scripts/smoke-fly.sh` clean (if `shellcheck` is installed; else say it was not run), and a dry run against a local container from U2 (`BASE_URL=http://localhost:8787`) passes S1, S3, S4, S5 with a dummy key (S2, S6, S7 need the real deployment).

### U5 `fly:docs`: README and AGENTS.md

README additions (keep the existing tone; do not paste the runbook):

- A section **"Deploy to Fly.io"**: link to `docs/deploy/fly.md` and `docs/plans/fly-deploy.md`, show the three-command essentials (`fly apps create`, `fly volumes create`, `fly deploy`), and the **URL section**:

  ```md
  ### Hosted URL
  Your deployment is at `https://<app>.fly.dev`. Call it with the bearer token:
  curl -s https://<app>.fly.dev/turn -H "Authorization: Bearer $DEMO_TOKEN" -H 'content-type: application/json' -d '{"conversationId":"demo","text":"What tasks do I have open?"}'
  ```

  Use the placeholder unless the owner approves publishing the real URL. No token value anywhere.
- Update the env table: add `HOST` (default `127.0.0.1`; `0.0.0.0` requires `DEMO_TOKEN`), `NEMOKON_CONFIG`, `AGENT_MAX_STEPS`/`AGENT_MAX_TOKENS`/`AGENT_TIMEOUT_MS`. Fix the row for `PORT` ("binds to 127.0.0.1 only" becomes "binds to `HOST`").
- Reword "The demo has no user accounts. It listens on loopback only" to say loopback is the default and that public hosting needs `DEMO_TOKEN` and TLS (Fly provides TLS).
- Under "Status and limits": on Fly, tasks, schedules and notes are still in memory and reset on every restart or deploy; only thread memory (`mastra.db`) persists on the volume; one machine only; the shared token grants access to every conversation (F7).

`AGENTS.md`: add to Commands/Rules only what an agent needs: the `docker build` smoke from U2, "never commit `fly.toml` secrets", and "the deploy image runs source through tsx, do not remove `tsx` from `apps/demo` dependencies". Keep it short.

Acceptance: no claims of features that are stubs; relative links resolve; no real hostname or token.

### U6 `fly:limits` (optional): rate-limit handling and backpressure

Why: Token Factory enforces per-account rate limits, and the demo has no limiter. Known facts only: the API is OpenAI-compatible (so a rate limit normally arrives as HTTP `429`, possibly with `Retry-After`); the exact RPM/TPM values depend on the account and tier and are **not** hard-coded here: read them from the Token Factory console and put the numbers in the runbook, not in code.

Layers, cheapest first:

1. **Fly concurrency** (already in U3: `soft_limit 4`, `hard_limit 8`). Bounds parallel turns per machine. Load-test after the first deploy (for example 12 parallel S6 calls) and tune; do not assume how the proxy queues beyond `hard_limit`.
2. **Per-turn caps** already exist: `limits.max_tool_rounds` (8), `max_tokens` (1024), `timeout_ms`. A turn can call the model up to `max_tool_rounds` times, so the worst case per request is roughly that many LLM calls. Keep the defaults for a public URL; lower them rather than raise them.
3. **In-app guard** (this unit): a small process-wide semaphore (default 4 concurrent `runTurn`, env `TURN_MAX_CONCURRENCY`) and a per-conversation serial lock so two simultaneous turns on one `conversationId` do not interleave in thread memory. When saturated, answer `429` with `Retry-After: 2` instead of queueing without bound.
4. **Upstream 429 mapping**: when the provider error is a rate limit (status `429`, detect defensively from the thrown error's `status`/`statusCode`/message), return `429` (or `503`) with a generic body and `Retry-After` taken from the upstream header if present, instead of the generic `502`. Log the status only, never the prompt or the key.
5. **Auth brute force**: a 32-byte hex token is not guessable; no limiter is added for `401`s in this plan.

Keep it to one small file `limits.ts` plus option plumbing in `createApp` (`app.ts`), with tests using fake `runTurn`s (no network). The one-line wiring in `index.ts` happens after U1 is merged to avoid conflicts. Not a framework: no Redis, no queue.

Acceptance: tests for saturation → `429`, per-conversation serialisation, upstream-429 mapping, and that normal behaviour (`200`, `401`, `400`) is unchanged; the whole repo gate passes.

### U7 `fly:cd` (optional): deploy from GitHub Actions

New `.github/workflows/deploy.yml`, separate from `ci.yml` (do not weaken CI):

- Trigger: `workflow_run` of workflow `ci` with `types: [completed]`, `branches: [main]`; job condition `github.event.workflow_run.conclusion == 'success'` **and** `vars.FLY_DEPLOY == 'true'` (so forks and fresh clones never try to deploy).
- Checkout the exact `workflow_run.head_sha`.
- `permissions: contents: read`; `concurrency: { group: fly-deploy, cancel-in-progress: false }`.
- Steps: `actions/checkout@v4`, `superfly/flyctl-actions/setup-flyctl` (pin a tag or commit; do not use `@master`), then `flyctl deploy --remote-only --app nemokon-demo`, then `scripts/smoke-fly.sh --no-llm` using `BASE_URL` (repo variable) and `DEMO_TOKEN` (repo secret) so a bad release fails the job.
- Secrets: `FLY_API_TOKEN` as a **deploy token scoped to the app** (`fly tokens create deploy -a nemokon-demo`), not a personal org token. Optional GitHub Environment `production` with a required reviewer.
- Note in the workflow header that each deploy resets in-memory tasks (F5).

Acceptance: `actionlint` clean if available (else say so); with `FLY_DEPLOY` unset the job is skipped. The workflow cannot be fully tested without the real token; say that in the PR.

### U8 `fly:ghcr` (optional): prebuilt image on GHCR

Only if the owner wants reproducible, scannable images or builds outside Fly's builder. Extends U7: a `build` job with `docker/setup-buildx-action`, `docker/login-action` to `ghcr.io` using `GITHUB_TOKEN` (`permissions: packages: write` on that job only), `docker/build-push-action` tagging `ghcr.io/<owner-lowercase>/nemokon-demo:${{ github.sha }}` (and `:main`), with GHA cache. Then the deploy job uses `flyctl deploy --image ghcr.io/<owner>/nemokon-demo:<sha>`. The package must be **public** (the repo is public) so Fly can pull without registry credentials; otherwise set Fly registry credentials via secrets. Add an image scan step (for example Trivy) as report-only first. If this adds nothing the owner needs, skip it: `fly deploy --remote-only` is enough.

### U9 `fly:ship` (operator, owner approval required)

Not for unattended agents: it creates billable resources and handles real secrets.

1. Owner confirms the open items in section 3.
2. Run the runbook (U3) steps 1–4.
3. Run `scripts/smoke-fly.sh` (U4) and the manual restart/persistence check.
4. Record the evidence (command output, redacted) in the PR or issue; set the repo variable and secrets for U7 if CD is wanted.
5. Only then update the README URL (U5) if the owner agreed to publish it.

## 7. Production start path (decision record)

| Option | Verdict |
| --- | --- |
| Run built `dist` with plain `node` | **Rejected.** Packages export `src/index.ts`; `publishConfig` only applies at publish. Making `dist` runnable means reworking exports in every package. |
| Node's native TypeScript stripping | **Rejected.** Imports such as `./app` have no extension and the stripping rules differ by Node minor version. Not worth the risk. |
| `tsx` as a Node loader (`node --import tsx src/index.ts`) with `tsx` as a prod dependency | **Chosen.** Same path as `pnpm start` and the tests, so the image runs what CI tested. Cost: slightly larger image, a little more boot time. |
| `pnpm start` as the container command | Works but adds a pnpm process layer; the direct `node --import tsx` form is simpler for signals. |

## 8. Persistence and data

- `mastra.db` (plus `-wal`/`-shm` files) lives at `/data` on the Fly volume, URL `file:/data/mastra.db`. Absolute path on purpose: a relative path would land in the ephemeral root filesystem and silently lose data on every deploy.
- The machine root filesystem is ephemeral. Only `/data` persists.
- One volume, one machine, one region. Volume loss or machine-host failure means downtime until a restore from snapshot; there is no HA in this plan. Say so in the runbook.
- Not persisted (F5): tasks, one-shot schedules, remembered notes. Nothing fires schedules (`ScheduleStore.listDue()` has no timer in this repo). Do not describe reminders as working in the README.
- Concurrency note: the app is a single Node process, which is the only writer. Do not run `fly ssh console` and open the DB for writing while the server runs.

## 9. Timeouts, limits and Token Factory

- `AGENT_TIMEOUT_MS=55000` in `fly.toml` keeps a turn under about a minute. The reason: the Fly proxy closes idle HTTP connections after a period around one minute; a turn that outlives it would fail on the client side while still spending tokens. This proxy limit is from memory of Fly's behaviour and was **not** re-verified for this plan: U3 must check the current Fly docs and adjust the value, and U9 should confirm with one deliberately slow turn.
- `max_tool_rounds` (8) multiplies cost per request. Keep the defaults on a public URL.
- Token Factory limits depend on the account; read them from the console. Keep them out of the repo.
- Cost: this plan gives no price numbers. Check Fly.io and Nebius pricing pages before approving U9 (one always-on shared machine, one 1 GB volume, plus LLM tokens).
- Log hygiene: never log request text or keys; the app already logs only error messages. U6 must keep that.

## 10. Security checklist

- [ ] `DEMO_TOKEN` is at least 32 random bytes, stored only in Fly secrets and the owner's password manager.
- [ ] The server refuses a non-loopback bind without a token (U1).
- [ ] `force_https = true`; smoke S2 proves HTTP redirects.
- [ ] No secrets in `fly.toml`, `config.fly.yaml`, Dockerfile build args or image layers (`docker history` check in U2: no `ARG`/`ENV` with keys).
- [ ] `.dockerignore` blocks `.env*` and `*.db*`.
- [ ] Run as non-root `node` user.
- [ ] `/health` exposes nothing beyond `{ok:true}`.
- [ ] F7 documented: the token grants access to all conversations.
- [ ] Deploy token for CD is app-scoped, not an org token.
- [ ] `.gitignore` still ignores `.env*` and `*.db*`; confirm no secret was ever committed with `git log -p -S` on the final diff if in doubt.

## 11. Definition of done

1. `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass on the final branch, and CI is green.
2. `docker build` and the local container acceptance (U2) pass.
3. After U9: smoke S1–S7 pass against the real URL, the restart/persistence check passes (`/data/mastra.db` survives; recall is at least `WARN`-free or explained), and `fly logs` shows no key or prompt text.
4. README has the URL section and honest limits; no claim beyond what is real.
5. Rollback command was written down and tried once (`fly releases`, then redeploy the previous image).

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| `pnpm --prod --filter` plus `COPY --from=deps` breaks pnpm symlinks | Build and run in a single stage (U2 fallback). |
| `tsx` cannot find a `tsconfig` or a package source in the image | Copy the missing file explicitly; verify with the local container run. |
| Configured model id no longer exists | Pre-flight `/v1/models` call (section 3). |
| 512 MB/1 GB sizing wrong | Measure after the smoke run; adjust `[[vm]]`. |
| In-memory data lost on every deploy | Documented; one machine kept always on; no scheduler claim. |
| Cost surprise from public traffic | Token + concurrency limits + U6; revoke by rotating `DEMO_TOKEN`. |
| `workflow_run` deploy fires for a bad merge | Smoke step fails the job; rollback runbook. |

## 13. Spawner cheat sheet

```
fly:runtime  U1  server HOST bind, public-bind guard, tsx->dependencies, SIGTERM, tests      (start first)
fly:image    U2  Dockerfile, .dockerignore, docker-entrypoint.sh, config.fly.yaml            (parallel after U1 starts)
fly:config   U3  fly.toml, docs/deploy/fly.md runbook                                        (parallel)
fly:smoke    U4  scripts/smoke-fly.sh                                                        (parallel)
fly:docs     U5  README Fly section + URL placeholder, env table, AGENTS.md                  (parallel)
fly:limits   U6  optional: concurrency guard, 429 mapping                                    (after U1 merged)
fly:cd       U7  optional: .github/workflows/deploy.yml                                      (after U2+U3)
fly:ghcr     U8  optional: GHCR build + deploy --image                                       (after U7)
fly:ship     U9  operator: real app, secrets, first deploy, smoke, evidence                  (owner approval)
```

Each unit: one branch/PR (or atomic commit on `main`), touch only the files it owns, run the root gate (`timeout 300 pnpm typecheck && timeout 300 pnpm test && timeout 300 pnpm build`) before committing, and wrap every long command in `timeout`.
