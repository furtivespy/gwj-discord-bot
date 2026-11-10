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

// Discord channel names are 1-100 characters (API error 50035 when longer).
const CHANNEL_NAME_MAX_LENGTH = 100;
const NAME_TOO_LONG = `Channel names must be ${CHANNEL_NAME_MAX_LENGTH} characters or fewer.`;
const CREATE_FAILED = "Couldn't create that voice channel.";

async function replyEphemeral(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    if (typeof interaction.editReply === "function") {
      await interaction.editReply({ content });
    }
    return;
  }
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}

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
          .setMaxLength(CHANNEL_NAME_MAX_LENGTH)
      );
  }

  async execute(interaction) {
    try {
      const name = interaction.options.getString("name");
      if (typeof name !== "string" || name.length > CHANNEL_NAME_MAX_LENGTH) {
        await replyEphemeral(interaction, NAME_TOO_LONG);
        return;
      }

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

      await replyEphemeral(
        interaction,
        `Created ${channel} - Click to hop in!`
      );
    } catch (error) {
      interaction.client.logger.error(error, "voiceCreate.js");
      try {
        await replyEphemeral(interaction, CREATE_FAILED);
      } catch (replyError) {
        interaction.client.logger.error(replyError, "voiceCreate.js");
      }
    }
  }
}

VoiceCreate.CHANNEL_NAME_MAX_LENGTH = CHANNEL_NAME_MAX_LENGTH;
VoiceCreate.NAME_TOO_LONG = NAME_TOO_LONG;
VoiceCreate.CREATE_FAILED = CREATE_FAILED;
export default VoiceCreate;
