require('dotenv').config();
const {
  Client,
  Collection,
  Partials,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
} = require("discord.js");

const partials = ["Partials.Guild"];
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
];
const presence = {
  status: "online",
  activities: [{
    name: "with Slash Commands",
    type: "PLAYING",
  }],
};

class DiscordBot extends Client {
  constructor(options) {
    super(options);
    this.config = require(process.env.BOT_CONFIG);

    //requiring the Logger class for easy console logging
    this.logger = require("./util/logger.js")({
      apiKey: this.config.bugsnagKey,
      releaseStage: this.config.environment,
    });

    this.slash_commands = new Collection();
    this.events = new Collection();

  }
}

const init = async () => {
  // Delay the start of the bot for debugging
  //console.log("Starting bot in 1 minutes...");
  //await new Promise(resolve => setTimeout(resolve, 1 * 60 * 1000));
  console.log("Starting bot now...");
  
  const bot = new DiscordBot({
    partials,
    intents,
    presence,
  });
  bot.logger.info("Starting Bot", "bot.js");

  //What do we require?
  const commands = require("./handlers/slashcommands.js")(bot);
  const events = require("./handlers/events.js")(bot);

  //logging into the bot
  bot.login(bot.config.token);
}

init();