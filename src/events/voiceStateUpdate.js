const Event = require("../base/Event.js");
const EventTypes = require("../base/EventTypes.js");
const { shouldDeleteEmptyOnDemandChannel } = require("../util/onDemandVoice");

class VoiceStateUpdate extends Event {
  constructor(client) {
    super(client, {
      name: "voiceStateUpdate",
      eventType: EventTypes.VOICE_STATE_UPDATE,
      description: "Deletes empty on-demand voice channels.",
      enabled: true,
    });
  }

  async run(oldState, newState) {
    this.client.logger.info("Voice State Update", "voiceStateUpdate.js");
    if (!shouldDeleteEmptyOnDemandChannel(oldState, newState)) return;
    try {
      oldState.channel.delete();
    } catch (error) {
      this.client.logger.error(error, "voiceStateUpdate.js");
    }
  }
}

module.exports = VoiceStateUpdate;
