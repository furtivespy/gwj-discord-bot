require("dotenv").config();
const path = require("path");
const { startTracing } = require("./util/tracing");
try {
  startTracing();
} catch (err) {
  console.warn("[tracing] failed to start — continuing without traces:", err);
}
const {
  Client,
  Collection,
  Partials,
  GatewayIntentBits,
  ActivityType,
} = require("discord.js");
const BunEnmap = require("./db/BunEnmap.js");
const { resolveConfigPath } = require("./db/dataDir.js");
const permLevels = require("./config.permissionLevels.js");
const {
  DEFAULT_SETTINGS,
  resolveDefaults,
  getSettings,
  writeSettings,
} = require("./util/settings.js");
const { buildLevelCache, permlevel } = require("./util/permissions.js");
const { registerShutdownHandlers } = require("./util/gracefulShutdown.js");

const partials = [Partials.Guild];
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  // Drop GuildVoiceStates if you delete the on-demand voice command/event.
  GatewayIntentBits.GuildVoiceStates,
];
const presence = {
  status: "online",
  activities: [{
    name: "with Slash Commands",
    type: ActivityType.Playing,
  }],
};

function loadConfig(env = process.env) {
  const raw = env.BOT_CONFIG || resolveConfigPath(env);
  if (path.isAbsolute(raw)) {
    return require(raw);
  }
  try {
    return require(raw);
  } catch (error) {
    return require(path.resolve(raw));
  }
}

class DiscordBot extends Client {
  constructor(options = {}) {
    const { config, dataDir, ...clientOptions } = options;
    super(clientOptions);
    this.config = config || loadConfig();
    this.config.defaultSettings = resolveDefaults(this.config.defaultSettings);

    this.permLevels = permLevels;
    this.levelCache = buildLevelCache(this.permLevels);

    this.settings = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir,
    });
    this.dataStores = [this.settings];
    this.settings.ensure("default", this.config.defaultSettings);

    this.logger = require("./util/logger.js")({
      apiKey: this.config.bugsnagKey,
      releaseStage: this.config.environment,
    });

    this.slash_commands = new Collection();
    this.events = new Collection();
  }

  permlevel(context) {
    return permlevel(this.permLevels, context);
  }

  getSettings(guild) {
    return getSettings(this.settings, this.config.defaultSettings, guild);
  }

  writeSettings(id, newSettings) {
    return writeSettings(this.settings, id, newSettings);
  }
}

const init = async () => {
  console.log("Starting bot now...");

  const bot = new DiscordBot({
    partials,
    intents,
    presence,
  });
  bot.logger.info("Starting Bot", "bot.js");

  require("./handlers/slashcommands.js")(bot);
  require("./handlers/events.js")(bot);

  registerShutdownHandlers(bot);

  bot.login(bot.config.token);
};

if (require.main === module) {
  init();
}

module.exports = { DiscordBot, loadConfig, init };
