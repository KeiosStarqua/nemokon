# syntax=docker/dockerfile:1
# Image for the NemoKon demo on Fly.io (see docs/plans/fly-deploy.md).
# Build context = repo root. No secrets are baked in: NEBIUS_API_KEY, DEMO_TOKEN and
# TAVILY_API_KEY arrive at runtime (Fly secrets).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# --- deps: production dependencies of the demo and the workspace packages it uses ---------------
FROM base AS deps
WORKDIR /app
# Manifests first for layer caching. @nemokon/sandbox is not a dependency of the demo: skipped.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/demo/package.json apps/demo/
COPY packages/agent/package.json packages/agent/
COPY packages/channel/package.json packages/channel/
COPY packages/contracts/package.json packages/contracts/
COPY packages/memory/package.json packages/memory/
COPY packages/tools/package.json packages/tools/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@nemokon/demo..." --store-dir /pnpm/store

# --- runtime ---------------------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/ /app/

# NO `pnpm build` here, on purpose: every workspace package exports `src/index.ts` (only
# publishConfig swaps to dist), so the run path is the TypeScript source loaded through tsx
# (a production dependency of apps/demo). Do not add turbo/tsdown or "fix" this to run dist.
COPY tsconfig.base.json ./
COPY apps/demo/tsconfig.json apps/demo/
COPY apps/demo/src apps/demo/src
COPY packages/agent/tsconfig.json packages/agent/
COPY packages/agent/src packages/agent/src
COPY packages/channel/tsconfig.json packages/channel/
COPY packages/channel/src packages/channel/src
COPY packages/contracts/tsconfig.json packages/contracts/
COPY packages/contracts/src packages/contracts/src
COPY packages/memory/tsconfig.json packages/memory/
COPY packages/memory/src packages/memory/src
COPY packages/tools/tsconfig.json packages/tools/
COPY packages/tools/src packages/tools/src

# Layout must stay /app/apps/demo/src: REPO_ROOT resolves to /app for prompts/ and data/sample/.
COPY config.fly.yaml ./
COPY prompts prompts
COPY data/sample data/sample

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/demo
EXPOSE 8787
# Starts as root only to chown the /data volume, then drops to user "node" (uid 1000).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/index.ts"]
