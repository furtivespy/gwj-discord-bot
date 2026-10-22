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
  test("closes BunEnmap-style stores and exits 0", () => {
    const closed = [];
    const client = {
      logger: { warn() {} },
      settings: {
        close() {
          closed.push("settings");
        },
      },
    };
    const exits = [];

    gracefulShutdown(client, "SIGTERM", { exit: (code) => exits.push(code) });

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
