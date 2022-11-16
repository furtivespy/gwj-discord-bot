const Bugsnag = require("@bugsnag/js");
const chalk = require("chalk");
const moment = require("moment");

class BugsnagLogger {
  constructor(options) {
    this.bugsnagClient = Bugsnag.start(options);
    if (options.releaseStage === "development") {
      this.debugMode = true;
    }
  }

  log(content, type = "log", location = "Unknown") {
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
        this.bugsnagClient.notify(content);
        return console.log(
          `${timestamp}: ${chalk.bgRed(
            type.toUpperCase()
          )} ${content}  (${location})`
        );
      }
      case "debug": {
        if (this.debugMode) {
          return console.log(
            `${timestamp}: ${chalk.green(
              type.toUpperCase()
            )} ${content}  (${location})`
          );
        }
        return;
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
      default:
        throw new TypeError(
          "Logger type must be either warn, debug, log, ready, cmd or error."
        );
    }
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

  info(content, location = "Unknown") {
    return this.log(content, "log", location);
  }
}

module.exports = (opts) => {
  return new BugsnagLogger(opts);
};
