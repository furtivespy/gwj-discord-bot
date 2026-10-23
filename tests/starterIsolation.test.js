import { describe, expect, test } from "bun:test";
import { Collection } from "discord.js";
import fs from "fs";
import os from "os";
import path from "path";
import { listJsFiles } from "../src/handlers/discover.js";
import loadEvents from "../src/handlers/events.js";
import {
  loadSlashCommands,
  registerSlashCommands,
} from "../src/handlers/slashcommands.js";
import { routeInteraction } from "../src/handlers/interactionRouter.js";
import { DEFAULT_SETTINGS, getSettings, writeSettings } from "../src/util/settings.js";
import { memoryStore } from "./helpers/memoryStore.js";
import {
  VOICE_COMMAND,
  VOICE_EVENT,
  VOICE_UTIL,
} from "./helpers/voiceFeature.js";

const SRC = path.join(import.meta.dir, "../src");
const ENV_EXAMPLE = path.join(import.meta.dir, "../.env.example");
const COMMANDS_DIR = path.join(SRC, "commands/slash");
const EVENTS_DIR = path.join(SRC, "events");

const CORE_COMMANDS = ["ping", "settings", "status"];
const CORE_EVENTS = ["interactionCreate", "ready"];

function silentLogger() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
    time() {},
    log() {},
  };
}

function fakeClient() {
  const registered = {};
  const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
  writeSettings(store, "guild-1", { modRole: "Staff" });
  return {
    logger: silentLogger(),
    slash_commands: new Collection(),
    events: new Collection(),
    config: { token: "t", clientId: "client-1", environment: "production" },
    user: {
      tag: "Bot#0000",
      displayAvatarURL: () => "https://cdn.example/bot.png",
    },
    guilds: { cache: { size: 2 } },
    settings: store,
    getSettings(guild) {
      return getSettings(store, DEFAULT_SETTINGS, guild);
    },
    writeSettings(id, next) {
      return writeSettings(store, id, next);
    },
    registered,
    on(name, handler) {
      registered[name] = { bind: "on", handler };
    },
    once(name, handler) {
      registered[name] = { bind: "once", handler };
    },
  };
}

function importedSpecifiers(source) {
  const specs = [];
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const fromRe = /from\s+['"]([^'"]+)['"]/g;
  const importRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [requireRe, fromRe, importRe]) {
    let match;
    while ((match = re.exec(source))) specs.push(match[1]);
  }
  return specs;
}

function isVoiceModule(specifier) {
  const normalized = specifier.replace(/\\/g, "/");
  return (
    normalized.endsWith("onDemandVoice") ||
    normalized.endsWith("onDemandVoice.js") ||
    normalized.endsWith("voiceCreate") ||
    normalized.endsWith("voiceCreate.js") ||
    normalized.endsWith("voiceStateUpdate") ||
    normalized.endsWith("voiceStateUpdate.js")
  );
}

function envVarsReferencedInSrc() {
  const names = new Set();
  const ident = /\b(?:env|process\.env)\.([A-Z][A-Z0-9_]+)/g;
  for (const file of listJsFiles(SRC)) {
    const source = fs.readFileSync(file, "utf8");
    let match;
    while ((match = ident.exec(source))) names.add(match[1]);
  }
  return [...names].sort();
}

function symlinkWithout(fromDir, toDir, skipNames) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const file of listJsFiles(fromDir)) {
    if (skipNames.has(path.basename(file))) continue;
    const dest = path.join(toDir, path.relative(fromDir, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(file, dest);
  }
}

describe("voice feature isolation", () => {
  test("only the voice command and event import on-demand voice helpers", () => {
    const allowed = new Set([
      path.resolve(VOICE_COMMAND),
      path.resolve(VOICE_EVENT),
      path.resolve(VOICE_UTIL),
    ]);
    const offenders = [];
    for (const file of listJsFiles(SRC)) {
      const resolved = path.resolve(file);
      if (allowed.has(resolved)) continue;
      const specs = importedSpecifiers(fs.readFileSync(file, "utf8"));
      if (specs.some(isVoiceModule)) offenders.push(path.relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });

  test("loaders still register /ping /status /settings without the voice files", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stancy-novoice-"));
    const commandsPath = path.join(tmp, "commands");
    const eventsPath = path.join(tmp, "events");
    try {
      symlinkWithout(COMMANDS_DIR, commandsPath, new Set(["voiceCreate.js"]));
      symlinkWithout(EVENTS_DIR, eventsPath, new Set(["voiceStateUpdate.js"]));

      const client = fakeClient();
      const commands = await loadSlashCommands(client, {
        commandsPath,
      });
      const events = await loadEvents(client, { eventsPath });

      expect(commands.map((command) => command.data.name).sort()).toEqual(
        CORE_COMMANDS
      );
      expect(client.slash_commands.get("voice-create")).toBeUndefined();
      expect(events.map((loaded) => loaded.name).sort()).toEqual(CORE_EVENTS);
      expect(client.events.get("voiceStateUpdate")).toBeUndefined();
      expect(typeof client.registered.clientReady.handler).toBe("function");
      expect(client.registered.ready).toBeUndefined();
      expect(typeof client.registered.interactionCreate.handler).toBe("function");
      expect(client.registered.voiceStateUpdate).toBeUndefined();

      const puts = [];
      const result = await registerSlashCommands(client, commands, {
        rest: {
          async put(route, payload) {
            puts.push({ route, payload });
          },
        },
        env: { DEV_GUILD_ID: "999" },
      });
      expect(result).toEqual({ scope: "guild", guildId: "999", count: 3 });
      expect(puts[0].payload.body.map((cmd) => cmd.name).sort()).toEqual(
        CORE_COMMANDS
      );

      const pingReplies = [];
      const statusReplies = [];
      const settingsReplies = [];
      const chatInput = (commandName, replies, extras = {}) => ({
        isCommand: () => true,
        isChatInputCommand: () => true,
        isAutocomplete: () => false,
        isButton: () => false,
        isAnySelectMenu: () => false,
        isModalSubmit: () => false,
        deferred: false,
        replied: false,
        createdTimestamp: Date.now(),
        commandName,
        user: {
          id: "user-1",
          tag: "Tester#1234",
          displayAvatarURL: () => "https://cdn.example/user.jpg",
        },
        client,
        options: { getSubcommand: () => null },
        reply: async (payload) => {
          replies.push(payload);
        },
        ...extras,
      });
      await routeInteraction(client, chatInput("ping", pingReplies));
      await routeInteraction(client, chatInput("status", statusReplies));
      await routeInteraction(
        client,
        chatInput("settings", settingsReplies, {
          guildId: "guild-1",
          guild: { id: "guild-1" },
          options: { getSubcommand: () => "show", getString: () => null },
        })
      );
      expect(pingReplies[0].content).toBe("Pong!");
      expect(statusReplies[0].content).toContain("Version:");
      expect(statusReplies[0].content).toContain("Servers: 2");
      expect(settingsReplies[0].content).toContain("modRole: `Staff`");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe(".env.example", () => {
  test("lists every process env var the source reads", () => {
    expect(fs.existsSync(ENV_EXAMPLE)).toBe(true);
    const example = fs.readFileSync(ENV_EXAMPLE, "utf8");
    const referenced = envVarsReferencedInSrc();
    expect(referenced.length).toBeGreaterThan(0);
    const missing = referenced.filter((name) => !example.includes(name));
    expect(missing).toEqual([]);
  });
});
