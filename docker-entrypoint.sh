#!/bin/sh
# Fly volumes mount root-owned: fix ownership of /data, then drop privileges to "node".
set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=node --regid=node --init-groups "$@"
  elif command -v gosu >/dev/null 2>&1; then
    exec gosu node "$@"
  fi
  echo "docker-entrypoint: neither setpriv nor gosu found; refusing to run as root" >&2
  exit 1
fi

exec "$@"
