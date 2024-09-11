module.exports = (botClient, ...eventData) => {
  const [interaction] = eventData;
  if (!interaction.isCommand()) return;
  const command = botClient.slash_commands.get(interaction.commandName);
  if (!command) return;
  try {
    botClient.logger.cmd(interaction.commandName);
    command.execute(interaction, botClient);
  } catch (error) {
    botClient.logger.error(error, "interactionCreate.js");
    return interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
};
