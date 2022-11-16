const fs = require("fs");
const path = require("path");
const {
  REST,
  Routes
} = require("discord.js");

module.exports = (botClient) => {
  botClient.logger.info("Loading Slash Commands", "slashcommands.js");

  let commands = [];

  const slashCommandsPath = path.join(__dirname, "../commands/slash");
  fs.readdirSync(slashCommandsPath).forEach((file) => {
    if (!file.endsWith(".js")) return;
    let commandName = file.split(".")[0];
    botClient.logger.info(`Loading Slash Command File: ${commandName}`, "slashcommands.js");
    try {
      const command = require(`../commands/slash/${file}`);

      commands.push(command.data.toJSON());
      botClient.slash_commands.set(command.data.name, command);
    } catch (err) {
      botClient.logger.error(err, "slashcommands.js");
    } 
  });

  //Deploy Commands
  const rest = new REST({ version: "10" }).setToken(botClient.config.token);

  if (botClient.config.environment === "development") {
    //Test Server
    rest
      .put(
        Routes.applicationGuildCommands(
          botClient.config.clientId,
          "545109131330191371"
        ),
        { body: commands }
      )
      .then(() =>
        botClient.logger.info("Successfully registered commands in Development", "slashcommands.js")
      )
      .catch((error) => botClient.logger.error(error));
  } else {
    //Prod Server
    rest
      .put(Routes.applicationCommands(botClient.config.clientId), { body: commands })
      .then(() =>
      botClient.logger.info("Successfully registered commands in Production", "slashcommands.js")
      )
      .catch((error) => botClient.logger.error(error));
  }

}