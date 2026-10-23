import Event from "../base/Event.js";
import EventTypes from "../base/EventTypes.js";
import { shouldDeleteEmptyOnDemandChannel } from "../util/onDemandVoice.js";

// Sample on-demand voice feature. Delete this file together with
// src/commands/slash/voiceCreate.js (and optionally src/util/onDemandVoice.js)
// when cloning Stancy as a starter bot. Nothing else in src/ imports them.

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

export default VoiceStateUpdate;
