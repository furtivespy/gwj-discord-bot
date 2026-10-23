import { SlashCommandBuilder, MessageFlags } from "discord.js";
import SlashCommand from "../../base/SlashCommand.js";
import { version } from "../../../package.json" with { type: "json" };

function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${remaining}s`);
  return parts.join(" ");
}

function buildStatusLines({
  version: packageVersion = version,
  uptimeSeconds,
  serverCount,
} = {}) {
  return [
    `Version: ${packageVersion}`,
    `Uptime: ${formatUptime(uptimeSeconds)}`,
    `Servers: ${serverCount ?? 0}`,
  ].join("\n");
}

function resolveStatusClient(commandClient, interaction) {
  if (commandClient?.guilds?.cache) return commandClient;
  if (interaction?.client?.guilds?.cache) return interaction.client;
  return commandClient || interaction?.client;
}

class Status extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "status",
      description: "Shows bot uptime, version, and server count",
      usage: "/status",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description);
  }

  async execute(interaction) {
    const client = resolveStatusClient(this.client, interaction);
    const content = buildStatusLines({
      version,
      uptimeSeconds: process.uptime(),
      serverCount: client?.guilds?.cache?.size ?? 0,
    });

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  }
}

Status.formatUptime = formatUptime;
Status.buildStatusLines = buildStatusLines;
Status.resolveStatusClient = resolveStatusClient;
Status.version = version;
export default Status;
