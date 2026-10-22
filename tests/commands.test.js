import { describe, expect, test } from "bun:test";
import { ChannelType, MessageFlags } from "discord.js";
import Ping from "../src/commands/slash/ping.js";
import VoiceCreate from "../src/commands/slash/voiceCreate.js";
import { FALLBACK_PARENT_ID } from "../src/util/onDemandVoice.js";

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
    const voiceCreate = new VoiceCreate({ logger: silentLogger() });

    expect(ping.data.name).toBe("ping");
    expect(ping.data.description).toBe("Replies with Pong!");
    expect(ping).toBeInstanceOf(Ping);

    expect(voiceCreate.data.name).toBe("voice-create");
    expect(voiceCreate.data.description).toBe("Creates a voice channel");
    expect(voiceCreate).toBeInstanceOf(VoiceCreate);

    const json = voiceCreate.data.toJSON();
    const nameOption = json.options.find((option) => option.name === "name");
    expect(nameOption).toBeDefined();
    expect(nameOption.required).toBe(true);
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

describe("/voice-create", () => {
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
