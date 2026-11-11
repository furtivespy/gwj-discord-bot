import { PermissionsBitField } from "discord.js";

const QA_UNLOCK_ADMIN_COMMANDS = "QA_UNLOCK_ADMIN_COMMANDS";
const ADMINISTRATOR_BITS = BigInt(PermissionsBitField.Flags.Administrator);

function isQaUnlockAdminCommands(env = process.env) {
  const raw = env.QA_UNLOCK_ADMIN_COMMANDS;
  if (raw == null || String(raw).trim() === "") return false;
  const normalized = String(raw).trim().toLowerCase();
  if (["false", "off", "0", "no"].includes(normalized)) return false;
  if (["true", "on", "1", "yes"].includes(normalized)) return true;
  return false;
}

function qaUnlockAdminCommandsEnabled(client) {
  return client?.qaUnlockAdminCommands === true;
}

function parsePermissionBits(value) {
  if (value == null || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function stripAdministratorDefaultMemberPermissions(json) {
  if (!json) return json;
  const bits = parsePermissionBits(json.default_member_permissions);
  if (bits == null) return json;
  if ((bits & ADMINISTRATOR_BITS) === 0n) return json;
  const remaining = bits & ~ADMINISTRATOR_BITS;
  json.default_member_permissions = remaining === 0n ? null : String(remaining);
  return json;
}

function commandRegistrationPayload(command, unlockAdminCommands) {
  const json =
    typeof command?.data?.toJSON === "function" ? command.data.toJSON() : {};
  if (unlockAdminCommands) {
    stripAdministratorDefaultMemberPermissions(json);
  }
  return json;
}

export {
  QA_UNLOCK_ADMIN_COMMANDS,
  isQaUnlockAdminCommands,
  qaUnlockAdminCommandsEnabled,
  stripAdministratorDefaultMemberPermissions,
  commandRegistrationPayload,
};
