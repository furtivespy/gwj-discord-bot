const fs = require("fs");
const path = require("path");

module.exports = (botClient) => {
  botClient.logger.info("Loading Event Handlers", "events.js");
  const eventPath = path.join(__dirname, "../events");

  fs.readdirSync(eventPath).forEach((file) => {
    if (!file.endsWith(".js")) return;
    let eventName = file.split(".")[0];
    botClient.logger.info(`Loading Event: ${eventName}`, "events.js");
    try {
      const event = require(`../events/${file}`);
      botClient.on(eventName, (...params) => handleWithCatch(event, botClient, ...params));
    } catch (err) {
      botClient.logger.error(err, "events.js");
    }
  });
};

const handleWithCatch = (handler, client, ...eventParams) => {
  try {
    return handler(client, ...eventParams);
  } catch (error) {
    client.logger.error(error, "events.js");
  }
}