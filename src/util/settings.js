const DEFAULT_SETTINGS = {
  modRole: "Moderator",
  adminRole: "Administrator",
  systemNotice: "true",
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function resolveDefaults(defaultSettings = DEFAULT_SETTINGS) {
  return { ...DEFAULT_SETTINGS, ...(defaultSettings || {}) };
}

function getSettings(store, defaultSettings, guild) {
  const defaults = resolveDefaults(defaultSettings);
  store.ensure("default", defaults);
  if (!guild) return store.get("default");
  const guildId = typeof guild === "object" ? guild.id : guild;
  const guildConf = store.get(guildId) || {};
  return { ...store.get("default"), ...guildConf };
}

function writeSettings(store, id, newSettings) {
  const defaults = store.get("default") || resolveDefaults();
  let settings = store.get(id);
  if (typeof settings !== "object" || settings === null) settings = {};
  else settings = { ...settings };
  for (const key in newSettings) {
    if (defaults[key] !== newSettings[key]) {
      settings[key] = newSettings[key];
    } else {
      delete settings[key];
    }
  }
  store.set(id, settings);
  return settings;
}

function isKnownSettingKey(key) {
  return SETTINGS_KEYS.includes(key);
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  resolveDefaults,
  getSettings,
  writeSettings,
  isKnownSettingKey,
};
