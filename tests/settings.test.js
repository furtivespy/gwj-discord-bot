const { afterAll, describe, expect, test } = require("bun:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const BunEnmap = require("../src/db/BunEnmap.js");
const {
  DEFAULT_SETTINGS,
  getSettings,
  writeSettings,
} = require("../src/util/settings.js");

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
          typeof defaultValue === "function" ? defaultValue() : { ...defaultValue };
        data.set(stringKey, value);
      }
      return data.get(stringKey);
    },
    data,
  };
}

describe("settings merge", () => {
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
      "Moderator"
    );
  });
});

describe("BunEnmap persistence", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-settings-"));

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test("survives close and reopen on the same data dir", () => {
    const first = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir,
    });
    first.ensure("default", DEFAULT_SETTINGS);
    writeSettings(first, "guild-1", { modRole: "Night Watch" });
    first.close();

    const second = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir,
    });
    expect(getSettings(second, DEFAULT_SETTINGS, { id: "guild-1" })).toEqual({
      ...DEFAULT_SETTINGS,
      modRole: "Night Watch",
    });
    second.close();
  });
});
