import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GatewayIntentBits } from "discord.js";
import { DiscordBot, loadConfig } from "../src/bot.js";
import { DEFAULT_SETTINGS } from "../src/util/settings.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-bot-"));

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("DiscordBot settings helpers", () => {
  test("getSettings merges defaults with guild overrides on the SQLite store", () => {
    const bot = new DiscordBot({
      intents: [GatewayIntentBits.Guilds],
      dataDir,
      config: {
        token: "t",
        clientId: "c",
        bugsnagKey: "0123456789abcdef0123456789abcdef",
        environment: "development",
      },
    });

    expect(bot.getSettings({ id: "guild-1" })).toEqual(DEFAULT_SETTINGS);
    bot.writeSettings("guild-1", { modRole: "Staff" });
    expect(bot.getSettings({ id: "guild-1" }).modRole).toBe("Staff");
    expect(bot.settings.get("guild-1")).toEqual({ modRole: "Staff" });
    bot.settings.close();
  });
});

describe("loadConfig", () => {
  const srcDir = path.join(import.meta.dir, "../src");

  test("reads JSON from an absolute BOT_CONFIG path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-config-"));
    const file = path.join(dir, "config.json");
    const config = { token: "t", clientId: "c", environment: "development" };
    try {
      fs.writeFileSync(file, JSON.stringify(config));
      expect(loadConfig({ BOT_CONFIG: file })).toEqual(config);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads JSON from a path relative to src/bot.js", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-config-rel-"));
    const file = path.join(dir, "config.json");
    const config = { token: "rel", clientId: "c", environment: "development" };
    try {
      fs.writeFileSync(file, JSON.stringify(config));
      const relative = path.relative(srcDir, file);
      expect(path.isAbsolute(relative)).toBe(false);
      expect(loadConfig({ BOT_CONFIG: relative })).toEqual(config);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("falls back to cwd when the path relative to src/bot.js is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-config-cwd-"));
    const file = path.join(dir, "unique-stancy-config.json");
    const config = { token: "cwd", clientId: "c", environment: "development" };
    const previousCwd = process.cwd();
    try {
      fs.writeFileSync(file, JSON.stringify(config));
      process.chdir(dir);
      expect(loadConfig({ BOT_CONFIG: "unique-stancy-config.json" })).toEqual(config);
    } finally {
      process.chdir(previousCwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not swallow a JSON parse error on a relative path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-config-bad-"));
    const file = path.join(dir, "config.json");
    try {
      fs.writeFileSync(file, "{ token: 'no quotes' }");
      const relative = path.relative(srcDir, file);
      expect(() => loadConfig({ BOT_CONFIG: relative })).toThrow(SyntaxError);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
