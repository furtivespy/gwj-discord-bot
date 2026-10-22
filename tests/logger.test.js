import { afterEach, describe, expect, spyOn, test } from "bun:test";
import Bugsnag from "@bugsnag/js";
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

const REAL_BUGSNAG_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

describe("BugsnagLogger", () => {
  afterEach(() => {
    if (typeof Bugsnag.start?.mockRestore === "function") {
      Bugsnag.start.mockRestore();
    }
  });

  test("falls back to console and does not start Bugsnag without a key", () => {
    const write = capturingWrite();
    const started = [];
    const FakeBugsnag = {
      start(options) {
        started.push(options);
        return { notify() {} };
      },
    };

    const blank = createLogger({
      apiKey: "   ",
      releaseStage: "production",
      write,
      Bugsnag: FakeBugsnag,
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

  test("createLogger with apiKey undefined never calls Bugsnag.start", () => {
    const start = spyOn(Bugsnag, "start").mockImplementation(() => ({ notify() {} }));
    const logger = createLogger({
      apiKey: undefined,
      releaseStage: "production",
      write() {},
    });

    expect(start).not.toHaveBeenCalled();
    expect(logger.bugsnagEnabled).toBe(false);
    expect(logger.bugsnagClient).toBeNull();
  });

  test("createLogger with a blank apiKey never calls Bugsnag.start", () => {
    const start = spyOn(Bugsnag, "start").mockImplementation(() => ({ notify() {} }));

    const missing = createLogger({ write() {} });
    const empty = createLogger({ apiKey: "", write() {} });
    const whitespace = createLogger({ apiKey: "   ", write() {} });

    expect(start).not.toHaveBeenCalled();
    expect(missing.bugsnagClient).toBeNull();
    expect(empty.bugsnagClient).toBeNull();
    expect(whitespace.bugsnagClient).toBeNull();
  });

  test("does not treat the config.json.sample placeholder abc123 as a real key", () => {
    const start = spyOn(Bugsnag, "start").mockImplementation(() => ({ notify() {} }));
    const logger = createLogger({
      apiKey: "abc123",
      releaseStage: "production",
      write() {},
    });

    expect(createLogger.PLACEHOLDER_BUGSNAG_KEYS.has("abc123")).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(logger.bugsnagEnabled).toBe(false);
    expect(logger.bugsnagClient).toBeNull();
  });

  test("still writes to the console if Bugsnag.notify throws", () => {
    const write = capturingWrite();
    const logger = createLogger({
      apiKey: REAL_BUGSNAG_KEY,
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
    const FakeBugsnag = {
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
      apiKey: REAL_BUGSNAG_KEY,
      releaseStage: "production",
      write,
      Bugsnag: FakeBugsnag,
    });

    const error = new Error("reported");
    logger.error(error, "interactionCreate");
    logger.warn("just a warning", "tests");

    expect(logger.bugsnagEnabled).toBe(true);
    expect(logger.bugsnagClient.options).toEqual({
      apiKey: REAL_BUGSNAG_KEY,
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
