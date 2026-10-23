# syntax = docker/dockerfile:1

ARG BUN_VERSION=1.4.3
FROM oven/bun:${BUN_VERSION} AS base

WORKDIR /app

ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install dependencies
COPY --link package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production

# Copy application code
COPY --link . .


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Config and SQLite settings live on a separate volume (same /data mount as the old Fly app)
RUN mkdir -p /data
VOLUME /data

EXPOSE 3000
ENV BOT_CONFIG="/data/config.json"
ENV IS_IN_CONTAINER="true"
CMD [ "bun", "run", "start" ]
