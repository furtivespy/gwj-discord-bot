Stancy Bot - A Voice Channel Creation Bot for Gamers With Jobs
=================

## I created this bot for 2 reasons:

1) Our original bot has gone offline and I wanted a replacement
2) To create a decent base template for a discord.js v14 bot

## Local development

* Copy `config.json.sample` to `config.json` and edit the values to your secrets
* Copy `.env.example` to `.env` and set `BOT_CONFIG` to the path of that config file
* Install [Bun](https://bun.sh) 1.3.14 (see `packageManager` in `package.json`)
* Install package dependencies: `bun install`
* Run the bot: `bun run start`
* Run tests: `bun test`

Required config keys: `token`, `clientId`, `environment`.

Every process env var the code reads is listed in `.env.example`.

Optional:

* `bugsnagKey` (config) — when set, `error` logs are reported to Bugsnag. When unset, blank, or the `config.json.sample` placeholder `abc123`, the logger stays on the console only (Game Bot's `BugsnagLogger` with a console fallback).
* `defaultSettings` — per-server defaults (`modRole`, `adminRole`, `systemNotice`) merged with guild overrides stored in SQLite
* `botOwnerId` — Discord user id treated as Bot Owner for permission checks. If unset, the Discord application owner (fetched on ready) is used.
* `STANCY_DATA_DIR` (env) — local directory for SQLite files (defaults to `./data`). In a container this is always `/data`.
* `DEV_GUILD_ID` (env) or `devGuildId` (config) — register slash commands to this guild instead of globally. Instant updates while developing. If `environment` is `development` and neither is set, Stancy still uses the historical GWJ test guild `545109131330191371` so existing deploys keep working.
* `OTEL_EXPORTER_OTLP_ENDPOINT` (env) — optional OpenTelemetry. Tracing is off unless this endpoint is set. Same shape as Game Bot's `tracing.js`, but gated on an OTLP URL instead of a Honeycomb API key.
* `OTEL_SERVICE_NAME` (env) — defaults to `stancy-bot` (passed into the OpenTelemetry SDK as the service name / resource, not only logged). SIGTERM/SIGINT close SQLite stores, then flush traces when tracing is enabled, then exit. Tracing does not install its own signal handlers, so store close always owns process lifetime.
* `OTEL_EXPORTER_OTLP_HEADERS` (env) — comma-separated `key=value` headers for the exporter (for Honeycomb: `x-honeycomb-team=YOUR_API_KEY` and endpoint `https://api.honeycomb.io/v1/traces`).
* `OTEL_DEBUG_SPANS` (env) — set to `true` to also print spans to the console.

## Adding a command or event

Adding a `.js` file under `src/commands/slash` or `src/events` (including subfolders) is the only step to add a feature. The loaders auto-discover files, instantiate the exported class, and log each load.

* Slash commands extend `src/base/SlashCommand.js`, set `this.data` (`SlashCommandBuilder`), and implement `execute`. Optional hooks: `autocomplete`, `button`, `selectMenu`, `modal`.
* Events extend `src/base/Event.js`, set `eventType` from `src/base/EventTypes.js`, and implement `run(...)`.

Buttons, select menus, and modals are routed to the command whose name is the `customId` prefix before `:`. Example: `ping:again` is handled by `/ping`. `/ping` includes a sample **Again** button that proves this path (the same prefix routing a drop "In" button will use).

Slash commands declare `permLevel` (User, Moderator, Administrator, Server Owner, Bot Owner). The interaction router compares that to the member's highest matching level (mod/admin role names come from guild settings). A non-mod cannot run a Moderator command.

`/settings` (Administrator) views and sets those guild keys. Overrides are stored in `{dataDir}/settings.sqlite` so they survive a container restart. `data/` is gitignored. SIGTERM/SIGINT close the SQLite handles (WAL checkpoint) before exit.

## Start a new bot from Stancy

Stancy is a starter template. The on-demand voice feature is self-contained: delete one command and one event and the rest of the bot still answers `/ping`, `/status`, and `/settings`.

1. **Copy the repo.** Clone or fork it.

   ```
   git clone https://github.com/furtivespy/gwj-discord-bot.git my-new-bot
   cd my-new-bot
   ```

2. **Rename it.** Update at least:

   * `package.json` — `name` and `description`
   * `src/util/tracing.js` — `DEFAULT_SERVICE_NAME` (and `OTEL_SERVICE_NAME` in `.env`)
   * `.github/workflows/_docker-build-push.yml` — `IMAGE_NAME`
   * `AGENTS.md` — Linear project name / id / URL for the new bot
   * This README — image name and deploy examples
   * `src/handlers/slashcommands.js` — `DEFAULT_DEV_GUILD_ID` (or always set `DEV_GUILD_ID` / `devGuildId`)

3. **Remove voice** (skip this if you want on-demand voice channels):

   ```
   rm src/commands/slash/voiceCreate.js src/events/voiceStateUpdate.js
   ```

   Delete **both** files. Leaving one without the other either never cleans empty channels or never creates them. Then optionally:

   ```
   rm src/util/onDemandVoice.js
   ```

   Delete the util only after the command and event. You can also drop `GatewayIntentBits.GuildVoiceStates` from the `intents` list in `src/bot.js`. Loaders auto-discover files, so nothing else in `src/` imports those modules.

   If you **keep** voice, create a Discord category named `on-demand voice`. Otherwise `/voice-create` falls back to a GWJ category snowflake in `FALLBACK_PARENT_ID` (`src/util/onDemandVoice.js`) that will not exist in your server — change or remove that constant.

4. **Set env and config.**

   ```
   cp config.json.sample config.json
   cp .env.example .env
   ```

   In `config.json` set `token`, `clientId`, and `environment`. Optional: `bugsnagKey`, `botOwnerId`, `defaultSettings`.

   In `.env` set `BOT_CONFIG` to that config file (`../config.json` from `src/bot.js`, i.e. the file next to `package.json`). Set `DEV_GUILD_ID` to **your** test guild. If `environment` is `development` and you leave `DEV_GUILD_ID` / `devGuildId` unset, commands still register to the historical GWJ guild `545109131330191371` — change `DEFAULT_DEV_GUILD_ID` in `src/handlers/slashcommands.js` or set `environment` to `production` for global registration.

5. **Install, test, register commands.**

   ```
   bun install
   bun test
   bun run start
   ```

   Starting the bot registers slash commands. They are guild-scoped when `DEV_GUILD_ID` or `devGuildId` is set, **or** when `environment` is `development` (that path uses `DEFAULT_DEV_GUILD_ID` unless you override it). They register globally only when `environment` is not `development` and no guild id is set. Confirm `/ping`, `/status`, and `/settings` appear in Discord.

6. **Deploy the container.** Put `config.json` on a volume mounted at `/data` (see **Container deploy** below). Build and push via GitHub Actions (`REGISTRY_USERNAME` / `REGISTRY_TOKEN` secrets) or:

   ```
   docker build -t your-registry/your-bot:latest .
   docker run -d --name your-bot \
     --restart unless-stopped \
     -v /path/to/your-bot-data:/data \
     -e BOT_CONFIG=/data/config.json \
     your-registry/your-bot:latest
   ```

Coding agents: see `AGENTS.md` for layout, Linear project, and conventions.

## Container deploy

Stancy is built with Bun and published to Will's registry as **`gitea.willsullivan.dev/furtivespy/stancy-bot`**.

GitHub Actions (same shape as Game Bot):

* `test.yml` — `bun test` on every push and pull request
* `build-push.yml` — build and push a commit-SHA tag on every push
* `release.yml` — on merge to `main`, semver-tag and push `vX.Y.Z` + `latest`

This repo needs these GitHub secrets (same names as Game Bot):

* `REGISTRY_USERNAME`
* `REGISTRY_TOKEN`

The image expects the same runtime config as the old Fly app:

* Volume mounted at `/data` (config **and** SQLite settings)
* `BOT_CONFIG` (defaults to `/data/config.json` in the image) — put `config.json` on that volume
* `IS_IN_CONTAINER=true` (set in the image) — SQLite files go on `/data` so they survive restarts
* Optional `DEV_GUILD_ID` — guild-scoped slash command registration (see above)
* Optional `bugsnagKey` in that config file — errors go to Bugsnag when set
* Optional `OTEL_EXPORTER_OTLP_ENDPOINT` (and the other `OTEL_*` vars above) — tracing stays off when unset
* No new required environment variables

Example:

```
docker run -d --name stancy-bot \
  --restart unless-stopped \
  -v /path/to/stancy-data:/data \
  -e BOT_CONFIG=/data/config.json \
  gitea.willsullivan.dev/furtivespy/stancy-bot:latest
```

## What the bot does so far:

* `/voice-create` - creates a voice channel in a sub-category called "on-demand voice"
* Watches voiceStateUpdate event to see if channel in that "on-demand voice" category is empty
* `/ping` - replies with Pong and an **Again** button (proves component routing)
* `/status` - uptime, package version, and server count
* `/settings` - administrators view or set `modRole`, `adminRole`, and `systemNotice` per server


#### Come [join us on discord](https://discord.com/invite/HfYNSdP)!
