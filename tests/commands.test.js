import { describe, expect, test } from "bun:test";
import { ChannelType, MessageFlags } from "discord.js";
import ping from "../src/commands/slash/ping.js";
import voiceCreate from "../src/commands/slash/voiceCreate.js";
import { FALLBACK_PARENT_ID } from "../src/util/onDemandVoice.js";

function silentLogger() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
  };
}

describe("slash command modules", () => {
  test("load without a Discord token and expose slash metadata", () => {
    expect(ping.data.name).toBe("ping");
    expect(ping.data.description).toBe("Replies with Pong!");

    expect(voiceCreate.data.name).toBe("voice-create");
    expect(voiceCreate.data.description).toBe("Creates a voice channel");

    const json = voiceCreate.data.toJSON();
    const nameOption = json.options.find((option) => option.name === "name");
    expect(nameOption).toBeDefined();
    expect(nameOption.required).toBe(true);
  });
});

describe("/voice-create", () => {
  test("creates a GuildVoice channel under the on-demand category", async () => {
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
