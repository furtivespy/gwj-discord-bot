import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import SlashCommand from "../../base/SlashCommand.js";

const PING_AGAIN_ID = "ping:again";

class Ping extends SlashCommand {
  constructor(client) {
    super(client, {
      name: "ping",
      description: "Replies with Pong!",
      usage: "/ping",
      enabled: true,
      permLevel: "User",
    });
    this.data = new SlashCommandBuilder()
      .setName(this.help.name)
      .setDescription(this.help.description);
  }

  async execute(interaction) {
    const client = this.client || interaction.client;

    console.log(client.user.displayAvatarURL().split(".").pop());
    console.log(interaction.user.displayAvatarURL().split(".").pop());

    const embed = new EmbedBuilder()
      .setTitle(`PONG!`)
      .setDescription("This is a EMBED ping Test")
      .setColor(0xfa03ca)
      .setImage(client.user.displayAvatarURL())
      .setThumbnail(client.user.displayAvatarURL())
      .setTimestamp(Date.now())
      .setAuthor({
        url: `https://www.twitch.tv/x333en`,
        iconURL: interaction.user.displayAvatarURL(),
        name: interaction.user.tag,
      })
      .setFooter({
        iconURL: client.user.displayAvatarURL(),
        text: client.user.tag,
      })
      .setURL(`https://discord.gg/8YtDhpbCJf`)
      .addFields([
        {
          name: `Field 1`,
          value: `Field Value 1`,
          inline: true,
        },
        {
          name: `Field 2`,
          value: `Field value 2`,
          inline: true,
        },
      ]);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PING_AGAIN_ID)
        .setLabel("Again")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "Pong!",
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  async button(interaction) {
    await interaction.reply({
      content: "Pong again!",
      flags: MessageFlags.Ephemeral,
    });
  }
}

Ping.PING_AGAIN_ID = PING_AGAIN_ID;
export default Ping;
