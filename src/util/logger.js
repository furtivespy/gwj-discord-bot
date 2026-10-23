import chalk from "chalk";
import moment from "moment";
import Bugsnag from "@bugsnag/js";

// config.json.sample uses this so copying the sample does not start Bugsnag.
const PLACEHOLDER_BUGSNAG_KEYS = new Set(["abc123"]);

function resolveApiKey(options = {}) {
  if (typeof options.apiKey !== "string") return "";
  const apiKey = options.apiKey.trim();
  if (!apiKey || PLACEHOLDER_BUGSNAG_KEYS.has(apiKey)) return "";
  return apiKey;
}

function writeConsole(content, type = "log", location = "Unknown") {
  const timestamp = `[${moment().format("YYYY-MM-DD HH:mm:ss")}]`;
  switch (type) {
    case "log": {
      return console.log(
        `${timestamp}: ${chalk.bgBlue(type.toUpperCase())} ${content} (${location})`
      );
    }
    case "warn": {
      return console.log(
        `${timestamp}: ${chalk.black.bgYellow(
          type.toUpperCase()
        )} ${content}  (${location})`
      );
    }
    case "error": {
      return console.log(
        `${timestamp}: ${chalk.bgRed(
          type.toUpperCase()
        )} ${content}  (${location})`
      );
    }
    case "debug": {
      return console.log(
        `${timestamp}: ${chalk.green(type.toUpperCase())} ${content} (${location})`
      );
    }
    case "cmd": {
      return console.log(
        `${timestamp}: ${chalk.black.bgWhite(type.toUpperCase())} ${content}`
      );
    }
    case "ready": {
      return console.log(
        `${timestamp}: ${chalk.black.bgGreen(type.toUpperCase())} ${content}`
      );
    }
    case "time": {
      return console.log(
        `${timestamp}: ${chalk.black.bgCyan(type.toUpperCase())} ${content}`
      );
    }
    default:
      throw new TypeError(
        "Logger type must be either warn, debug, log, ready, cmd, time or error."
      );
  }
}

class BugsnagLogger {
  constructor(options = {}) {
    this.debugMode = options.releaseStage === "development";
    this.write = typeof options.write === "function" ? options.write : writeConsole;

    const apiKey = resolveApiKey(options);
    this.bugsnagEnabled = Boolean(apiKey);
    this.bugsnagClient = null;

    if (this.bugsnagEnabled) {
      const client = options.Bugsnag || Bugsnag;
      this.bugsnagClient = client.start({
        apiKey,
        releaseStage: options.releaseStage,
      });
    }
  }

  log(content, type = "log", location = "Unknown") {
    if (type === "debug" && !this.debugMode) {
      return;
    }
    if (type === "error") {
      try {
        this.notify(content);
      } catch (err) {
        this.write(err, "warn", "logger.notify");
      }
    }
    return this.write(content, type, location);
  }

  notify(content) {
    if (!this.bugsnagClient || typeof this.bugsnagClient.notify !== "function") {
      return false;
    }
    this.bugsnagClient.notify(content);
    return true;
  }

  error(content, location = "Unknown") {
    return this.log(content, "error", location);
  }

  warn(content, location = "Unknown") {
    return this.log(content, "warn", location);
  }

  debug(content, location = "Unknown") {
    return this.log(content, "debug", location);
  }

  cmd(content, location = "Unknown") {
    return this.log(content, "cmd", location);
  }

  ready(content, location = "Unknown") {
    return this.log(content, "ready", location);
  }

  time(content, location = "Unknown") {
    return this.log(content, "time", location);
  }

  info(content, location = "Unknown") {
    return this.log(content, "log", location);
  }
}

function createLogger(options) {
  return new BugsnagLogger(options);
}

createLogger.BugsnagLogger = BugsnagLogger;
createLogger.writeConsole = writeConsole;
createLogger.resolveApiKey = resolveApiKey;
createLogger.PLACEHOLDER_BUGSNAG_KEYS = PLACEHOLDER_BUGSNAG_KEYS;

export {
  BugsnagLogger,
  writeConsole,
  resolveApiKey,
  PLACEHOLDER_BUGSNAG_KEYS,
};
export default createLogger;
