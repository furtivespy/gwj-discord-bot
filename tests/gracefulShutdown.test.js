const { describe, expect, test } = require("bun:test");
const {
  STORE_KEYS,
  closeStores,
  gracefulShutdown,
  registerShutdownHandlers,
} = require("../src/util/gracefulShutdown.js");

describe("gracefulShutdown", () => {
  test("only closes the settings store this bot opens", () => {
    expect(STORE_KEYS).toEqual(["settings"]);
  });
  test("closes BunEnmap-style stores, flushes tracing, and exits 0", async () => {
    const closed = [];
    const flushed = [];
    const client = {
      logger: { warn() {} },
      settings: {
        close() {
          closed.push("settings");
        },
      },
    };
    const exits = [];

    await gracefulShutdown(client, "SIGTERM", {
      exit: (code) => exits.push(code),
      flushTracing: async () => {
        flushed.push("tracing");
      },
    });

    expect(closed).toEqual(["settings"]);
    expect(flushed).toEqual(["tracing"]);
    expect(exits).toEqual([0]);
  });

  test("still exits 0 when tracing flush throws", async () => {
    const closed = [];
    const exits = [];

    await gracefulShutdown(
      {
        logger: { warn() {} },
        settings: {
          close() {
            closed.push("settings");
          },
        },
      },
      "SIGINT",
      {
        exit: (code) => exits.push(code),
        flushTracing: async () => {
          throw new Error("flush failed");
        },
      }
    );

    expect(closed).toEqual(["settings"]);
    expect(exits).toEqual([0]);
  });

  test("falls back to store.db.close when close() is missing", () => {
    const closed = [];
    closeStores({
      settings: {
        db: {
          close() {
            closed.push("db");
          },
        },
      },
    });
    expect(closed).toEqual(["db"]);
  });

  test("registers SIGTERM and SIGINT", () => {
    const handlers = {};
    const processRef = {
      on(signal, handler) {
        handlers[signal] = handler;
      },
    };
    registerShutdownHandlers({ logger: { warn() {} }, settings: {} }, { processRef });
    expect(typeof handlers.SIGTERM).toBe("function");
    expect(typeof handlers.SIGINT).toBe("function");
  });
});
