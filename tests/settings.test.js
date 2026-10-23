import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import BunEnmap from "../src/db/BunEnmap.js";
import {
  DEFAULT_SETTINGS,
  getSettings,
  writeSettings,
} from "../src/util/settings.js";
import { memoryStore } from "./helpers/memoryStore.js";

describe("settings merge", () => {
  test("uses the SQLite settings module from main", () => {
    expect(typeof getSettings).toBe("function");
    expect(typeof writeSettings).toBe("function");
    expect(DEFAULT_SETTINGS).toEqual({
      modRole: "Moderator",
      adminRole: "Administrator",
      systemNotice: "true",
    });
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
      "Moderator"
    );
  });

  test("accepts a guild id string, guild.guildId, and ignores objects with no id", () => {
    const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
    writeSettings(store, "guild-1", { modRole: "Mods" });
    expect(getSettings(store, DEFAULT_SETTINGS, "guild-1").modRole).toBe("Mods");
    expect(getSettings(store, DEFAULT_SETTINGS, { guildId: "guild-1" }).modRole).toBe(
      "Mods"
    );
    expect(getSettings(store, DEFAULT_SETTINGS, {}).modRole).toBe("Moderator");
  });

  test("writeSettings ignores empty ids and does not store them", () => {
    const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
    expect(writeSettings(store, "", { modRole: "Mods" })).toEqual({});
    expect(writeSettings(store, { id: "" }, { modRole: "Mods" })).toEqual({});
    expect(store.has("")).toBe(false);
    expect(getSettings(store, DEFAULT_SETTINGS, "")).toEqual(DEFAULT_SETTINGS);
  });

  test("repairs a null default row instead of wiping role names", () => {
    const store = memoryStore();
    store.set("default", null);
    store.set("guild-1", { modRole: "Mods" });
    expect(getSettings(store, DEFAULT_SETTINGS, { id: "guild-1" })).toEqual({
      ...DEFAULT_SETTINGS,
      modRole: "Mods",
    });
    expect(store.get("default")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("BunEnmap persistence", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-settings-"));
  const poisonDir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-poison-"));

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(poisonDir, { recursive: true, force: true });
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

  test("deep clone on set so later mutation does not dirty the store", () => {
    const store = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir,
    });
    const value = { modRole: "Staff" };
    store.set("guild-1", value);
    value.modRole = "Mutated";
    expect(store.get("guild-1").modRole).toBe("Staff");
    store.close();
  });

  test("skips unreadable rows instead of caching null", () => {
    const db = new Database(path.join(poisonDir, "settings.sqlite"), { create: true });
    db.exec(`
      CREATE TABLE enmap_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.query("INSERT INTO enmap_store (key, value) VALUES (?, ?)").run("default", "{");
    db.query("INSERT INTO enmap_store (key, value) VALUES (?, ?)").run("poison", "null");
    db.query("INSERT INTO enmap_store (key, value) VALUES (?, ?)").run(
      "guild-1",
      JSON.stringify({ modRole: "Mods" })
    );
    db.close();

    const store = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir: poisonDir,
    });
    expect(store.has("default")).toBe(false);
    expect(store.has("poison")).toBe(false);
    expect(getSettings(store, DEFAULT_SETTINGS, { id: "guild-1" })).toEqual({
      ...DEFAULT_SETTINGS,
      modRole: "Mods",
    });
    store.close();
  });

  test("does not cache JSON null so ensure can restore defaults", () => {
    const nullDir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-null-"));
    const db = new Database(path.join(nullDir, "settings.sqlite"), { create: true });
    db.exec(`
      CREATE TABLE enmap_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.query("INSERT INTO enmap_store (key, value) VALUES (?, ?)").run("default", "null");
    db.close();

    const store = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir: nullDir,
    });
    expect(store.has("default")).toBe(false);
    expect(getSettings(store, DEFAULT_SETTINGS).modRole).toBe("Moderator");
    store.close();
    fs.rmSync(nullDir, { recursive: true, force: true });
  });

  test("does not Function-eval or cache legacy non-JSON values", () => {
    const evalDir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-eval-"));
    const db = new Database(path.join(evalDir, "settings.sqlite"), { create: true });
    db.exec(`
      CREATE TABLE enmap_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.query("INSERT INTO enmap_store (key, value) VALUES (?, ?)").run(
      "default",
      "undefined"
    );
    db.close();

    const store = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir: evalDir,
    });
    expect(store.has("default")).toBe(false);
    expect(getSettings(store, DEFAULT_SETTINGS).modRole).toBe("Moderator");
    store.close();
    fs.rmSync(evalDir, { recursive: true, force: true });
  });

  test("guild.guildId and empty ids work against the SQLite store", () => {
    const store = new BunEnmap({
      name: "settings",
      cloneLevel: "deep",
      dataDir,
    });
    store.ensure("default", DEFAULT_SETTINGS);
    writeSettings(store, "guild-1", { modRole: "Night Watch" });
    expect(getSettings(store, DEFAULT_SETTINGS, { guildId: "guild-1" }).modRole).toBe(
      "Night Watch"
    );
    expect(writeSettings(store, "", { modRole: "Mods" })).toEqual({});
    expect(store.has("")).toBe(false);
    store.close();
  });
});
