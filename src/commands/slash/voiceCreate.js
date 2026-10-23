import {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
} from "discord.js";
import SlashCommand from "../../base/SlashCommand.js";
import {
  findOnDemandCategory,
  resolveOnDemandParent,
} from "../../util/onDemandVoice.js";

// Sample on-demand voice feature. Delete this file together with
// src/events/voiceStateUpdate.js (and optionally src/util/onDemandVoice.js)
// when cloning Stancy as a starter bot. Nothing else in src/ imports them.

class VoiceCreate extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "voice-create",
      description: "Creates a voice channel",
      usage: "/voice-create name:<channel name>",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description)
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("The name of the channel")
          .setRequired(true)
      );
  }

  async execute(interaction) {
    try {
      const name = interaction.options.getString("name");
      interaction.client.logger.info(`trying to create voice channel ${name} `);

      const category = findOnDemandCategory(interaction.guild.channels.cache);

      interaction.client.logger.info(
        `trying to create voice channel ${name} in ${category?.name}[${category?.id}] `,
        "voiceCreate.js"
      );

      const channel = await interaction.guild.channels.create({
        name: name,
        type: ChannelType.GuildVoice,
        parent: resolveOnDemandParent(interaction.guild.channels.cache),
      });

      interaction.client.logger.info(
        `created voice channel ${name} in ${category?.name}`,
        "voiceCreate.js"
      );

      await interaction.reply({
        content: `Created ${channel} - Click to hop in!`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      interaction.client.logger.error(error, "voiceCreate.js");
    }
  }
}

export default VoiceCreate;
