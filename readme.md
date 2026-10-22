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

* `DEV_GUILD_ID` (env) or `devGuildId` (config) — register slash commands to this guild instead of globally. Instant updates while developing. If `environment` is `development` and neither is set, Stancy still uses the historical GWJ test guild `545109131330191371` so existing deploys keep working.

## Adding a command or event

Adding a `.js` file under `src/commands/slash` or `src/events` (including subfolders) is the only step to add a feature. The loaders auto-discover files, instantiate the exported class, and log each load.

* Slash commands extend `src/base/SlashCommand.js`, set `this.data` (`SlashCommandBuilder`), and implement `execute`. Optional hooks: `autocomplete`, `button`, `selectMenu`, `modal`.
* Events extend `src/base/Event.js`, set `eventType` from `src/base/EventTypes.js`, and implement `run(...)`.

Buttons, select menus, and modals are routed to the command whose name is the `customId` prefix before `:`. Example: `ping:again` is handled by `/ping`. `/ping` includes a sample **Again** button that proves this path (the same prefix routing a drop "In" button will use).

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

* Volume mounted at `/data`
* `BOT_CONFIG` (defaults to `/data/config.json` in the image) — put `config.json` on that volume
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


#### Come [join us on discord](https://discord.com/invite/HfYNSdP)!
