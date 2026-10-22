const EventTypes = {
  READY: "ready",
  INTERACTION_CREATE: "interactionCreate",
  // Used only by src/events/voiceStateUpdate.js (safe to leave if you delete voice).
  VOICE_STATE_UPDATE: "voiceStateUpdate",
  MESSAGE_REACTION_ADD: "messageReactionAdd",
  MESSAGE_REACTION_REMOVE: "messageReactionRemove",
};

module.exports = EventTypes;
