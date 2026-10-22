import { describe, expect, test } from "bun:test";
import { Collection, MessageFlags } from "discord.js";
import permLevels from "../src/config.permissionLevels.js";
import {
  BUTTON_ERROR,
  COMMAND_ERROR,
  MODAL_ERROR,
  SELECT_ERROR,
  commandNameFromCustomId,
  findCommandByCustomId,
  routeInteraction,
} from "../src/handlers/interactionRouter.js";
import { buildLevelCache, permlevel } from "../src/util/permissions.js";
import { DEFAULT_SETTINGS } from "../src/util/settings.js";

function silentLogger() {
  const timing = [];
  const errors = [];
  return {
    timing,
    errors,
    info() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
    time(line) {
      timing.push(line);
    },
    error(err) {
      errors.push(err);
    },
  };
}

function baseInteraction(overrides = {}) {
  return {
    isCommand: () => false,
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isButton: () => false,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    deferred: false,
    replied: false,
    createdTimestamp: Date.now() - 12,
    commandName: undefined,
    customId: undefined,
    options: { getSubcommand: () => null },
    user: { id: "user-1" },
    guildId: "guild-1",
    reply: async () => {},
    deferReply: async () => {},
    editReply: async () => {},
    ...overrides,
  };
}

function clientWithCommands(commands, logger = silentLogger(), extras = {}) {
  const collection = new Collection();
  for (const [name, command] of Object.entries(commands)) {
    collection.set(name, command);
  }
  return { slash_commands: collection, logger, ...extras };
}

function permissionClient(commands, logger = silentLogger(), guildStore = {}) {
  const levelCache = buildLevelCache(permLevels);
  return clientWithCommands(commands, logger, {
    permLevels,
    levelCache,
    permlevel(context) {
      return permlevel(permLevels, context);
    },
    getSettings(guild) {
      const id = guild?.id ?? guild;
      return { ...DEFAULT_SETTINGS, ...(guildStore[id] || {}) };
    },
  });
}

function memberWithRoles(roleIds = []) {
  return {
    roles: {
      cache: { has: (id) => roleIds.includes(id) },
      has: (id) => roleIds.includes(id),
    },
  };
}

function guildWithRoles(roles = [{ id: "role-mod", name: "Moderator" }]) {
  return {
    id: "guild-1",
    ownerId: "owner-1",
    roles: {
      cache: {
        find: (predicate) => roles.find(predicate),
      },
    },
  };
}

describe("customId prefix routing", () => {
  test("uses the segment before the first colon as the command name", () => {
    expect(commandNameFromCustomId("ping:again")).toBe("ping");
    expect(commandNameFromCustomId("drop:in:123")).toBe("drop");
    expect(commandNameFromCustomId("voice-create")).toBe("voice-create");
  });

  test("finds the owning command by customId prefix", () => {
    const commands = new Collection();
    const ping = { name: "ping" };
    const drop = { name: "drop" };
    commands.set("ping", ping);
    commands.set("drop", drop);

    expect(findCommandByCustomId(commands, "ping:again")).toBe(ping);
    expect(findCommandByCustomId(commands, "drop:in")).toBe(drop);
    expect(findCommandByCustomId(commands, "unknown:x")).toBeNull();
  });
});

describe("interaction router", () => {
  test("routes slash commands and logs handler timing", async () => {
    const executed = [];
    const logger = silentLogger();
    const client = clientWithCommands(
      {
        ping: {
          async execute(interaction) {
            executed.push(interaction.commandName);
          },
        },
      },
      logger
    );

    const result = await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "ping",
      })
    );

    expect(result.handled).toBe(true);
    expect(executed).toEqual(["ping"]);
    expect(logger.timing[0]).toMatch(/^Slash \/ping \| inbound \d+ms \| handler \d+ms$/);
  });

  test("routes autocomplete to the command", async () => {
    const seen = [];
    const client = clientWithCommands({
      ping: {
        async autocomplete(interaction) {
          seen.push(interaction.commandName);
        },
      },
    });

    await routeInteraction(
      client,
      baseInteraction({
        isAutocomplete: () => true,
        commandName: "ping",
      })
    );

    expect(seen).toEqual(["ping"]);
  });

  test("routes buttons, select menus, and modals by customId prefix", async () => {
    const seen = [];
    const client = clientWithCommands({
      ping: {
        async button(interaction) {
          seen.push(`button:${interaction.customId}`);
        },
        async selectMenu(interaction) {
          seen.push(`select:${interaction.customId}`);
        },
        async modal(interaction) {
          seen.push(`modal:${interaction.customId}`);
        },
      },
    });

    await routeInteraction(
      client,
      baseInteraction({
        isButton: () => true,
        customId: "ping:again",
      })
    );
    await routeInteraction(
      client,
      baseInteraction({
        isAnySelectMenu: () => true,
        customId: "ping:choice",
      })
    );
    await routeInteraction(
      client,
      baseInteraction({
        isModalSubmit: () => true,
        customId: "ping:modal",
      })
    );

    expect(seen).toEqual([
      "button:ping:again",
      "select:ping:choice",
      "modal:ping:modal",
    ]);
  });

  test("ignores unknown commands and customIds", async () => {
    const client = clientWithCommands({});
    const missed = await routeInteraction(
      client,
      baseInteraction({ isCommand: () => true, commandName: "nope" })
    );
    const unknownButton = await routeInteraction(
      client,
      baseInteraction({ isButton: () => true, customId: "nope:x" })
    );

    expect(missed.handled).toBe(false);
    expect(unknownButton.handled).toBe(false);
  });

  test("replies ephemerally when a slash command throws", async () => {
    const replies = [];
    const client = clientWithCommands({
      ping: {
        async execute() {
          throw new Error("boom");
        },
      },
    });

    const result = await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "ping",
        reply: async (payload) => {
          replies.push(payload);
        },
      })
    );

    expect(result.handled).toBe(true);
    expect(result.error.message).toBe("boom");
    expect(replies).toEqual([
      {
        content: COMMAND_ERROR,
        flags: MessageFlags.Ephemeral,
      },
    ]);
  });

  test("uses editReply when a button error happens after defer", async () => {
    const edits = [];
    const client = clientWithCommands({
      ping: {
        async button() {
          throw new Error("click failed");
        },
      },
    });

    await routeInteraction(
      client,
      baseInteraction({
        isButton: () => true,
        customId: "ping:again",
        deferred: true,
        editReply: async (payload) => {
          edits.push(payload);
        },
      })
    );

    expect(edits).toEqual([{ content: BUTTON_ERROR }]);
  });

  test("uses the matching ephemeral error copy for selects and modals", async () => {
    const replies = [];
    const client = clientWithCommands({
      ping: {
        async selectMenu() {
          throw new Error("select failed");
        },
        async modal() {
          throw new Error("modal failed");
        },
      },
    });

    await routeInteraction(
      client,
      baseInteraction({
        isAnySelectMenu: () => true,
        customId: "ping:choice",
        reply: async (payload) => replies.push(payload),
      })
    );
    await routeInteraction(
      client,
      baseInteraction({
        isModalSubmit: () => true,
        customId: "ping:modal",
        reply: async (payload) => replies.push(payload),
      })
    );

    expect(replies[0]).toEqual({
      content: SELECT_ERROR,
      flags: MessageFlags.Ephemeral,
    });
    expect(replies[1]).toEqual({
      content: MODAL_ERROR,
      flags: MessageFlags.Ephemeral,
    });
  });

  test("denies a non-mod running a Moderator command", async () => {
    const executed = [];
    const replies = [];
    const client = permissionClient({
      lock: {
        conf: { permLevel: "Moderator" },
        async execute() {
          executed.push("ran");
        },
      },
    });

    const result = await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "lock",
        guild: guildWithRoles(),
        member: memberWithRoles(),
        user: { id: "user-1" },
        reply: async (payload) => replies.push(payload),
      })
    );

    expect(result.denied).toBe(true);
    expect(executed).toEqual([]);
    expect(replies[0].content).toContain("permission");
    expect(replies[0].flags).toBe(MessageFlags.Ephemeral);
  });

  test("allows a mod to run a Moderator command", async () => {
    const executed = [];
    const client = permissionClient({
      lock: {
        conf: { permLevel: "Moderator" },
        async execute() {
          executed.push("ran");
        },
      },
    });

    const result = await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "lock",
        guild: guildWithRoles(),
        member: memberWithRoles(["role-mod"]),
        user: { id: "user-1" },
      })
    );

    expect(result.denied).toBeUndefined();
    expect(result.handled).toBe(true);
    expect(executed).toEqual(["ran"]);
  });

  test("acks denied slash interactions when systemNotice is false", async () => {
    const replies = [];
    const defers = [];
    const deletes = [];
    const client = permissionClient({
      lock: {
        conf: { permLevel: "Moderator" },
        async execute() {},
      },
    });
    client.getSettings = () => ({ ...DEFAULT_SETTINGS, systemNotice: false });

    const result = await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "lock",
        guild: guildWithRoles(),
        member: memberWithRoles(),
        reply: async (payload) => replies.push(payload),
        deferReply: async (payload) => defers.push(payload),
        deleteReply: async () => {
          deletes.push("deleted");
        },
      })
    );

    expect(result.denied).toBe(true);
    expect(replies).toEqual([]);
    expect(defers).toEqual([{ flags: MessageFlags.Ephemeral }]);
    expect(deletes).toEqual(["deleted"]);
  });

  test("loads guild settings from guildId when interaction.guild is missing", async () => {
    const seen = [];
    const client = permissionClient(
      {
        ping: {
          conf: { permLevel: "User" },
          async execute(interaction) {
            seen.push(interaction.settings.modRole);
          },
        },
      },
      silentLogger(),
      { "guild-1": { modRole: "Night Watch" } }
    );

    await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "ping",
        guild: null,
        guildId: "guild-1",
      })
    );

    expect(seen).toEqual(["Night Watch"]);
  });

  test("allows a mod whose roles arrived as a snowflake array", async () => {
    const executed = [];
    const client = permissionClient({
      lock: {
        conf: { permLevel: "Moderator" },
        async execute() {
          executed.push("ran");
        },
      },
    });

    const result = await routeInteraction(
      client,
      baseInteraction({
        isCommand: () => true,
        commandName: "lock",
        guild: guildWithRoles(),
        member: { roles: ["role-mod"] },
        user: { id: "user-1" },
      })
    );

    expect(result.denied).toBeUndefined();
    expect(executed).toEqual(["ran"]);
  });
});
