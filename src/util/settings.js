const DEFAULT_SETTINGS = {
  modRole: "Moderator",
  adminRole: "Administrator",
  systemNotice: "true",
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function resolveDefaults(defaultSettings = DEFAULT_SETTINGS) {
  return { ...DEFAULT_SETTINGS, ...(defaultSettings || {}) };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveGuildId(guild) {
  if (guild == null || guild === "") return null;
  if (typeof guild === "object") {
    const id = guild.id ?? guild.guildId;
    return id ? String(id) : null;
  }
  return String(guild);
}

function guildFromInteraction(interaction) {
  if (!interaction) return null;
  if (interaction.guild?.id) return interaction.guild;
  const id = resolveGuildId(interaction.guildId);
  return id ? { id } : null;
}

function storedObject(store, key) {
  const value = store.get(key);
  return isPlainObject(value) ? value : null;
}

function storedDefaults(store, defaultSettings) {
  const fallback = resolveDefaults(defaultSettings);
  const existing = storedObject(store, "default");
  if (!existing) {
    store.set("default", fallback);
    return fallback;
  }
  return { ...fallback, ...existing };
}

function getSettings(store, defaultSettings, guild) {
  const defaults = storedDefaults(store, defaultSettings);
  const guildId = resolveGuildId(guild);
  if (!guildId) return { ...defaults };
  const guildConf = storedObject(store, guildId) || {};
  return { ...defaults, ...guildConf };
}

function writeSettings(store, id, newSettings) {
  const guildId = resolveGuildId(id);
  if (!guildId) return {};
  const defaults = storedDefaults(store);
  let settings = storedObject(store, guildId) || {};
  settings = { ...settings };
  for (const key in newSettings) {
    if (defaults[key] !== newSettings[key]) {
      settings[key] = newSettings[key];
    } else {
      delete settings[key];
    }
  }
  store.set(guildId, settings);
  return settings;
}

function isKnownSettingKey(key) {
  return SETTINGS_KEYS.includes(key);
}

export {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  resolveDefaults,
  resolveGuildId,
  guildFromInteraction,
  getSettings,
  writeSettings,
  isKnownSettingKey,
};
