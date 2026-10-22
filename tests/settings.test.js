import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

const SETTINGS_MODULE_PATH = path.join(import.meta.dir, "../src/util/settings.js");

// FUR-111 (PR #3) owns the real settings store. Until that lands on main,
// these tests exercise the same merge contract that PR #3 implements so they
// switch over automatically once `src/util/settings.js` exists.
const FALLBACK_DEFAULT_SETTINGS = {
  modRole: "Moderator",
  adminRole: "Administrator",
  systemNotice: "true",
};

function fallbackResolveDefaults(defaultSettings = FALLBACK_DEFAULT_SETTINGS) {
  return { ...FALLBACK_DEFAULT_SETTINGS, ...(defaultSettings || {}) };
}

function fallbackGetSettings(store, defaultSettings, guild) {
  const defaults = fallbackResolveDefaults(defaultSettings);
  store.ensure("default", defaults);
  if (!guild) return store.get("default");
  const guildId = typeof guild === "object" ? guild.id : guild;
  const guildConf = store.get(guildId) || {};
  return { ...store.get("default"), ...guildConf };
}

function fallbackWriteSettings(store, id, newSettings) {
  const defaults = store.get("default") || fallbackResolveDefaults();
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
});
