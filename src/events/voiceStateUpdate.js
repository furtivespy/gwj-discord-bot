const { shouldDeleteEmptyOnDemandChannel } = require("../util/onDemandVoice");

module.exports = (botClient, ...eventData) => {
  botClient.logger.info("Voice State Update", "voiceStateUpdate.js");
  const [oldState, newState] = eventData;
  if (!shouldDeleteEmptyOnDemandChannel(oldState, newState)) return;
  try {
    oldState.channel.delete();
  } catch (error) {
    botClient.logger.error(error, "voiceStateUpdate.js");
  }
};
