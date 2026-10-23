import { guildFromInteraction } from "./settings.js";

function buildLevelCache(permLevels) {
  const cache = {};
  for (const level of permLevels) {
    cache[level.name] = level.level;
  }
  return cache;
}

function permissionContext(interaction, settings) {
  return {
    guild: guildFromInteraction(interaction),
    member: interaction.member,
    author: interaction.user,
    user: interaction.user,
    channel: interaction.channel,
    client: interaction.client,
    settings,
  };
}

function permlevel(permLevels, context) {
  let permlvl = 0;
  const permOrder = permLevels.slice().sort((p, c) => (p.level < c.level ? 1 : -1));
  for (const currentLevel of permOrder) {
    if (currentLevel.guildOnly && !context.guild) continue;
    if (currentLevel.check(context)) {
      return currentLevel.level;
    }
  }
  return permlvl;
}

function commandPermLevelName(command) {
  return command?.conf?.permLevel || "User";
}

function commandRequiredLevel(levelCache, command) {
  const name = commandPermLevelName(command);
  if (!levelCache) return 0;
  if (Object.prototype.hasOwnProperty.call(levelCache, name)) {
    return levelCache[name];
  }
  // Unknown names must not collapse to User (allow everyone).
  return Number.POSITIVE_INFINITY;
}

function levelName(permLevels, level) {
  return permLevels.find((entry) => entry.level === level)?.name || "User";
}

function permissionDeniedMessage(permLevels, level, required, requiredName) {
  return `You do not have permission to use this command.
Your permission level is ${level} (${levelName(permLevels, level)})
This command requires level ${required} (${requiredName})`;
}

function isEnabledFlag(raw, defaultValue = true) {
  if (raw == null || raw === "") return defaultValue;
  if (raw === true || raw === false) return raw;
  const normalized = String(raw).trim().toLowerCase();
  if (["false", "off", "0", "no"].includes(normalized)) return false;
  if (["true", "on", "1", "yes"].includes(normalized)) return true;
  return defaultValue;
}

function shouldSendPermissionNotice(settings) {
  return isEnabledFlag(settings?.systemNotice, true);
}

function checkCommandPermission({
  permLevels,
  levelCache,
  context,
  command,
}) {
  const requiredName = commandPermLevelName(command);
  const required = commandRequiredLevel(levelCache, command);
  const level = permlevel(permLevels, context);
  return {
    allowed: level >= required,
    level,
    required,
    requiredName,
    levelName: levelName(permLevels, level),
    message: permissionDeniedMessage(permLevels, level, required, requiredName),
  };
}

export {
  buildLevelCache,
  permissionContext,
  permlevel,
  commandPermLevelName,
  commandRequiredLevel,
  levelName,
  permissionDeniedMessage,
  isEnabledFlag,
  shouldSendPermissionNotice,
  checkCommandPermission,
};
