import path from "node:path";
import { fileURLToPath } from "node:url";
import { Collection, REST, Routes } from "discord.js";
import { listJsFiles, instantiate, importJsFile } from "./discover.js";

const DEFAULT_COMMANDS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../commands/slash"
);

function resolveDevGuildId(config = {}, env = process.env) {
  const fromEnv = typeof env.DEV_GUILD_ID === "string" ? env.DEV_GUILD_ID.trim() : "";
  if (fromEnv) return fromEnv;
  const fromConfig =
    typeof config.devGuildId === "string" ? config.devGuildId.trim() : "";
  if (fromConfig) return fromConfig;
  return null;
}

async function loadSlashCommands(botClient, options = {}) {
  botClient.logger?.info("Loading Slash Commands", "slashcommands.js");
  if (!botClient.slash_commands) {
    botClient.slash_commands = new Collection();
  }

  const slashCommandsPath = options.commandsPath || DEFAULT_COMMANDS_PATH;
  const loaded = [];

  for (const file of listJsFiles(slashCommandsPath)) {
    try {
      const command = instantiate(await importJsFile(file), botClient);
      const name = command.help?.name || command.data?.name || path.basename(file, ".js");
      botClient.logger?.info(`Loading Slash Command: ${name}. 👌`, "slashcommands.js");
      if (command.conf && command.conf.enabled === false) continue;
      if (!command.data) {
        throw new Error(`Slash command ${name} is missing data`);
      }
      botClient.slash_commands.set(command.data.name, command);
      loaded.push(command);
    } catch (err) {
      botClient.logger?.error(err, "slashcommands.js");
    }
  }

  return loaded;
}

async function registerSlashCommands(botClient, commands, options = {}) {
  const token = botClient.config?.token;
  const clientId = botClient.config?.clientId;
  if (!token || !clientId) {
    throw new Error("Cannot register slash commands without config.token and config.clientId");
  }

  const payload = commands.map((command) => command.data.toJSON());
  const rest = options.rest || new REST({ version: "10" }).setToken(token);
  const guildId = resolveDevGuildId(botClient.config, options.env || process.env);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
    botClient.logger?.info(
      `Successfully registered commands in Development (guild ${guildId})`,
      "slashcommands.js"
    );
    return { scope: "guild", guildId, count: payload.length };
  }

  if (botClient.config?.environment === "development") {
    botClient.logger?.warn(
      "No DEV_GUILD_ID or config.devGuildId — registering slash commands globally (can take up to an hour). Set DEV_GUILD_ID to your test guild for instant updates.",
      "slashcommands.js"
    );
  }

  await rest.put(Routes.applicationCommands(clientId), { body: payload });
  botClient.logger?.info("Successfully registered commands in Production", "slashcommands.js");
  return { scope: "global", count: payload.length };
}

async function loadAndMaybeRegister(botClient, options = {}) {
  const commands = await loadSlashCommands(botClient, options);
  const shouldRegister =
    options.register !== false && Boolean(botClient.config?.token);
  if (shouldRegister) {
    registerSlashCommands(botClient, commands, options).catch((error) =>
      botClient.logger?.error(error, "slashcommands.js")
    );
  }
  return commands;
}

loadAndMaybeRegister.loadSlashCommands = loadSlashCommands;
loadAndMaybeRegister.registerSlashCommands = registerSlashCommands;
loadAndMaybeRegister.resolveDevGuildId = resolveDevGuildId;

export { loadSlashCommands, registerSlashCommands, resolveDevGuildId };
export default loadAndMaybeRegister;
