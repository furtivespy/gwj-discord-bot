const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "../../src");

const VOICE_COMMAND = path.join(SRC, "commands/slash/voiceCreate.js");
const VOICE_EVENT = path.join(SRC, "events/voiceStateUpdate.js");
const VOICE_UTIL = path.join(SRC, "util/onDemandVoice.js");

function hasVoiceCommand() {
  return fs.existsSync(VOICE_COMMAND);
}

function hasVoiceEvent() {
  return fs.existsSync(VOICE_EVENT);
}

function hasVoiceUtil() {
  return fs.existsSync(VOICE_UTIL);
}

module.exports = {
  SRC,
  VOICE_COMMAND,
  VOICE_EVENT,
  VOICE_UTIL,
  hasVoiceCommand,
  hasVoiceEvent,
  hasVoiceUtil,
};
