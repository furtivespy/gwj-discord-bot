const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const {
  findOnDemandCategory,
  resolveOnDemandParent,
} = require("../../util/onDemandVoice");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voice-create")
    .setDescription("Creates a voice channel")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name of the channel")
        .setRequired(true)
    ),
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
  },
};
