const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require("discord.js");

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
    const name = interaction.options.getString("name");
    const guildCategory = "on-demand voice";
    const category = interaction.guild.channels.cache.find(
      (c) => c.name.toLowerCase() == `${guildCategory}` && c.type == ChannelType.GuildCategory
    );

    interaction.client.logger.info(`trying to create voice channel ${name}`, "voiceCreate.js");
    const channel = await interaction.guild.channels.create({
      name: name,
      type: ChannelType.GuildVoice,
    });
    interaction.client.logger.info("created voice channel", "voiceCreate.js");
    if (category) channel.setParent(category.id);

    await interaction.reply({ content: `Created ${channel} - Click to hop in!`, ephemeral: true });
  },
};
