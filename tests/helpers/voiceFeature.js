const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "../../src");

const VOICE_COMMAND = path.join(SRC, "commands/slash/voiceCreate.js");
const VOICE_EVENT = path.join(SRC, "events/voiceStateUpdate.js");
const VOICE_UTIL = path.join(SRC, "util/onDemandVoice.js");

function tryLoad(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return require(file);
  } catch {
    return null;
  }
}

function hasVoiceCommandFile() {
  return fs.existsSync(VOICE_COMMAND);
}

function hasVoiceEventFile() {
  return fs.existsSync(VOICE_EVENT);
}

function hasVoiceCommand() {
  return Boolean(tryLoad(VOICE_COMMAND));
}

function hasVoiceEvent() {
  return Boolean(tryLoad(VOICE_EVENT));
}

function hasVoiceUtil() {
  return Boolean(tryLoad(VOICE_UTIL));
}

module.exports = {
  VOICE_COMMAND,
  VOICE_EVENT,
  VOICE_UTIL,
  tryLoad,
  hasVoiceCommandFile,
  hasVoiceEventFile,
  hasVoiceCommand,
  hasVoiceEvent,
  hasVoiceUtil,
};
