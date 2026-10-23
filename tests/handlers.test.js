import { describe, expect, test } from "bun:test";
import { Collection, Events } from "discord.js";
import { listJsFiles } from "../src/handlers/discover.js";
import EventTypes from "../src/base/EventTypes.js";
import loadEvents from "../src/handlers/events.js";
import {
  loadSlashCommands,
  resolveDevGuildId,
  registerSlashCommands,
} from "../src/handlers/slashcommands.js";
import path from "path";
import {
  hasVoiceCommandFile,
  hasVoiceEventFile,
} from "./helpers/voiceFeature.js";

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
  return {
    logger: silentLogger(),
    slash_commands: new Collection(),
    events: new Collection(),
    config: {},
    registered,
    on(name, handler) {
      registered[name] = { bind: "on", handler };
    },
    once(name, handler) {
      registered[name] = { bind: "once", handler };
    },
  };
}

describe("file discovery", () => {
  test("lists slash command and event files so adding a file is enough", () => {
    const commands = listJsFiles(path.join(import.meta.dir, "../src/commands/slash"));
    const events = listJsFiles(path.join(import.meta.dir, "../src/events"));

    expect(commands.some((file) => file.endsWith("ping.js"))).toBe(true);
    expect(commands.some((file) => file.endsWith("status.js"))).toBe(true);
    expect(commands.some((file) => file.endsWith("settings.js"))).toBe(true);
    expect(events.some((file) => file.endsWith("ready.js"))).toBe(true);
    expect(events.some((file) => file.endsWith("interactionCreate.js"))).toBe(true);
    if (hasVoiceCommandFile()) {
      expect(commands.some((file) => file.endsWith("voiceCreate.js"))).toBe(true);
    }
    if (hasVoiceEventFile()) {
      expect(events.some((file) => file.endsWith("voiceStateUpdate.js"))).toBe(true);
    }
  });
});

describe("slash command loader", () => {
  test("auto-discovers ping, settings, and status without a Discord token", async () => {
    const logs = [];
    const client = fakeClient();
    client.logger = {
      ...silentLogger(),
      info(content) {
        logs.push(content);
      },
    };

    const commands = await loadSlashCommands(client, { register: false });

    expect(client.slash_commands.get("ping")?.data.name).toBe("ping");
    expect(client.slash_commands.get("status")?.data.name).toBe("status");
    expect(client.slash_commands.get("settings")?.data.name).toBe("settings");
    expect(client.slash_commands.get("settings")?.conf.permLevel).toBe("Administrator");
    const names = commands.map((command) => command.data.name).sort();
    expect(names).toEqual(expect.arrayContaining(["ping", "settings", "status"]));
    const voiceCreate = client.slash_commands.get("voice-create");
    if (voiceCreate) {
      expect(voiceCreate.data.name).toBe("voice-create");
    } else {
      expect(names).not.toContain("voice-create");
    }
    expect(logs.some((line) => String(line).includes("Loading Slash Command: ping."))).toBe(
      true
    );
    expect(
      logs.some((line) => String(line).includes("Loading Slash Command: status."))
    ).toBe(true);
    expect(
      logs.some((line) => String(line).includes("Loading Slash Command: settings."))
    ).toBe(true);
    if (voiceCreate) {
      expect(
        logs.some((line) => String(line).includes("Loading Slash Command: voice-create."))
      ).toBe(true);
    }
  });

  test("resolveDevGuildId prefers env, then config, and has no hardcoded guild", () => {
    expect(resolveDevGuildId({ environment: "production" }, {})).toBeNull();
    expect(resolveDevGuildId({ environment: "development" }, {})).toBeNull();
    expect(
      resolveDevGuildId(
        { environment: "production", devGuildId: "111" },
        { DEV_GUILD_ID: "222" }
      )
    ).toBe("222");
    expect(
      resolveDevGuildId({ environment: "production", devGuildId: "111" }, {})
    ).toBe("111");
    expect(
      resolveDevGuildId({ environment: "development", devGuildId: "   " }, { DEV_GUILD_ID: "" })
    ).toBeNull();
  });
});

describe("event handler", () => {
  test("registers clientReady and interactionCreate without a Discord token", async () => {
    const client = fakeClient();
    await loadEvents(client);

    expect(EventTypes.READY).toBe(Events.ClientReady);
    expect(EventTypes.READY).toBe("clientReady");
    expect(typeof client.registered.clientReady.handler).toBe("function");
    expect(client.registered.clientReady.bind).toBe("once");
    expect(client.registered.ready).toBeUndefined();
    expect(typeof client.registered.interactionCreate.handler).toBe("function");
    expect(client.registered.interactionCreate.bind).toBe("on");
    expect(client.events.get("ready")?.help.eventType).toBe("clientReady");
    expect(client.events.get("interactionCreate")?.help.eventType).toBe(
      "interactionCreate"
    );
    const voiceStateUpdate = client.events.get("voiceStateUpdate");
    if (voiceStateUpdate) {
      expect(typeof client.registered.voiceStateUpdate.handler).toBe("function");
      expect(voiceStateUpdate.help.eventType).toBe("voiceStateUpdate");
    } else {
      expect(client.registered.voiceStateUpdate).toBeUndefined();
    }
  });

  test("clientReady fetches application into appInfo for Bot Owner checks", async () => {
    const client = fakeClient();
    await loadEvents(client);
    const appInfo = { owner: { id: "boss" } };
    client.application = {
      async fetch() {
        return appInfo;
      },
    };

    await client.registered.clientReady.handler();

    expect(client.appInfo).toBe(appInfo);
  });

  test("interactionCreate routes a ping button through the loaded command", async () => {
    const client = fakeClient();
    await loadSlashCommands(client);
    await loadEvents(client);

    const replies = [];
    await client.registered.interactionCreate.handler({
      isCommand: () => false,
      isChatInputCommand: () => false,
      isAutocomplete: () => false,
      isButton: () => true,
      isAnySelectMenu: () => false,
      isModalSubmit: () => false,
      deferred: false,
      replied: false,
      createdTimestamp: Date.now(),
      customId: "ping:again",
      options: { getSubcommand: () => null },
      user: { id: "user-1" },
      reply: async (payload) => {
        replies.push(payload);
      },
    });

    expect(replies[0].content).toBe("Pong again!");
  });
});

describe("slash command registration", () => {
  test("registers to a guild when DEV_GUILD_ID is set, otherwise globally", async () => {
    const puts = [];
    const rest = {
      async put(route, payload) {
        puts.push({ route, payload });
      },
    };
    const client = fakeClient();
    client.config = { token: "t", clientId: "client-1", environment: "production" };
    const commands = await loadSlashCommands(client);

    const guild = await registerSlashCommands(client, commands, {
      rest,
      env: { DEV_GUILD_ID: "999" },
    });
    expect(guild).toEqual({
      scope: "guild",
      guildId: "999",
      count: commands.length,
    });

    const global = await registerSlashCommands(client, commands, {
      rest,
      env: {},
    });
    expect(global).toEqual({ scope: "global", count: commands.length });
    expect(puts).toHaveLength(2);
    expect(puts[0].payload.body).toHaveLength(commands.length);
    expect(puts[1].payload.body).toHaveLength(commands.length);
    expect(puts[0].payload.body.map((cmd) => cmd.name)).toEqual(
      expect.arrayContaining(["ping", "settings", "status"])
    );
  });

  test("warns in development when registering globally because no guild id is set", async () => {
    const warnings = [];
    const client = fakeClient();
    client.config = { token: "t", clientId: "client-1", environment: "development" };
    client.logger = {
      ...silentLogger(),
      warn(content) {
        warnings.push(content);
      },
    };
    const commands = await loadSlashCommands(client);
    const result = await registerSlashCommands(client, commands, {
      rest: { async put() {} },
      env: {},
    });
    expect(result.scope).toBe("global");
    expect(warnings.some((line) => String(line).includes("DEV_GUILD_ID"))).toBe(true);
  });
});
