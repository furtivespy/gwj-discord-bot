import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTracing } from "./util/tracing.js";
import {
  Client,
  Collection,
  Partials,
  GatewayIntentBits,
  ActivityType,
} from "discord.js";
import BunEnmap from "./db/BunEnmap.js";
import { resolveConfigPath } from "./db/dataDir.js";
import permLevels from "./config.permissionLevels.js";
import {
  resolveDefaults,
  getSettings,
  writeSettings,
} from "./util/settings.js";
import { buildLevelCache, permlevel } from "./util/permissions.js";
import { registerShutdownHandlers } from "./util/gracefulShutdown.js";
import createLogger from "./util/logger.js";
import loadSlashCommands from "./handlers/slashcommands.js";
import loadEvents from "./handlers/events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ quiet: true });
try {
  await startTracing();
} catch (err) {
  console.warn("[tracing] failed to start — continuing without traces:", err);
}

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

function loadJsonConfig(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig(env = process.env) {
  const raw = env.BOT_CONFIG || resolveConfigPath(env);
  if (path.isAbsolute(raw)) {
    return loadJsonConfig(raw);
  }
  try {
    return loadJsonConfig(path.resolve(__dirname, raw));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    return loadJsonConfig(path.resolve(raw));
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

    this.logger = createLogger({
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

  await loadSlashCommands(bot);
  await loadEvents(bot);

  registerShutdownHandlers(bot);

  await bot.login(bot.config.token);
};

if (import.meta.main) {
  init();
}

export { DiscordBot, loadConfig, init };
