# Runbook: deploy the NemoKon demo to Fly.io

Operator-facing, copy-paste commands. Design and decisions: [../plans/fly-deploy.md](../plans/fly-deploy.md).
Config this runbook drives: [`fly.toml`](../../fly.toml) (app `nemokon-demo`, region `sin`, one machine, volume `nemokon_data` mounted at `/data`).

Run every command from the repo root so `flyctl` finds `fly.toml`. Creating the app, volume and machine costs money; check the Fly.io and Nebius pricing pages first. This runbook gives no price numbers.

## 0. The one-machine rule

The app runs **exactly one machine with one volume**. A Fly volume attaches to one machine, libSQL/SQLite is single-writer, and tasks, notes and schedules live in that process's RAM. A second machine would have its own empty volume and its own diverging memory.

- Do **not** run `fly scale count 2`. If it happens by accident, undo it: `fly scale count 1`.
- `fly deploy` defaults to `--ha=true`, which creates spare machines. **Always pass `--ha=false`** (every deploy command below does).
- No `release_command` in `fly.toml`: it would run on a machine without the volume.

## 1. Prerequisites

- `flyctl` installed and logged in: `fly auth login`, then `fly auth whoami`.
- A Nebius Token Factory API key (<https://tokenfactory.nebius.com/>).
- A confirmed model id. The default in `fly.toml` is `nvidia/nemotron-3-super-120b-a12b`. Check it exists in your account (the key is read from the terminal, not put on the command line):

  ```bash
  read -rs NEBIUS_API_KEY; export NEBIUS_API_KEY
  curl -sS -H @<(printf 'Authorization: Bearer %s\n' "$NEBIUS_API_KEY") \
    https://api.tokenfactory.nebius.com/v1/models | grep -o 'nvidia/nemotron[^"]*'
  unset NEBIUS_API_KEY
  ```

  If the id is missing, edit `[env] NEBIUS_MODEL` in `fly.toml` before the first deploy.
- Optional: change `primary_region` in `fly.toml` (and use the same region for the volume below). The machine and the volume must share a region.

## 2. Create the app and the volume

```bash
fly apps create nemokon-demo          # names are global; if taken, pick another and change `app` in fly.toml
fly volumes create nemokon_data --app nemokon-demo --region sin --size 1
```

`fly volumes create` warns that a single volume has no redundancy. This deployment accepts that (answer `y`, or pass `--yes`). The volume name must match `[mounts] source` in `fly.toml`.

## 3. Secrets

Secrets live only in Fly. Never put them in `fly.toml`, `config.fly.yaml`, the Dockerfile, build args or the repo.

```bash
DEMO_TOKEN=$(openssl rand -hex 32)        # 32 random bytes
read -rs NEBIUS_API_KEY                   # paste the Nebius key; it is not echoed
printf 'NEBIUS_API_KEY=%s\nDEMO_TOKEN=%s\n' "$NEBIUS_API_KEY" "$DEMO_TOKEN" \
  | fly secrets import --stage --app nemokon-demo
echo "$DEMO_TOKEN"                        # save it in your password manager, then clear the terminal
unset NEBIUS_API_KEY DEMO_TOKEN
```

Optional web search: the same way with `TAVILY_API_KEY`.

`--stage` stores the secrets without starting a machine, so the app never boots without them. The server refuses to start on `HOST=0.0.0.0` without `DEMO_TOKEN`.

Check the names (values are never shown): `fly secrets list --app nemokon-demo`.

## 4. First deploy

```bash
fly deploy --remote-only --ha=false --app nemokon-demo
fly status --app nemokon-demo         # one machine, state "started", health check passing
fly volumes list --app nemokon-demo   # nemokon_data attached to that machine
```

`--remote-only` builds on Fly's builder; local Docker is not needed. Staged secrets are applied by this deploy.

## 5. Smoke check

```bash
export BASE_URL=https://nemokon-demo.fly.dev
read -rs DEMO_TOKEN; export DEMO_TOKEN
scripts/smoke-fly.sh               # S1-S7; S6 and S7 spend a few Token Factory tokens
scripts/smoke-fly.sh --no-llm      # skips S6/S7, no tokens spent
fly logs --app nemokon-demo --no-tail
```

Check `fly logs` for startup errors and confirm no key or prompt text appears.

Persistence check (manual; the script cannot restart the machine):

```bash
fly machine list --app nemokon-demo                     # note the machine id
fly machine restart <machine-id> --app nemokon-demo
fly ssh console --app nemokon-demo -C "ls -l /data"     # mastra.db exists, non-zero size, owned by node
curl -fsS "$BASE_URL/health"                            # {"ok":true} again within the grace period (about 25 s)
scripts/smoke-fly.sh --recall smoke-<ts>                # soft check: expects "kumquat"; a miss is WARN, not FAIL
```

The restart wipes tasks, schedules and notes (see section 11); only `/data/mastra.db` survives.

A manual call:

```bash
curl -s "$BASE_URL/turn" \
  -H "Authorization: Bearer $DEMO_TOKEN" -H 'content-type: application/json' \
  -d '{"conversationId":"demo","text":"What tasks do I have open?"}'
```

## 6. Rotate secrets

Setting a secret on a running app restarts the machine (a short outage and a reset of in-memory data).

```bash
# DEMO_TOKEN: generate, set, store the new value, then update every client
DEMO_TOKEN=$(openssl rand -hex 32)
printf 'DEMO_TOKEN=%s\n' "$DEMO_TOKEN" | fly secrets import --app nemokon-demo
echo "$DEMO_TOKEN"; unset DEMO_TOKEN

# NEBIUS_API_KEY: create the new key in the Token Factory console first, then revoke the old one afterwards
read -rs NEBIUS_API_KEY
printf 'NEBIUS_API_KEY=%s\n' "$NEBIUS_API_KEY" | fly secrets import --app nemokon-demo
unset NEBIUS_API_KEY
```

If the token leaked, rotate `DEMO_TOKEN` at once: it is the only access control, and it also stops credit burn. Rerun `scripts/smoke-fly.sh --no-llm` afterwards.

## 7. Backup and restore

Fly takes automatic volume snapshots. Retention is a volume setting (`fly volumes create --help` shows `--snapshot-retention`, `--scheduled-snapshots`); check what yours is instead of assuming a number.

```bash
fly volumes list --app nemokon-demo
fly volumes snapshots list <volume-id>
fly volumes snapshots create <volume-id>      # take one before risky changes
```

Restore from a snapshot. The volume name must stay `nemokon_data` so `fly deploy` finds it. I did not run this end to end; rehearse it on a scratch app before you need it.

```bash
fly volumes create nemokon_data --app nemokon-demo --region sin --snapshot-id <snapshot-id>
fly machine list --app nemokon-demo
fly machine destroy <machine-id> --force --app nemokon-demo
# IRREVERSIBLE: deletes the old volume and its data. Do this only after checking `fly volumes list`.
fly volumes destroy <old-volume-id> --app nemokon-demo
fly deploy --remote-only --ha=false --app nemokon-demo   # attaches the remaining unattached nemokon_data volume
```

Two volumes with the same name can confuse the attach step, so make sure only the restored one is left unattached before deploying.

There is no high availability. A volume or host failure means downtime until you restore from a snapshot.

## 8. Rollback

```bash
fly releases --app nemokon-demo --image            # find the previous release and its image ref
fly deploy --image <previous-image-ref> --ha=false --app nemokon-demo
fly status --app nemokon-demo
scripts/smoke-fly.sh --no-llm
```

A rollback replaces the single machine, so it also resets in-memory data. The volume and `mastra.db` are untouched. Rollback does not undo secret changes; `fly secrets` rotation is separate.

## 9. Deploys and downtime

A deploy replaces the single machine in place (rolling; blue-green is not available with a volume). Expect a short outage and a reset of tasks, schedules and notes on every deploy.

## 10. Debug

```bash
fly status --app nemokon-demo
fly logs --app nemokon-demo                    # add --no-tail for a one-shot dump
fly machine status <machine-id> --app nemokon-demo
fly ssh console --app nemokon-demo             # shell on the machine
```

Do not open `/data/mastra.db` for writing from `fly ssh console` while the server runs; the server is the only writer.

Typical symptoms:

- `401` on `/turn`: wrong or missing bearer token.
- `502` on `/turn`: any error in the turn, including a bad `NEBIUS_API_KEY`, an unknown model id or an upstream rate limit. Check `fly logs`.
- Machine restart loop with "refuses to start": `DEMO_TOKEN` secret missing.
- Client sees a dropped connection near one minute: see the timeout note below.

Timeout note: Fly's proxy closes an HTTP connection that sends no data for about 60 seconds (this comes from Fly community answers, not from a page in Fly's official docs, so re-check it). `AGENT_TIMEOUT_MS=55000` keeps a turn under that. Confirm with one deliberately slow turn after the first deploy and adjust `fly.toml` if the behaviour differs.

## 11. Teardown

```bash
# IRREVERSIBLE: destroys the app, its machine and its volume (including mastra.db and its snapshots)
fly apps destroy nemokon-demo
```

Back up first if you want the data: `fly ssh sftp get /data/mastra.db` (after a `fly volumes snapshots create`). Then revoke the Nebius key and any deploy token you created.

## 12. Known limits

- **In-memory state (F5).** Tasks, one-shot schedules and remembered notes live in RAM and reset on every restart, deploy, rollback and secret change. Only thread memory (`mastra.db` on `/data`) persists. `auto_stop_machines = "off"` and `min_machines_running = 1` stop idle-stops from losing RAM state, not deploys. Nothing fires schedules.
- **Shared token, open endpoint risk (F6).** Auth is one shared `DEMO_TOKEN`. The server refuses a non-loopback `HOST` without it, but if you ever remove the guard or the secret, `/turn` is an open, credit-burning endpoint. Anyone holding the token spends your Token Factory credits.
- **Any conversation readable (F7).** `conversationId` is chosen by the client, so anyone with the token can read and write every conversation. Fine for a one-owner demo; do not share the token.
- **Single machine, single volume, single region.** No high availability; see section 7. The Fly concurrency limits in `fly.toml` (`soft_limit = 4`, `hard_limit = 8`) bound parallel turns on that machine; load-test and tune them after the first deploy.
- **Stubs stay stubs.** The OpenShell transport, `remember`/`forget` notes and the schedule runner are not wired. This deployment does not change that.
- **VM size is a starting point.** `shared-cpu-1x` with 1 GB is untested under load; check `fly machine status` after the smoke run and shrink only with evidence.
