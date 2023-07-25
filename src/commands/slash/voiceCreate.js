const {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");

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
      const guildCategory = "on-demand voice";
      interaction.client.logger.info(`trying to create voice channel ${name} `);

      const category = interaction.guild.channels.cache.find(
        (c) =>
          c.name.toLowerCase() == `${guildCategory}` &&
          c.type == ChannelType.GuildCategory
      );
      interaction.client.logger.error(
        `error finding category ${guildCategory}`,
        "voiceCreate.js"
      );

      interaction.client.logger.info(`category found?`, "voiceCreate.js");
      interaction.client.logger.info(
        `trying to create voice channel ${name} in ${category?.name}[${category?.id}] `,
        "voiceCreate.js"
      );

      const channel = await interaction.guild.channels.create({
        name: name,
        type: ChannelType.GuildVoice,
      });

      interaction.client.logger.info(
        `created voice channel ${name} in ${category?.name}`,
        "voiceCreate.js"
      );
      if (category) await channel.setParent(category.id);

      await interaction.reply({
        content: `Created ${channel} - Click to hop in!`,
        ephemeral: true,
      });
    } catch (error) {
      interaction.client.logger.error(error, "voiceCreate.js");
    }
  },
};
