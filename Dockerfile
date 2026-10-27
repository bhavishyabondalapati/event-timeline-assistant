# Multi-stage build: stage 1 has the compiler and dev tools, stage 2 only what's needed to run.
# The final image is smaller and has fewer things that could be attacked.

# ---- Stage 1: build ----
FROM node:22-slim AS build
WORKDIR /app
# Tools to compile better-sqlite3's native code, in case no prebuilt binary matches this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
# Copy package files first: Docker caches this layer, so `npm ci` only re-runs when dependencies change.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY data ./data
# Compile TypeScript -> dist/, build events.db from the SIMULATED seed file, then drop dev dependencies.
RUN npm run build && DB_PATH=events.db node dist/seed.js && npm prune --omit=dev

# ---- Stage 2: run ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/events.db
COPY package.json ./
COPY public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/events.db ./events.db
# Don't run as root inside the container. The "node" user comes with the official image.
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
