import { describe, expect, test } from "bun:test";
import { ChannelType, MessageFlags } from "discord.js";
import Ping from "../src/commands/slash/ping.js";
import Settings from "../src/commands/slash/settings.js";
import Status from "../src/commands/slash/status.js";
import { DEFAULT_SETTINGS, getSettings, writeSettings } from "../src/util/settings.js";
import { memoryStore } from "./helpers/memoryStore.js";
import {
  VOICE_COMMAND,
  VOICE_UTIL,
  tryLoad,
} from "./helpers/voiceFeature.js";

const VoiceCreate = await tryLoad(VOICE_COMMAND);
const FALLBACK_PARENT_ID = (await tryLoad(VOICE_UTIL))?.FALLBACK_PARENT_ID ?? null;

function silentLogger() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
    time() {},
  };
}

function avatarClient() {
  return {
    user: {
      displayAvatarURL: () => "https://cdn.example/bot.png",
      tag: "Stancy#0000",
    },
    logger: silentLogger(),
  };
}

describe("slash command modules", () => {
  test("load without a Discord token and expose slash metadata", () => {
    const ping = new Ping(avatarClient());
    const status = new Status({ logger: silentLogger() });
    const settings = new Settings({ logger: silentLogger() });

    expect(ping.data.name).toBe("ping");
    expect(ping.data.description).toBe("Replies with Pong!");
    expect(ping).toBeInstanceOf(Ping);
    expect(ping.conf.permLevel).toBe("User");

    expect(status.data.name).toBe("status");
    expect(status.data.description).toBe(
      "Shows bot uptime, version, and server count"
    );
    expect(status).toBeInstanceOf(Status);
    expect(status.conf.permLevel).toBe("User");

    expect(settings.data.name).toBe("settings");
    expect(settings.conf.permLevel).toBe("Administrator");
    expect(settings).toBeInstanceOf(Settings);

    if (VoiceCreate) {
      const voiceCreate = new VoiceCreate({ logger: silentLogger() });
      expect(voiceCreate.data.name).toBe("voice-create");
      expect(voiceCreate.data.description).toBe("Creates a voice channel");
      expect(voiceCreate).toBeInstanceOf(VoiceCreate);
      expect(voiceCreate.conf.permLevel).toBe("User");

      const json = voiceCreate.data.toJSON();
      const nameOption = json.options.find((option) => option.name === "name");
      expect(nameOption).toBeDefined();
      expect(nameOption.required).toBe(true);
    }
  });
});

describe("/ping", () => {
  test("replies with an Again button routed by customId prefix", async () => {
    const client = avatarClient();
    const ping = new Ping(client);
    const reply = async (payload) => {
      reply.calls = [...(reply.calls || []), payload];
    };

    await ping.execute({
      user: {
        displayAvatarURL: () => "https://cdn.example/user.jpg",
        tag: "Tester#1234",
      },
      client,
      reply,
    });

    expect(reply.calls[0].content).toBe("Pong!");
    expect(reply.calls[0].flags).toBe(MessageFlags.Ephemeral);
    const row = reply.calls[0].components[0].toJSON();
    expect(row.components[0].custom_id).toBe(Ping.PING_AGAIN_ID);
    expect(Ping.PING_AGAIN_ID.startsWith("ping:")).toBe(true);
  });

  test("button handler replies Pong again", async () => {
    const ping = new Ping(avatarClient());
    const reply = async (payload) => {
      reply.calls = [...(reply.calls || []), payload];
    };

    await ping.button({ reply });

    expect(reply.calls[0].content).toBe("Pong again!");
    expect(reply.calls[0].flags).toBe(MessageFlags.Ephemeral);
  });
});

describe.skipIf(!VoiceCreate)("/voice-create", () => {
  test("creates a GuildVoice channel under the on-demand category", async () => {
    const voiceCreate = new VoiceCreate({ logger: silentLogger() });
    const created = { id: "voice-1", toString: () => "<#voice-1>" };
    const category = {
      id: "cat-1",
      name: "On-Demand Voice",
      type: ChannelType.GuildCategory,
    };
    const create = async (options) => {
      create.calls = [...(create.calls || []), options];
      return created;
    };
    const reply = async (payload) => {
      reply.calls = [...(reply.calls || []), payload];
    };

    const interaction = {
      options: { getString: (key) => (key === "name" ? "Raid Night" : null) },
      guild: {
        channels: {
          cache: { find: (predicate) => [category].find(predicate) },
          create,
        },
      },
      client: { logger: silentLogger() },
      reply,
    };

    await voiceCreate.execute(interaction);

    expect(create.calls).toEqual([
      {
        name: "Raid Night",
        type: ChannelType.GuildVoice,
        parent: category,
      },
    ]);
    expect(reply.calls[0].content).toBe("Created <#voice-1> - Click to hop in!");
    expect(reply.calls[0].flags).toBe(MessageFlags.Ephemeral);
  });

  test("falls back to the hardcoded parent when the category is missing", async () => {
    const voiceCreate = new VoiceCreate({ logger: silentLogger() });
    const create = async (options) => {
      create.calls = [...(create.calls || []), options];
      return { toString: () => "<#voice-2>" };
    };

    await voiceCreate.execute({
      options: { getString: () => "Fallback Channel" },
      guild: {
        channels: {
          cache: { find: () => undefined },
          create,
        },
      },
      client: { logger: silentLogger() },
      reply: async () => {},
    });

    expect(create.calls[0].parent).toBe(FALLBACK_PARENT_ID);
  });
});

function settingsClient() {
  const store = memoryStore({ default: { ...DEFAULT_SETTINGS } });
  return {
    logger: silentLogger(),
    settings: store,
    getSettings(guild) {
      return getSettings(store, DEFAULT_SETTINGS, guild);
    },
    writeSettings(id, next) {
      return writeSettings(store, id, next);
    },
  };
}

describe("/settings", () => {
  test("show lists merged guild settings", async () => {
    const client = settingsClient();
    client.writeSettings("guild-1", { modRole: "Mods" });
    const command = new Settings(client);
    const replies = [];

    await command.execute({
      guildId: "guild-1",
      guild: { id: "guild-1" },
      options: { getSubcommand: () => "show", getString: () => null },
      reply: async (payload) => replies.push(payload),
    });

    expect(replies[0].content).toContain("modRole: `Mods`");
    expect(replies[0].content).toContain("adminRole: `Administrator`");
    expect(replies[0].flags).toBe(MessageFlags.Ephemeral);
  });

  test("set writes an override and get reads it back", async () => {
    const client = settingsClient();
    const command = new Settings(client);
    const replies = [];

    await command.execute({
      guildId: "guild-1",
      guild: { id: "guild-1" },
      options: {
        getSubcommand: () => "set",
        getString: (name) => (name === "key" ? "modRole" : "Cool Mods"),
      },
      reply: async (payload) => replies.push(payload),
    });
    await command.execute({
      guildId: "guild-1",
      guild: { id: "guild-1" },
      options: {
        getSubcommand: () => "get",
        getString: () => "modRole",
      },
      reply: async (payload) => replies.push(payload),
    });

    expect(client.getSettings({ id: "guild-1" }).modRole).toBe("Cool Mods");
    expect(replies[0].content).toBe("modRole set to `Cool Mods`");
    expect(replies[1].content).toBe("modRole is currently `Cool Mods`");
  });

  test("show uses guildId when guild is null", async () => {
    const client = settingsClient();
    client.writeSettings("guild-1", { modRole: "Mods" });
    const command = new Settings(client);
    const replies = [];

    await command.execute({
      guildId: "guild-1",
      guild: null,
      options: { getSubcommand: () => "show", getString: () => null },
      reply: async (payload) => replies.push(payload),
    });

    expect(replies[0].content).toContain("modRole: `Mods`");
  });

  test("set uses guildId when interaction.guild is missing", async () => {
    const client = settingsClient();
    client.writeSettings("guild-1", { modRole: "Night Watch" });
    const command = new Settings(client);
    const replies = [];

    await command.execute({
      guildId: "guild-1",
      guild: null,
      options: {
        getSubcommand: () => "set",
        getString: (name) => (name === "key" ? "modRole" : "Night Watch"),
      },
      reply: async (payload) => replies.push(payload),
    });

    expect(client.getSettings("guild-1").modRole).toBe("Night Watch");
    expect(replies[0].content).toBe("modRole already has that value.");

    await command.execute({
      guildId: "guild-1",
      guild: null,
      options: {
        getSubcommand: () => "set",
        getString: (name) => (name === "key" ? "modRole" : "Staff"),
      },
      reply: async (payload) => replies.push(payload),
    });
    expect(client.getSettings("guild-1").modRole).toBe("Staff");
    expect(replies[1].content).toBe("modRole set to `Staff`");
  });

  test("reset restores the default and drops the override", async () => {
    const client = settingsClient();
    client.writeSettings("guild-1", { adminRole: "Admins" });
    const command = new Settings(client);
    const replies = [];

    await command.execute({
      guildId: "guild-1",
      guild: { id: "guild-1" },
      options: {
        getSubcommand: () => "reset",
        getString: () => "adminRole",
      },
      reply: async (payload) => replies.push(payload),
    });

    expect(client.getSettings({ id: "guild-1" }).adminRole).toBe("Administrator");
    expect(client.settings.get("guild-1").adminRole).toBeUndefined();
    expect(replies[0].content).toContain("reset to default `Administrator`");
  });
});
