import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exportedValue } from "../../src/handlers/discover.js";

const SRC = path.join(import.meta.dir, "../../src");

const VOICE_COMMAND = path.join(SRC, "commands/slash/voiceCreate.js");
const VOICE_EVENT = path.join(SRC, "events/voiceStateUpdate.js");
const VOICE_UTIL = path.join(SRC, "util/onDemandVoice.js");

async function tryLoad(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return exportedValue(await import(pathToFileURL(file).href));
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

async function hasVoiceCommand() {
  return Boolean(await tryLoad(VOICE_COMMAND));
}

async function hasVoiceEvent() {
  return Boolean(await tryLoad(VOICE_EVENT));
}

async function hasVoiceUtil() {
  return Boolean(await tryLoad(VOICE_UTIL));
}

export {
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
