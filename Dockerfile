# syntax=docker/dockerfile:1
# Build configuration: 
# - For public npm (default): just run `podman build -t <image> .`
# - For custom npm registry:
#   1. Copy .npmrc.template to .npmrc
#   2. Fill in your registry URL and credentials
#   3. Run `podman build -t <image> .`
# 
# The .npmrc will be used during build and is not included in the final image.

FROM node:26-alpine AS deps
WORKDIR /app
# Node 25+ no longer bundles Corepack, so install it before enabling. Corepack
# then uses the pnpm version pinned by package.json's "packageManager" field.

# Conditionally copy .npmrc if it exists in build context
# npm looks for .npmrc in the user's home directory (~/.npmrc)
COPY .npmrc* /root/

RUN npm install -g corepack@latest && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Configure npm from .npmrc, then pre-install the package.json-pinned pnpm
# version to avoid Corepack download issues with some private registries.
RUN sh -c 'if [ -f /root/.npmrc ]; then \
      registry=$(grep "^registry=" /root/.npmrc | cut -d"=" -f2) && \
      token=$(grep "^//" /root/.npmrc | grep "_authToken=" | cut -d"=" -f2) && \
      registry_host=$(echo "$registry" | sed "s|https://||;s|/$||") && \
      pnpm_version=$(node -p "require(\"./package.json\").packageManager.split(\"@\")[1]") && \
      npm config set registry "$registry" && \
      npm config set "//$registry_host:_authToken" "$token" && \
      echo "Using custom registry: $registry" && \
      npm install -g --force pnpm@$pnpm_version; \
    else \
      echo "Using default public registry"; \
    fi' && \
    pnpm install --frozen-lockfile

FROM node:26-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Copy entire /usr/local from deps to get pnpm with all dependencies
COPY --from=deps /usr/local /usr/local
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:26-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Next.js standalone output: a self-contained server plus static assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# scripts/migrate.mjs and scripts/break-glass.mjs are plain Node scripts, not
# part of the app's own import graph, so standalone's output tracing doesn't
# pick them up on its own -- copy them (and migrate.mjs's .sql files)
# explicitly so `docker run <image> node scripts/migrate.mjs` works without a
# full checkout. Both only need the `pg` package, already traced into
# node_modules above because the app itself imports it (lib/db/client.ts).
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/scripts/break-glass.mjs ./scripts/break-glass.mjs
COPY --from=build /app/lib/db/migrations ./lib/db/migrations
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1
CMD ["node", "server.js"]
