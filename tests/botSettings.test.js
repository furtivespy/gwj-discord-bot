const { afterAll, describe, expect, test } = require("bun:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { GatewayIntentBits } = require("discord.js");
const { DiscordBot } = require("../src/bot.js");
const { DEFAULT_SETTINGS } = require("../src/util/settings.js");

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
