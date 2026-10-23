const EventTypes = {
  READY: "ready",
  INTERACTION_CREATE: "interactionCreate",
  // Optional Discord event names. Unused unless a matching file exists under src/events.
  VOICE_STATE_UPDATE: "voiceStateUpdate",
  MESSAGE_REACTION_ADD: "messageReactionAdd",
  MESSAGE_REACTION_REMOVE: "messageReactionRemove",
};

module.exports = EventTypes;
