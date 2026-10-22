import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

const SETTINGS_MODULE_PATH = path.join(import.meta.dir, "../src/util/settings.js");

// FUR-111 (PR #3) owns src/util/settings.js. Until that lands, this file
// inlines that module's merge helpers so the tests assert the real contract
// (null default repair, guild.guildId, empty id) rather than a looser stand-in.
const FALLBACK_DEFAULT_SETTINGS = {
  modRole: "Moderator",
  adminRole: "Administrator",
  systemNotice: "true",
};

function fallbackResolveDefaults(defaultSettings = FALLBACK_DEFAULT_SETTINGS) {
  return { ...FALLBACK_DEFAULT_SETTINGS, ...(defaultSettings || {}) };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackResolveGuildId(guild) {
  if (guild == null || guild === "") return null;
  if (typeof guild === "object") {
    const id = guild.id ?? guild.guildId;
    return id ? String(id) : null;
  }
  return String(guild);
}

function storedObject(store, key) {
  const value = store.get(key);
  return isPlainObject(value) ? value : null;
}

function storedDefaults(store, defaultSettings) {
  const fallback = fallbackResolveDefaults(defaultSettings);
  const existing = storedObject(store, "default");
  if (!existing) {
    store.set("default", fallback);
    return fallback;
  }
  return { ...fallback, ...existing };
}

function fallbackGetSettings(store, defaultSettings, guild) {
  const defaults = storedDefaults(store, defaultSettings);
  const guildId = fallbackResolveGuildId(guild);
  if (!guildId) return { ...defaults };
  const guildConf = storedObject(store, guildId) || {};
  return { ...defaults, ...guildConf };
}

function fallbackWriteSettings(store, id, newSettings) {
  const guildId = fallbackResolveGuildId(id);
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

const settingsModule = fs.existsSync(SETTINGS_MODULE_PATH)
  ? require(SETTINGS_MODULE_PATH)
  : null;

const DEFAULT_SETTINGS =
  settingsModule?.DEFAULT_SETTINGS ?? FALLBACK_DEFAULT_SETTINGS;
const getSettings = settingsModule?.getSettings ?? fallbackGetSettings;
const writeSettings = settingsModule?.writeSettings ?? fallbackWriteSettings;

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => data.get(String(key)),
    set(key, value) {
      data.set(String(key), value);
      return this;
    },
    has: (key) => data.has(String(key)),
    ensure(key, defaultValue) {
      const stringKey = String(key);
      if (!data.has(stringKey)) {
        const value =
          typeof defaultValue === "function"
            ? defaultValue()
            : { ...defaultValue };
        data.set(stringKey, value);
      }
      return data.get(stringKey);
    },
    data,
  };
}

describe("settings merge contract", () => {
  test("uses src/util/settings.js when FUR-111 has landed, otherwise the in-test contract", () => {
    if (settingsModule) {
      expect(typeof settingsModule.getSettings).toBe("function");
      expect(typeof settingsModule.writeSettings).toBe("function");
      expect(settingsModule.DEFAULT_SETTINGS).toEqual(DEFAULT_SETTINGS);
    } else {
      expect(fs.existsSync(SETTINGS_MODULE_PATH)).toBe(false);
    }
  });

  test("returns defaults when there is no guild or no override", () => {
    const store = memoryStore();
    expect(getSettings(store, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(getSettings(store, DEFAULT_SETTINGS, { id: "guild-1" })).toEqual(
      DEFAULT_SETTINGS
    );
  });

  test("merges per-server overrides on top of defaults", () => {
    const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
    writeSettings(store, "guild-1", { modRole: "Mods" });

    expect(store.get("guild-1")).toEqual({ modRole: "Mods" });
    expect(getSettings(store, DEFAULT_SETTINGS, { id: "guild-1" })).toEqual({
      ...DEFAULT_SETTINGS,
      modRole: "Mods",
    });
    expect(getSettings(store, DEFAULT_SETTINGS, { id: "guild-2" })).toEqual(
      DEFAULT_SETTINGS
    );
  });

  test("writeSettings drops keys that match defaults", () => {
    const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
    writeSettings(store, "guild-1", { modRole: "Mods", adminRole: "Admins" });
    writeSettings(store, "guild-1", { modRole: DEFAULT_SETTINGS.modRole });

    expect(store.get("guild-1")).toEqual({ adminRole: "Admins" });
    expect(getSettings(store, DEFAULT_SETTINGS, { id: "guild-1" }).modRole).toBe(
      DEFAULT_SETTINGS.modRole
    );
  });

  test("repairs a null default row and accepts guild.guildId", () => {
    const store = memoryStore({ default: null });
    expect(getSettings(store, DEFAULT_SETTINGS, { guildId: "guild-1" })).toEqual(
      DEFAULT_SETTINGS
    );
    expect(store.get("default")).toEqual(DEFAULT_SETTINGS);
  });

  test("writeSettings ignores empty ids and does not store them", () => {
    const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
    expect(writeSettings(store, "", { modRole: "Mods" })).toEqual({});
    expect(writeSettings(store, { id: "" }, { modRole: "Mods" })).toEqual({});
    expect(store.has("")).toBe(false);
    expect(getSettings(store, DEFAULT_SETTINGS, "")).toEqual(DEFAULT_SETTINGS);
  });
});
