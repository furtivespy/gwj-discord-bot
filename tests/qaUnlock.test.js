import { describe, expect, test } from "bun:test";
import { Collection, MessageFlags, PermissionsBitField } from "discord.js";
import permLevels from "../src/config.permissionLevels.js";
import Settings from "../src/commands/slash/settings.js";
import { routeInteraction } from "../src/handlers/interactionRouter.js";
import { registerSlashCommands } from "../src/handlers/slashcommands.js";
import {
  buildLevelCache,
  checkCommandPermission,
} from "../src/util/permissions.js";
import {
  QA_UNLOCK_ADMIN_COMMANDS,
  commandRegistrationPayload,
  isQaUnlockAdminCommands,
  qaUnlockAdminCommandsEnabled,
  stripAdministratorDefaultMemberPermissions,
} from "../src/util/qaUnlock.js";

const ADMINISTRATOR = String(PermissionsBitField.Flags.Administrator);
const MANAGE_MESSAGES = String(PermissionsBitField.Flags.ManageMessages);
const levelCache = buildLevelCache(permLevels);

function silentLogger() {
  const warnings = [];
  return {
    warnings,
    info() {},
    error() {},
    warn(content) {
      warnings.push(content);
    },
    debug() {},
    cmd() {},
    ready() {},
    time() {},
    log() {},
  };
}

function stubClient() {
  return { logger: silentLogger() };
}

function permissionContext({
  userId = "qa-1",
  ownerId = "owner-1",
  roleIds = [],
  client = {},
} = {}) {
  return {
    guild: {
      id: "guild-1",
      ownerId,
      roles: { cache: { find: () => null } },
    },
    member: {
      roles: {
        cache: { has: (id) => roleIds.includes(id) },
        has: (id) => roleIds.includes(id),
      },
    },
    user: { id: userId },
    author: { id: userId },
    settings: { modRole: "Moderator", adminRole: "Administrator" },
    client,
  };
}

describe("isQaUnlockAdminCommands", () => {
  test("is off when the env var is unset, empty, or 0", () => {
    expect(isQaUnlockAdminCommands({})).toBe(false);
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "" })).toBe(false);
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "   " })).toBe(
      false
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "0" })).toBe(
      false
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "false" })).toBe(
      false
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "off" })).toBe(
      false
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "no" })).toBe(
      false
    );
  });

  test("is on when the env var is 1 or true", () => {
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "1" })).toBe(true);
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "true" })).toBe(
      true
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "TRUE" })).toBe(
      true
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "yes" })).toBe(
      true
    );
    expect(isQaUnlockAdminCommands({ [QA_UNLOCK_ADMIN_COMMANDS]: "on" })).toBe(
      true
    );
  });
});

describe("stripAdministratorDefaultMemberPermissions", () => {
  test("clears Administrator-only defaultMemberPermissions", () => {
    const json = { default_member_permissions: ADMINISTRATOR };
    stripAdministratorDefaultMemberPermissions(json);
    expect(json.default_member_permissions).toBeNull();
  });

  test("leaves ManageMessages and other non-admin gates alone", () => {
    const json = { default_member_permissions: MANAGE_MESSAGES };
    stripAdministratorDefaultMemberPermissions(json);
    expect(json.default_member_permissions).toBe(MANAGE_MESSAGES);
  });

  test("removes only the Administrator bit from a combined permission", () => {
    const combined = String(
      PermissionsBitField.Flags.Administrator |
        PermissionsBitField.Flags.ManageMessages
    );
    const json = { default_member_permissions: combined };
    stripAdministratorDefaultMemberPermissions(json);
    expect(json.default_member_permissions).toBe(MANAGE_MESSAGES);
  });
});

describe("commandRegistrationPayload", () => {
  test("strips Administrator from /settings when unlocked and leaves the builder unchanged", () => {
    const command = new Settings(stubClient());
    const unlocked = commandRegistrationPayload(command, true);
    const locked = commandRegistrationPayload(command, false);

    expect(unlocked.default_member_permissions).toBeNull();
    expect(locked.default_member_permissions).toBe(ADMINISTRATOR);
    expect(command.data.toJSON().default_member_permissions).toBe(ADMINISTRATOR);
  });
});

describe("runtime administrator checks", () => {
  test("skips Administrator permLevel when unlocked and keeps it when unset", () => {
    const qa = permissionContext();
    const locked = checkCommandPermission({
      permLevels,
      levelCache,
      context: qa,
      command: { conf: { permLevel: "Administrator" } },
      unlockAdminCommands: false,
    });
    const unlocked = checkCommandPermission({
      permLevels,
      levelCache,
      context: qa,
      command: { conf: { permLevel: "Administrator" } },
      unlockAdminCommands: true,
    });

    expect(qaUnlockAdminCommandsEnabled({})).toBe(false);
    expect(qaUnlockAdminCommandsEnabled({ qaUnlockAdminCommands: true })).toBe(
      true
    );
    expect(locked.allowed).toBe(false);
    expect(locked.requiredName).toBe("Administrator");
    expect(unlocked.allowed).toBe(true);
    expect(unlocked.requiredName).toBe("Administrator");
    expect(unlocked.level).toBe(0);
  });

  test("does not weaken bot-owner checks when unlocked", () => {
    const result = checkCommandPermission({
      permLevels,
      levelCache,
      context: permissionContext({ userId: "qa-1" }),
      command: { conf: { permLevel: "Bot Owner" } },
      unlockAdminCommands: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.requiredName).toBe("Bot Owner");
  });
});

describe("interaction router with QA_UNLOCK_ADMIN_COMMANDS", () => {
  function permissionClient({ unlock = false } = {}) {
    const collection = new Collection();
    collection.set("settings", {
      conf: { permLevel: "Administrator" },
      async execute(interaction) {
        await interaction.reply({ content: "settings-ok" });
      },
    });
    collection.set("owner-only", {
      conf: { permLevel: "Bot Owner" },
      async execute(interaction) {
        await interaction.reply({ content: "owner-ok" });
      },
    });
    return {
      slash_commands: collection,
      logger: silentLogger(),
      permLevels,
      levelCache,
      qaUnlockAdminCommands: unlock,
      getSettings() {
        return { modRole: "Moderator", adminRole: "Administrator" };
      },
    };
  }

  function chatInput(commandName, replies) {
    return {
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
      guild: {
        id: "guild-1",
        ownerId: "owner-1",
        roles: { cache: { find: () => null } },
      },
      member: {
        roles: {
          cache: { has: () => false },
          has: () => false,
        },
      },
      user: { id: "qa-1" },
      options: { getSubcommand: () => null },
      reply: async (payload) => {
        replies.push(payload);
      },
    };
  }

  test("lets a non-admin run /settings when unlocked", async () => {
    const replies = [];
    const result = await routeInteraction(
      permissionClient({ unlock: true }),
      chatInput("settings", replies)
    );
    expect(result.denied).toBeUndefined();
    expect(replies).toEqual([{ content: "settings-ok" }]);
  });

  test("still rejects a non-admin when the env override is unset", async () => {
    const replies = [];
    const result = await routeInteraction(
      permissionClient({ unlock: false }),
      chatInput("settings", replies)
    );
    expect(result.denied).toBe(true);
    expect(replies[0].content).toContain("permission");
    expect(replies[0].flags).toBe(MessageFlags.Ephemeral);
  });

  test("still rejects a non-owner from a Bot Owner command when unlocked", async () => {
    const replies = [];
    const result = await routeInteraction(
      permissionClient({ unlock: true }),
      chatInput("owner-only", replies)
    );
    expect(result.denied).toBe(true);
    expect(replies[0].content).toContain("Bot Owner");
  });
});

describe("slash command registration with QA_UNLOCK_ADMIN_COMMANDS", () => {
  test("unset keeps /settings Administrator; set strips it and warns", async () => {
    const command = new Settings(stubClient());
    const restPuts = [];
    const lockedLogger = silentLogger();
    const unlockedLogger = silentLogger();
    const rest = {
      async put(_route, payload) {
        restPuts.push(payload.body);
      },
    };

    await registerSlashCommands(
      {
        logger: lockedLogger,
        config: { token: "t", clientId: "client-1", environment: "production" },
      },
      [command],
      { rest, env: {} }
    );
    await registerSlashCommands(
      {
        logger: unlockedLogger,
        config: { token: "t", clientId: "client-1", environment: "production" },
      },
      [command],
      { rest, env: { [QA_UNLOCK_ADMIN_COMMANDS]: "1" } }
    );

    expect(restPuts[0][0].default_member_permissions).toBe(ADMINISTRATOR);
    expect(restPuts[1][0].default_member_permissions).toBeNull();
    expect(command.data.toJSON().default_member_permissions).toBe(ADMINISTRATOR);
    expect(lockedLogger.warnings).toEqual([]);
    expect(
      unlockedLogger.warnings.some((line) =>
        String(line).includes("QA_UNLOCK_ADMIN_COMMANDS")
      )
    ).toBe(true);
  });
});
