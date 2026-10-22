import { describe, expect, test } from "bun:test";
import createLogger from "../src/util/logger.js";

function capturingWrite() {
  const lines = [];
  const write = (content, type, location) => {
    lines.push({ content, type, location });
    return lines.at(-1);
  };
  write.lines = lines;
  return write;
}

describe("BugsnagLogger", () => {
  test("falls back to console and does not start Bugsnag without a key", () => {
    const write = capturingWrite();
    const started = [];
    const Bugsnag = {
      start(options) {
        started.push(options);
        return { notify() {} };
      },
    };

    const blank = createLogger({
      apiKey: "   ",
      releaseStage: "production",
      write,
      Bugsnag,
    });
    const missing = createLogger({
      releaseStage: "production",
      write,
    });

    const error = new Error("boom");
    blank.error(error, "tests");
    blank.info("hello", "tests");

    expect(blank.bugsnagEnabled).toBe(false);
    expect(blank.bugsnagClient).toBeNull();
    expect(missing.bugsnagEnabled).toBe(false);
    expect(missing.bugsnagClient).toBeNull();
    expect(started).toEqual([]);
    expect(write.lines).toEqual([
      { content: error, type: "error", location: "tests" },
      { content: "hello", type: "log", location: "tests" },
    ]);
  });

  test("still writes to the console if Bugsnag.notify throws", () => {
    const write = capturingWrite();
    const logger = createLogger({
      apiKey: "abc123",
      write,
      Bugsnag: {
        start() {
          return {
            notify() {
              throw new Error("bugsnag down");
            },
          };
        },
      },
    });

    logger.error("still logged", "tests");
    expect(write.lines.map((line) => line.content)).toEqual([
      expect.any(Error),
      "still logged",
    ]);
    expect(write.lines[0].type).toBe("warn");
    expect(write.lines[1]).toEqual({
      content: "still logged",
      type: "error",
      location: "tests",
    });
  });

  test("notifies Bugsnag on error when a key is configured", () => {
    const write = capturingWrite();
    const notified = [];
    const Bugsnag = {
      start(options) {
        return {
          options,
          notify(content) {
            notified.push(content);
          },
        };
      },
    };

    const logger = createLogger({
      apiKey: "abc123",
      releaseStage: "production",
      write,
      Bugsnag,
    });

    const error = new Error("reported");
    logger.error(error, "interactionCreate");
    logger.warn("just a warning", "tests");

    expect(logger.bugsnagEnabled).toBe(true);
    expect(logger.bugsnagClient.options).toEqual({
      apiKey: "abc123",
      releaseStage: "production",
    });
    expect(notified).toEqual([error]);
    expect(write.lines.map((line) => line.type)).toEqual(["error", "warn"]);
  });

  test("hides debug lines outside development", () => {
    const write = capturingWrite();
    const prod = createLogger({ releaseStage: "production", write });
    const dev = createLogger({ releaseStage: "development", write });

    prod.debug("hidden");
    dev.debug("visible", "tests");

    expect(write.lines).toEqual([
      { content: "visible", type: "debug", location: "tests" },
    ]);
  });
});
