module.exports = (botClient, ...eventData) => {
  botClient.logger.info("Voice State Update", "voiceStateUpdate.js");
  [oldState, newState] = eventData;
  if (oldState.channelId === newState.channelId) return;
  if (!oldState.channel) return;
  if (oldState.channel.parent.name.toLowerCase() === `on-demand voice`) {
    if (oldState.channel.members.size === 0) {
      oldState.channel.delete();
    }
  }

};
