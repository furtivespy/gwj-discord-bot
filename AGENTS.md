# Agent Guidance

## Linear

This repo's Linear project is **Stancy Bot** (team **Furtivespy**, key `FUR`).

- **Project name:** Stancy Bot
- **Project ID:** `3753e936-d2b7-4323-bd48-161f9938fca4`
- **URL:** https://linear.app/furtivespy/project/stancy-bot-01888a9ecfbd

When the user mentions Linear, issues, or project tracking for this codebase, scope work to the Stancy Bot project unless they say otherwise.

## Layout

Bun + discord.js v14, ES modules (`"type": "module"`). Entry point is `src/bot.js`. Adding a `.js` file under `src/commands/slash` or `src/events` (including subfolders) is enough to load it. Command and event files should `export default` the class.

| Path | Role |
| --- | --- |
| `src/bot.js` | Client, config, settings store, loaders, login |
| `src/base/SlashCommand.js` | Slash command base (`data`, `execute`, optional `autocomplete` / `button` / `selectMenu` / `modal`) |
| `src/base/Event.js` | Event base (`eventType`, `run`) |
| `src/base/EventTypes.js` | Discord event name constants |
| `src/commands/slash/` | Auto-discovered slash commands |
| `src/events/` | Auto-discovered events (`ready.js` binds `clientReady`, `interactionCreate`, optional `voiceStateUpdate`) |
| `src/handlers/` | File discovery, slash load/register, event bind, interaction router |
| `src/db/` | `BunEnmap` SQLite store and `dataDir` resolution |
| `src/util/` | Logger, tracing, settings, permissions, shutdown, on-demand voice helpers |
| `config.json.sample` | Token, client id, Bugsnag, environment, guild defaults |
| `.env.example` | Every process env var the code reads |

Slash commands in this repo: `/ping` (User), `/status` (User), `/settings` (Administrator), `/voice-create` (User, sample — see below). Buttons/selects/modals route to the command whose name is the `customId` prefix before `:`.

Permission ladder: User, Moderator, Administrator, Server Owner, Bot Owner. Role names come from guild settings (`modRole`, `adminRole`).

## Voice feature isolation

On-demand voice is a sample feature, not core:

- `src/commands/slash/voiceCreate.js` (`/voice-create`)
- `src/events/voiceStateUpdate.js` (delete empty on-demand channels)
- `src/util/onDemandVoice.js` (imported only by those two files)

Do not import those modules from anything else in `src/`. A clone that deletes the command and the event must still load, register `/ping` `/status` `/settings`, and pass `bun test`. Delete both files together, then optionally `onDemandVoice.js`. You may also drop `GatewayIntentBits.GuildVoiceStates` from `src/bot.js`. Clones that keep voice should create an `on-demand voice` category (or change `FALLBACK_PARENT_ID`).

## Settings / SQLite

Guild overrides live in `{dataDir}/settings.sqlite` (`./data` locally, `/data` in the container).

- Do not change data scope (for example guild-scoped settings to bot-wide) without an explicit migration path.
- Preserve old records as backups unless deletion is explicitly approved.
- Migration defaults must not silently overwrite or delete scoped records.
- Keep migration work out of normal command paths. Commands should read only their final storage location.

## Pull request scope

- Do not add product behavior beyond an approved design without first getting confirmation.
- Keep required storage migrations separate from optional UX or behavior changes.
- Prefer tests that do not need a Discord token (`bun test`). Loaders, the interaction router, settings, and commands should stay unit-testable.

## Conventions

- Runtime is **Bun 1.4.3** (`packageManager` in `package.json`). Do not switch to Node or npm without an explicit ask.
- `bunfig.toml` sets `install.minimumReleaseAge = 172800` (48 hours) so `bun install` / `bun update` skip npm versions published more recently than that.
- Config is JSON (`BOT_CONFIG` / `config.json.sample`), not `config.js`. Token, `clientId`, and `bugsnagKey` are config keys, not env vars.
- `DEV_GUILD_ID` (env) or `devGuildId` (config) registers guild-scoped slash commands. If neither is set, commands register globally (development logs a warning). Do not bake a guild id into source.
- Logger is console-only unless `bugsnagKey` is a real key (not blank / `abc123`). Tracing is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- SIGTERM/SIGINT close SQLite stores, then flush traces when tracing is enabled. Tracing must not install its own signal handlers.
