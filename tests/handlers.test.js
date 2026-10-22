import { describe, expect, test } from "bun:test";
import { Collection } from "discord.js";
import { listJsFiles } from "../src/handlers/discover.js";
import loadEvents from "../src/handlers/events.js";
import loadSlashCommands, {
  resolveDevGuildId,
  registerSlashCommands,
  DEFAULT_DEV_GUILD_ID,
} from "../src/handlers/slashcommands.js";
import path from "path";

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
    expect(commands.some((file) => file.endsWith("voiceCreate.js"))).toBe(true);
    expect(commands.some((file) => file.endsWith("settings.js"))).toBe(true);
    expect(events.some((file) => file.endsWith("ready.js"))).toBe(true);
    expect(events.some((file) => file.endsWith("interactionCreate.js"))).toBe(true);
    expect(events.some((file) => file.endsWith("voiceStateUpdate.js"))).toBe(true);
  });
});

describe("slash command loader", () => {
  test("auto-discovers ping and voice-create without a Discord token", () => {
    const logs = [];
    const client = fakeClient();
    client.logger = {
      ...silentLogger(),
      info(content) {
        logs.push(content);
      },
    };

    const commands = loadSlashCommands.loadSlashCommands
      ? loadSlashCommands.loadSlashCommands(client)
      : loadSlashCommands(client, { register: false });

    expect(client.slash_commands.get("ping")?.data.name).toBe("ping");
    expect(client.slash_commands.get("voice-create")?.data.name).toBe("voice-create");
    expect(client.slash_commands.get("settings")?.data.name).toBe("settings");
    expect(client.slash_commands.get("settings")?.conf.permLevel).toBe("Administrator");
    expect(commands.map((command) => command.data.name).sort()).toEqual([
      "ping",
      "settings",
      "voice-create",
    ]);
    expect(logs.some((line) => String(line).includes("Loading Slash Command: ping."))).toBe(
      true
    );
    expect(
      logs.some((line) => String(line).includes("Loading Slash Command: voice-create."))
    ).toBe(true);
  });

  test("resolveDevGuildId prefers env, then config, then the development fallback", () => {
    expect(resolveDevGuildId({ environment: "production" }, {})).toBeNull();
    expect(
      resolveDevGuildId({ environment: "development" }, {})
    ).toBe(DEFAULT_DEV_GUILD_ID);
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
    ).toBe(DEFAULT_DEV_GUILD_ID);
  });
});

describe("event handler", () => {
  test("registers ready, interactionCreate, and voiceStateUpdate without a Discord token", () => {
    const client = fakeClient();
    loadEvents(client);

    expect(typeof client.registered.ready.handler).toBe("function");
    expect(client.registered.ready.bind).toBe("once");
    expect(typeof client.registered.interactionCreate.handler).toBe("function");
    expect(client.registered.interactionCreate.bind).toBe("on");
    expect(typeof client.registered.voiceStateUpdate.handler).toBe("function");
    expect(client.events.get("ready")?.help.eventType).toBe("ready");
    expect(client.events.get("interactionCreate")?.help.eventType).toBe(
      "interactionCreate"
    );
    expect(client.events.get("voiceStateUpdate")?.help.eventType).toBe(
      "voiceStateUpdate"
    );
  });

  test("interactionCreate routes a ping button through the loaded command", async () => {
    const client = fakeClient();
    loadSlashCommands.loadSlashCommands(client);
    loadEvents(client);

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
    const commands = loadSlashCommands.loadSlashCommands(client);

    const guild = await registerSlashCommands(client, commands, {
      rest,
      env: { DEV_GUILD_ID: "999" },
    });
    expect(guild).toEqual({ scope: "guild", guildId: "999", count: 3 });

    const global = await registerSlashCommands(client, commands, {
      rest,
      env: {},
    });
    expect(global).toEqual({ scope: "global", count: 3 });
    expect(puts).toHaveLength(2);
    expect(puts[0].payload.body).toHaveLength(3);
    expect(puts[1].payload.body).toHaveLength(3);
  });
});
