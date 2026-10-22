function roleCollection(manager) {
  if (!manager) return null;
  return manager.cache || manager;
}

function findRoleByName(guild, roleName) {
  if (!guild || roleName == null || roleName === "") return null;
  const roles = roleCollection(guild.roles);
  if (!roles || typeof roles.find !== "function") return null;
  const wanted = String(roleName).toLowerCase();
  return roles.find((role) => String(role.name).toLowerCase() === wanted) || null;
}

function memberHasRole(member, roleId) {
  if (!member || roleId == null || roleId === "") return false;
  const wanted = String(roleId);
  const roles = member.roles;
  if (!roles) return false;
  if (Array.isArray(roles)) {
    return roles.map(String).includes(wanted);
  }
  const cache = roleCollection(roles) || roles;
  if (Array.isArray(cache)) {
    return cache.some((role) => String(role?.id ?? role) === wanted);
  }
  if (typeof cache.has === "function") {
    return cache.has(roleId) || cache.has(wanted);
  }
  return false;
}

function hasNamedRole(context, settingKey) {
  try {
    const role = findRoleByName(context.guild, context.settings?.[settingKey]);
    return Boolean(role && memberHasRole(context.member, role.id));
  } catch {
    return false;
  }
}

function userIdFrom(context) {
  return context.user?.id || context.author?.id;
}

// Game Bot's permission ladder, updated for discord.js v14 Collections
// (`roles.cache`) and slash-command interactions (`user` instead of `author`).
module.exports = [
  {
    level: 0,
    name: "User",
    check: () => true,
  },

  {
    level: 2,
    name: "Moderator",
    check: (context) => hasNamedRole(context, "modRole"),
  },

  {
    level: 3,
    name: "Administrator",
    check: (context) => hasNamedRole(context, "adminRole"),
  },

  {
    level: 4,
    name: "Server Owner",
    check: (context) => {
      const userId = userIdFrom(context);
      return Boolean(context.guild && userId && context.guild.ownerId === userId);
    },
  },

  {
    level: 8,
    name: "Bot Support",
    check: () => false,
  },

  {
    level: 9,
    name: "Bot Admin",
    check: () => false,
  },

  {
    level: 10,
    name: "Bot Owner",
    check: (context) => {
      const userId = userIdFrom(context);
      const ownerId =
        context.client?.config?.botOwnerId ||
        context.client?.appInfo?.owner?.id ||
        context.client?.application?.owner?.id;
      return Boolean(ownerId && userId && ownerId === userId);
    },
  },
];
