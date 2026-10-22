function roleCollection(manager) {
  if (!manager) return null;
  return manager.cache || manager;
}

function findRoleByName(guild, roleName) {
  if (!guild || !roleName) return null;
  const roles = roleCollection(guild.roles);
  if (!roles || typeof roles.find !== "function") return null;
  const wanted = String(roleName).toLowerCase();
  return roles.find((role) => String(role.name).toLowerCase() === wanted) || null;
}

function memberHasRole(member, roleId) {
  if (!member || !roleId) return false;
  const roles = roleCollection(member.roles) || member.roles;
  if (roles && typeof roles.has === "function") {
    return roles.has(roleId);
  }
  return false;
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
    check: (context) => {
      try {
        const modRole = findRoleByName(context.guild, context.settings?.modRole);
        return Boolean(modRole && memberHasRole(context.member, modRole.id));
      } catch {
        return false;
      }
    },
  },

  {
    level: 3,
    name: "Administrator",
    check: (context) => {
      try {
        const adminRole = findRoleByName(context.guild, context.settings?.adminRole);
        return Boolean(adminRole && memberHasRole(context.member, adminRole.id));
      } catch {
        return false;
      }
    },
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
        context.client?.config?.botOwnerId || context.client?.appInfo?.owner?.id;
      return Boolean(ownerId && userId && ownerId === userId);
    },
  },
];
