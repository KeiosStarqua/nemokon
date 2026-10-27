#!/usr/bin/env bash
# Smoke check for a deployed NemoKon demo (docs/plans/fly-deploy.md, unit U4).
#
# Usage:
#   BASE_URL=https://nemokon-demo.fly.dev DEMO_TOKEN=... scripts/smoke-fly.sh [--no-llm]
#   BASE_URL=... DEMO_TOKEN=... scripts/smoke-fly.sh --recall <conversationId>
#
# Environment:
#   BASE_URL      required, no trailing path (http://localhost:8787 works for a local container)
#   DEMO_TOKEN    required, the bearer token. It is never printed and never placed on a
#                 command line: curl reads it from a config file descriptor.
#   EXPECT_MODEL  optional, S6 also requires modelId to equal this value
#
# Options:
#   --no-llm            skip S6 and S7 (they are the only checks that spend tokens)
#   --recall <id>       after a machine restart, ask the model for the code word stored by S7
#                       in conversation <id>; a miss is a WARN, not a FAIL (model-dependent)
#   -h, --help          show this help
#
# Checks (first failure exits non-zero):
#   S1 GET  /health                       -> 200 and "ok":true
#   S2 GET  http://<host>/health          -> 301/302/307/308 to https (skipped for http:// BASE_URL)
#   S3 POST /turn, no token               -> 401
#   S4 POST /turn, wrong token            -> 401
#   S5 POST /turn, valid token, body {}   -> 400
#   S6 POST /turn, valid token, real turn -> 200, non-empty replyText and modelId
#   S7 POST /turn, memory write           -> 200
#
# COST: S6 and S7 each run a real agent turn and spend a small number of Token Factory tokens.
#
# S8 (persistence) is MANUAL, because it needs Fly credentials this script does not have.
# After a full run the script prints the exact steps:
#   fly machine restart --app nemokon-demo
#   fly ssh console -C "ls -l /data"          # mastra.db exists, non-zero size, owned by node
#   BASE_URL=... DEMO_TOKEN=... scripts/smoke-fly.sh --recall smoke-<ts>
# Afterwards GET /health must be 200 again within the check grace period.

set -euo pipefail

NO_LLM=0
RECALL_ID=""

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-llm) NO_LLM=1 ;;
    --recall)
      shift
      [ $# -gt 0 ] || { echo "error: --recall needs a conversationId" >&2; exit 2; }
      RECALL_ID="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

: "${BASE_URL:?error: BASE_URL is required (e.g. https://nemokon-demo.fly.dev)}"
: "${DEMO_TOKEN:?error: DEMO_TOKEN is required}"
BASE_URL="${BASE_URL%/}"
EXPECT_MODEL="${EXPECT_MODEL:-}"

command -v curl >/dev/null 2>&1 || { echo "error: curl is required" >&2; exit 2; }

case "$BASE_URL" in
  http://*|https://*) ;;
  *) echo "error: BASE_URL must start with http:// or https://" >&2; exit 2 ;;
esac

# The token goes into a curl config line, so it must not contain characters that
# the config parser treats specially. A hex or base64url token is fine.
case "$DEMO_TOKEN" in
  *[\"\\$'\n\r']*) echo "error: DEMO_TOKEN contains a quote, backslash or newline" >&2; exit 2 ;;
esac

HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1

BODY_FILE="$(mktemp)"
HDR_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE" "$HDR_FILE"' EXIT

HTTP_CODE=""

pass() { printf 'PASS %s\n' "$1"; }
warn() { printf 'WARN %s\n' "$1"; }
skip() { printf 'SKIP %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1" >&2
  if [ -s "$BODY_FILE" ]; then
    printf '     response (first 200 bytes): %s\n' "$(head -c 200 "$BODY_FILE" | tr '\n\r' '  ')" >&2
  fi
  exit 1
}

# request METHOD URL [auth-token] [json-body]
# Sets HTTP_CODE; response body in BODY_FILE, response headers in HDR_FILE.
# The Authorization header is passed through a process-substitution config, so the
# token never appears in argv (printf is a shell builtin).
request() {
  local method="$1" url="$2" auth="${3:-}" data="${4:-}"
  local -a args=(--silent --show-error --max-time 90 --request "$method"
    --output "$BODY_FILE" --dump-header "$HDR_FILE" --write-out '%{http_code}')
  if [ -n "$data" ]; then
    args+=(--header 'content-type: application/json' --data-binary "$data")
  fi
  : >"$BODY_FILE"
  if [ -n "$auth" ]; then
    HTTP_CODE="$(curl "${args[@]}" --config <(printf 'header = "Authorization: Bearer %s"\n' "$auth") "$url" 2>/dev/null)" || HTTP_CODE="000"
  else
    HTTP_CODE="$(curl "${args[@]}" "$url" 2>/dev/null)" || HTTP_CODE="000"
  fi
}

# json_field NAME -> prints the string value of a top-level field of BODY_FILE ("" if absent)
json_field() {
  if [ "$HAVE_JQ" -eq 1 ]; then
    jq -r --arg k "$1" '.[$k] // "" | if type == "string" then . else "" end' "$BODY_FILE" 2>/dev/null || true
  else
    sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$BODY_FILE" | head -n 1
  fi
}

turn_body() { # conversationId text (both free of quotes/backslashes by construction)
  printf '{"conversationId":"%s","text":"%s"}' "$1" "$2"
}

# --- S1 -------------------------------------------------------------------
request GET "$BASE_URL/health"
if [ "$HTTP_CODE" = "200" ] && tr -d ' \n\r' <"$BODY_FILE" | grep -q '"ok":true'; then
  pass "S1 GET /health -> 200 ok:true"
else
  fail "S1 GET /health expected 200 with ok:true, got HTTP $HTTP_CODE"
fi

# --- recall-only mode -------------------------------------------------------
if [ -n "$RECALL_ID" ]; then
  case "$RECALL_ID" in
    *[!A-Za-z0-9._-]*) echo "error: conversationId may only contain A-Z a-z 0-9 . _ -" >&2; exit 2 ;;
  esac
  request POST "$BASE_URL/turn" "$DEMO_TOKEN" "$(turn_body "$RECALL_ID" "What code word did I give you?")"
  [ "$HTTP_CODE" = "200" ] || fail "recall POST /turn expected 200, got HTTP $HTTP_CODE"
  reply="$(json_field replyText)"
  if printf '%s' "$reply" | grep -qi 'kumquat'; then
    pass "recall: reply mentions the code word (conversation $RECALL_ID)"
  else
    warn "recall: reply does not mention the code word (model-dependent; hard evidence is /data/mastra.db surviving the restart)"
  fi
  exit 0
fi

# --- S2 -------------------------------------------------------------------
case "$BASE_URL" in
  https://*)
    request GET "http://${BASE_URL#https://}/health"
    case "$HTTP_CODE" in
      301|302|307|308)
        if grep -qi '^location:[[:space:]]*https://' "$HDR_FILE"; then
          pass "S2 plain HTTP -> HTTP $HTTP_CODE redirect to https"
        else
          fail "S2 plain HTTP got HTTP $HTTP_CODE but Location is not https://"
        fi
        ;;
      *) fail "S2 plain HTTP expected a redirect to https, got HTTP $HTTP_CODE" ;;
    esac
    ;;
  *) skip "S2 BASE_URL is http://, no TLS redirect to check" ;;
esac

# --- S3 -------------------------------------------------------------------
request POST "$BASE_URL/turn" "" '{"conversationId":"smoke-auth","text":"ping"}'
[ "$HTTP_CODE" = "401" ] && pass "S3 POST /turn without token -> 401" \
  || fail "S3 POST /turn without token expected 401, got HTTP $HTTP_CODE"

# --- S4 -------------------------------------------------------------------
request POST "$BASE_URL/turn" "smoke-wrong-token-not-the-real-one" '{"conversationId":"smoke-auth","text":"ping"}'
[ "$HTTP_CODE" = "401" ] && pass "S4 POST /turn with wrong token -> 401" \
  || fail "S4 POST /turn with wrong token expected 401, got HTTP $HTTP_CODE"

# --- S5 -------------------------------------------------------------------
request POST "$BASE_URL/turn" "$DEMO_TOKEN" '{}'
case "$HTTP_CODE" in
  400) pass "S5 POST /turn with token and invalid body -> 400" ;;
  401) fail "S5 got 401 with the supplied token: DEMO_TOKEN does not match the server" ;;
  *) fail "S5 POST /turn with invalid body expected 400, got HTTP $HTTP_CODE" ;;
esac

# --- S6 / S7 ----------------------------------------------------------------
if [ "$NO_LLM" -eq 1 ]; then
  skip "S6 real turn (--no-llm)"
  skip "S7 memory write (--no-llm)"
  exit 0
fi

CONV="smoke-$(date +%s)"

request POST "$BASE_URL/turn" "$DEMO_TOKEN" "$(turn_body "$CONV" "Reply with the single word: pong")"
[ "$HTTP_CODE" = "200" ] || fail "S6 POST /turn expected 200, got HTTP $HTTP_CODE (502 = provider call failed; check fly logs)"
reply="$(json_field replyText)"
model="$(json_field modelId)"
[ -n "$reply" ] || fail "S6 replyText is empty"
[ -n "$model" ] || fail "S6 modelId is empty"
if [ -n "$EXPECT_MODEL" ] && [ "$model" != "$EXPECT_MODEL" ]; then
  fail "S6 modelId is '$model', expected '$EXPECT_MODEL'"
fi
pass "S6 real turn -> 200, replyText non-empty, modelId=$model"

request POST "$BASE_URL/turn" "$DEMO_TOKEN" "$(turn_body "$CONV" "Remember this code word: kumquat. Reply OK.")"
[ "$HTTP_CODE" = "200" ] || fail "S7 memory write expected 200, got HTTP $HTTP_CODE"
pass "S7 memory write -> 200 (conversation $CONV)"

cat <<EOF

All automated checks passed.
S8 (persistence) is manual; run these next:
  fly machine restart --app nemokon-demo
  fly ssh console -C "ls -l /data"     # mastra.db exists, non-zero size, owned by node
  BASE_URL=$BASE_URL DEMO_TOKEN=... scripts/smoke-fly.sh --recall $CONV
Then confirm GET /health is 200 again within the check grace period.
EOF
