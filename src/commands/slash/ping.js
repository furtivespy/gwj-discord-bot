const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  async execute(interaction, client) {

    console.log(client.user.displayAvatarURL().split(".").pop());
    console.log(interaction.user.displayAvatarURL().split(".").pop());

    const embed = new EmbedBuilder()
            .setTitle(`PONG!`)
            .setDescription('This is a EMBED ping Test')
            .setColor(0xFA03CA)
            .setImage(client.user.displayAvatarURL())
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp(Date.now())
            .setAuthor({
                url: `https://www.twitch.tv/x333en`,
                iconURL: interaction.user.displayAvatarURL(),
                name: interaction.user.tag
            })
            .setFooter({
                iconURL: client.user.displayAvatarURL(),
                text: client.user.tag
            })
            .setURL(`https://discord.gg/8YtDhpbCJf`)
            .addFields([
                {
                    name: `Field 1`,
                    value: `Field Value 1`,
                    inline: true
                },
                {
                    name: `Field 2`,
                    value: `Field value 2`,
                    inline: true
                }
            ]);

    await interaction.reply({content: "Pong!", embeds: [embed], ephemeral: true});
  },
};
