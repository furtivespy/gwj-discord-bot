import { describe, expect, test } from "bun:test";
import permLevels from "../src/config.permissionLevels.js";
import {
  buildLevelCache,
  checkCommandPermission,
  permlevel,
} from "../src/util/permissions.js";

const levelCache = buildLevelCache(permLevels);

const ROLES = {
  mod: { id: "role-mod", name: "Moderator" },
  admin: { id: "role-admin", name: "Administrator" },
};

function roleCache(roles) {
  return {
    find: (predicate) => roles.find(predicate),
  };
}

function memberRoles(roleIds) {
  return {
    cache: { has: (id) => roleIds.includes(id) },
    has: (id) => roleIds.includes(id),
  };
}

function context({
  userId = "user-1",
  ownerId = "owner-1",
  roleIds = [],
  roles = Object.values(ROLES),
  settings = { modRole: "Moderator", adminRole: "Administrator" },
  client = {},
} = {}) {
  return {
    guild: {
      id: "guild-1",
      ownerId,
      roles: { cache: roleCache(roles) },
    },
    member: { roles: memberRoles(roleIds) },
    user: { id: userId },
    author: { id: userId },
    settings,
    client,
  };
}

describe("permission levels", () => {
  test("plain members are User (0)", () => {
    expect(permlevel(permLevels, context())).toBe(0);
  });

  test("a member with the configured mod role is Moderator (2)", () => {
    expect(permlevel(permLevels, context({ roleIds: [ROLES.mod.id] }))).toBe(2);
  });

  test("a member with the configured admin role is Administrator (3)", () => {
    expect(permlevel(permLevels, context({ roleIds: [ROLES.admin.id] }))).toBe(3);
  });

  test("the server owner is Server Owner (4)", () => {
    expect(permlevel(permLevels, context({ userId: "owner-1", ownerId: "owner-1" }))).toBe(
      4
    );
  });

  test("the configured bot owner is Bot Owner (10)", () => {
    expect(
      permlevel(
        permLevels,
        context({
          userId: "boss",
          client: { config: { botOwnerId: "boss" } },
        })
      )
    ).toBe(10);
  });

  test("mod role name is read from guild settings, not a hardcoded string", () => {
    expect(
      permlevel(
        permLevels,
        context({
          roleIds: ["role-custom"],
          roles: [{ id: "role-custom", name: "Night Watch" }],
          settings: { modRole: "Night Watch", adminRole: "Administrator" },
        })
      )
    ).toBe(2);
  });

  test("treats APIInteractionGuildMember.roles as a snowflake array", () => {
    const ctx = context();
    ctx.member = { roles: [ROLES.mod.id] };
    expect(permlevel(permLevels, ctx)).toBe(2);
  });

  test("treats an array of role objects as role ids", () => {
    const ctx = context();
    ctx.member = { roles: [{ id: ROLES.mod.id, name: "Moderator" }] };
    expect(permlevel(permLevels, ctx)).toBe(2);
  });

  test("resolves Bot Owner from application.owner when botOwnerId is unset", () => {
    expect(
      permlevel(
        permLevels,
        context({
          userId: "boss",
          client: { application: { owner: { id: "boss" } } },
        })
      )
    ).toBe(10);
  });

  test("a Team application ownerId is treated as Bot Owner", () => {
    expect(
      permlevel(
        permLevels,
        context({
          userId: "boss",
          client: { application: { owner: { id: "team-1", ownerId: "boss" } } },
        })
      )
    ).toBe(10);
  });
});

describe("command permission checks", () => {
  test("a non-mod cannot run a Moderator command", () => {
    const result = checkCommandPermission({
      permLevels,
      levelCache,
      context: context(),
      command: { conf: { permLevel: "Moderator" } },
    });
    expect(result.allowed).toBe(false);
    expect(result.level).toBe(0);
    expect(result.required).toBe(2);
    expect(result.requiredName).toBe("Moderator");
    expect(result.message).toContain("permission");
  });

  test("a mod can run a Moderator command but not an Administrator command", () => {
    const ctx = context({ roleIds: [ROLES.mod.id] });
    const modOk = checkCommandPermission({
      permLevels,
      levelCache,
      context: ctx,
      command: { conf: { permLevel: "Moderator" } },
    });
    const adminDenied = checkCommandPermission({
      permLevels,
      levelCache,
      context: ctx,
      command: { conf: { permLevel: "Administrator" } },
    });
    expect(modOk.allowed).toBe(true);
    expect(adminDenied.allowed).toBe(false);
    expect(adminDenied.level).toBe(2);
    expect(adminDenied.required).toBe(3);
  });

  test("User-level commands are allowed for everyone", () => {
    const result = checkCommandPermission({
      permLevels,
      levelCache,
      context: context(),
      command: { conf: { permLevel: "User" } },
    });
    expect(result.allowed).toBe(true);
  });

  test("an unknown permLevel name does not collapse to User", () => {
    const result = checkCommandPermission({
      permLevels,
      levelCache,
      context: context(),
      command: { conf: { permLevel: "Administrater" } },
    });
    expect(result.allowed).toBe(false);
    expect(result.required).toBe(Number.POSITIVE_INFINITY);
  });
});
