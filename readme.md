Stancy Bot - A Voice Channel Creation Bot for Gamers With Jobs
=================

## I created this bot for 2 reasons:

1) Our original bot has gone offline and I wanted a replacement
2) To create a decent base template for a discord.js v14 bot

## Local development

* Rename `config.json.sample` to `config.json` and edit the values to your secrets
* Rename `.env.sample` to `.env` and set `BOT_CONFIG` to the path of that config file
* Install [Bun](https://bun.sh) 1.3.14 (see `packageManager` in `package.json`)
* Install package dependencies: `bun install`
* Run the bot: `bun run start`
* Run tests: `bun test`

Required config keys (same as today): `token`, `clientId`, `bugsnagKey`, `environment`.

Optional:

* `defaultSettings` — per-server defaults (`modRole`, `adminRole`, `systemNotice`) merged with guild overrides stored in SQLite
* `botOwnerId` — Discord user id treated as Bot Owner for permission checks. If unset, the Discord application owner (fetched on ready) is used.
* `STANCY_DATA_DIR` (env) — local directory for SQLite files (defaults to `./data`). In a container this is always `/data`.
* `DEV_GUILD_ID` (env) or `devGuildId` (config) — register slash commands to this guild instead of globally. Instant updates while developing. If `environment` is `development` and neither is set, Stancy still uses the historical GWJ test guild `545109131330191371` so existing deploys keep working.

## Adding a command or event

Adding a `.js` file under `src/commands/slash` or `src/events` (including subfolders) is the only step to add a feature. The loaders auto-discover files, instantiate the exported class, and log each load.

* Slash commands extend `src/base/SlashCommand.js`, set `this.data` (`SlashCommandBuilder`), and implement `execute`. Optional hooks: `autocomplete`, `button`, `selectMenu`, `modal`.
* Events extend `src/base/Event.js`, set `eventType` from `src/base/EventTypes.js`, and implement `run(...)`.

Buttons, select menus, and modals are routed to the command whose name is the `customId` prefix before `:`. Example: `ping:again` is handled by `/ping`. `/ping` includes a sample **Again** button that proves this path (the same prefix routing a drop "In" button will use).

Slash commands declare `permLevel` (User, Moderator, Administrator, Server Owner, Bot Owner). The interaction router compares that to the member's highest matching level (mod/admin role names come from guild settings). A non-mod cannot run a Moderator command.

`/settings` (Administrator) views and sets those guild keys. Overrides are stored in `{dataDir}/settings.sqlite` so they survive a container restart. `data/` is gitignored. SIGTERM/SIGINT close the SQLite handles (WAL checkpoint) before exit.

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
* `/settings` - administrators view or set `modRole`, `adminRole`, and `systemNotice` per server


#### Come [join us on discord](https://discord.com/invite/HfYNSdP)!
