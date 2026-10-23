import { MessageFlags } from "discord.js";
import {
  checkCommandPermission,
  permissionContext,
  shouldSendPermissionNotice,
} from "../util/permissions.js";
import { guildFromInteraction } from "../util/settings.js";

const COMMAND_ERROR = "There was an error while executing this command!";
const BUTTON_ERROR = "There was an error while processing this button!";
const SELECT_ERROR = "There was an error while processing this select menu!";
const MODAL_ERROR = "There was an error while processing this modal!";

function isSelectMenu(interaction) {
  if (typeof interaction.isAnySelectMenu === "function") {
    return interaction.isAnySelectMenu();
  }
  return Boolean(
    interaction.isStringSelectMenu?.() ||
      interaction.isUserSelectMenu?.() ||
      interaction.isRoleSelectMenu?.() ||
      interaction.isMentionableSelectMenu?.() ||
      interaction.isChannelSelectMenu?.()
  );
}

function commandNameFromCustomId(customId) {
  if (typeof customId !== "string" || customId.length === 0) return null;
  const colon = customId.indexOf(":");
  return colon === -1 ? customId : customId.slice(0, colon);
}

function findCommandByCustomId(commands, customId) {
  if (!commands || typeof customId !== "string") return null;
  const prefix = commandNameFromCustomId(customId);
  if (prefix && typeof commands.get === "function") {
    const exact = commands.get(prefix);
    if (exact) return exact;
  }

  let match = null;
  let matchLength = -1;
  const entries =
    typeof commands.entries === "function" ? commands.entries() : Object.entries(commands);
  for (const [name, command] of entries) {
    if (customId === name || customId.startsWith(`${name}:`)) {
      if (name.length > matchLength) {
        match = command;
        matchLength = name.length;
      }
    }
  }
  return match;
}

function interactionKind(interaction) {
  if (interaction.isAutocomplete?.()) return "autocomplete";
  if (interaction.isCommand?.() || interaction.isChatInputCommand?.()) return "command";
  if (interaction.isButton?.()) return "button";
  if (isSelectMenu(interaction)) return "selectMenu";
  if (interaction.isModalSubmit?.()) return "modal";
  return null;
}

function resolveCommand(client, interaction, kind) {
  const commands = client.slash_commands;
  if (!commands) return null;
  if (kind === "command" || kind === "autocomplete") {
    return commands.get(interaction.commandName) || null;
  }
  return findCommandByCustomId(commands, interaction.customId);
}

function timingLabel(interaction, kind) {
  if (kind === "command" || kind === "autocomplete") {
    const subcommand = interaction.options?.getSubcommand?.(false);
    const name = subcommand
      ? `${interaction.commandName} ${subcommand}`
      : interaction.commandName;
    const prefix = kind === "autocomplete" ? "Autocomplete" : "Slash";
    return `${prefix} /${name}`;
  }
  const prefix =
    kind === "button" ? "Button" : kind === "selectMenu" ? "Select" : "Modal";
  return `${prefix} ${interaction.customId}`;
}

function errorContent(kind) {
  switch (kind) {
    case "button":
      return BUTTON_ERROR;
    case "selectMenu":
      return SELECT_ERROR;
    case "modal":
      return MODAL_ERROR;
    default:
      return COMMAND_ERROR;
  }
}

async function sendErrorReply(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content });
  }
  return interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}

function attachSettings(client, interaction) {
  if (typeof client.getSettings !== "function") return null;
  const settings = client.getSettings(guildFromInteraction(interaction));
  interaction.settings = settings;
  return settings;
}

function evaluatePermission(client, interaction, command) {
  if (!client.permLevels || !client.levelCache) {
    return { allowed: true };
  }
  const settings = interaction.settings || attachSettings(client, interaction) || {};
  const context = permissionContext(interaction, settings);
  context.client = client;
  return checkCommandPermission({
    permLevels: client.permLevels,
    levelCache: client.levelCache,
    context,
    command,
  });
}

async function denyPermission(interaction, kind, permission) {
  if (kind === "autocomplete") {
    if (typeof interaction.respond === "function") {
      await interaction.respond([]);
    }
    return;
  }
  if (shouldSendPermissionNotice(interaction.settings)) {
    await sendErrorReply(interaction, permission.message);
    return;
  }
  // systemNotice "false" suppresses the denial text, but Discord still needs
  // an ack within 3s or it shows "This interaction failed". Defer then delete
  // so the user does not sit on "Bot is thinking…" for 15 minutes.
  if (interaction.deferred || interaction.replied) return;
  if (typeof interaction.deferReply !== "function") return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (typeof interaction.deleteReply === "function") {
    try {
      await interaction.deleteReply();
    } catch {
      // Already acked; leaving the deferred reply is better than an error edit.
    }
  }
}

async function dispatch(command, interaction, kind) {
  if (kind === "autocomplete") {
    const handler = command.autocomplete || command.execute;
    return handler.call(command, interaction);
  }
  if (kind === "button") return command.button?.(interaction);
  if (kind === "selectMenu") return command.selectMenu?.(interaction);
  if (kind === "modal") return command.modal?.(interaction);
  return command.execute(interaction);
}

function logTiming(client, line) {
  if (typeof client.logger?.time === "function") {
    client.logger.time(line);
  } else if (typeof client.logger?.log === "function") {
    client.logger.log(line, "time");
  }
}

async function routeInteraction(client, interaction) {
  const kind = interactionKind(interaction);
  if (!kind) return { handled: false };

  const command = resolveCommand(client, interaction, kind);
  if (!command) return { handled: false };

  attachSettings(client, interaction);

  const startedAt = Date.now();
  const inboundMs = startedAt - (interaction.createdTimestamp || startedAt);
  const label = timingLabel(interaction, kind);

  try {
    const permission = evaluatePermission(client, interaction, command);
    if (!permission.allowed) {
      await denyPermission(interaction, kind, permission);
      return { handled: true, denied: true, command, permission };
    }

    await dispatch(command, interaction, kind);
    return { handled: true, command };
  } catch (error) {
    client.logger?.error(error, "interactionCreate");
    try {
      await sendErrorReply(interaction, errorContent(kind));
    } catch (replyError) {
      client.logger?.error(replyError, "interactionCreate");
    }
    return { handled: true, error, command };
  } finally {
    const durationMs = Date.now() - startedAt;
    logTiming(client, `${label} | inbound ${inboundMs}ms | handler ${durationMs}ms`);
  }
}

export {
  routeInteraction,
  findCommandByCustomId,
  commandNameFromCustomId,
  interactionKind,
  evaluatePermission,
  COMMAND_ERROR,
  BUTTON_ERROR,
  SELECT_ERROR,
  MODAL_ERROR,
};
