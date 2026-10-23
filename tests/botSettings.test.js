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
  test("reads JSON from an absolute path without require()", () => {
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
});
