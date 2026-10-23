import {
  SlashCommandBuilder,
  PermissionsBitField,
  MessageFlags,
} from "discord.js";
import SlashCommand from "../../base/SlashCommand.js";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  guildFromInteraction,
  isKnownSettingKey,
} from "../../util/settings.js";

function addKeyOption(option, description) {
  return option
    .setName("key")
    .setDescription(description)
    .setRequired(true)
    .addChoices(...SETTINGS_KEYS.map((key) => ({ name: key, value: key })));
}

class Settings extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "settings",
      description: "View or change this server's bot settings",
      usage: "/settings show",
      enabled: true,
      permLevel: "Administrator",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand.setName("show").setDescription("Show all guild settings")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("get")
          .setDescription("Show one setting")
          .addStringOption((option) => addKeyOption(option, "Setting to view"))
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("Override a setting for this server")
          .addStringOption((option) => addKeyOption(option, "Setting to change"))
          .addStringOption((option) =>
            option
              .setName("value")
              .setDescription("New value")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("reset")
          .setDescription("Reset a setting to the bot default")
          .addStringOption((option) => addKeyOption(option, "Setting to reset"))
      );
  }

  formatSettings(settings) {
    return SETTINGS_KEYS.map((key) => `${key}: \`${settings[key]}\``).join("\n");
  }

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "Use /settings in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guild = guildFromInteraction(interaction);
    const settings = this.client.getSettings(guild);
    const defaults = this.client.settings?.get("default") || DEFAULT_SETTINGS;

    if (subcommand === "show") {
      await interaction.reply({
        content: `**Guild settings**\n${this.formatSettings(settings)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const key = interaction.options.getString("key");
    if (!isKnownSettingKey(key)) {
      await interaction.reply({
        content: `Unknown setting \`${key}\`. Known keys: ${SETTINGS_KEYS.join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "get") {
      await interaction.reply({
        content: `${key} is currently \`${settings[key]}\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "set") {
      const value = interaction.options.getString("value");
      if (value === settings[key]) {
        await interaction.reply({
          content: `${key} already has that value.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      this.client.writeSettings(interaction.guildId, { [key]: value });
      await interaction.reply({
        content: `${key} set to \`${value}\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "reset") {
      this.client.writeSettings(interaction.guildId, { [key]: defaults[key] });
      await interaction.reply({
        content: `${key} reset to default \`${defaults[key]}\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: "Unknown settings action.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export default Settings;
