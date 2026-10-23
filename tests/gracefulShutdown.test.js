import { describe, expect, test } from "bun:test";
import {
  STORE_KEYS,
  closeStores,
  gracefulShutdown,
  registerShutdownHandlers,
} from "../src/util/gracefulShutdown.js";

describe("gracefulShutdown", () => {
  test("only closes the settings store this bot opens", () => {
    expect(STORE_KEYS).toEqual(["settings"]);
  });
  test("closes stores, then flushes traces, then exits 0", async () => {
    const order = [];
    const client = {
      logger: { warn() {} },
      settings: {
        close() {
          order.push("close");
        },
      },
    };

    await gracefulShutdown(client, "SIGTERM", {
      exit: (code) => order.push(`exit:${code}`),
      flushTracing: async () => {
        order.push("flush");
      },
    });

    expect(order).toEqual(["close", "flush", "exit:0"]);
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

  test("SIGTERM closes stores, flushes traces, then exits; a second signal is ignored", async () => {
    const order = [];
    const handlers = {};
    const processRef = {
      once(signal, handler) {
        handlers[signal] = handler;
      },
    };

    registerShutdownHandlers(
      {
        logger: { warn() {} },
        settings: {
          close() {
            order.push("close");
          },
        },
      },
      {
        processRef,
        exit: (code) => order.push(`exit:${code}`),
        flushTracing: async () => {
          order.push("flush");
        },
      }
    );

    expect(typeof handlers.SIGTERM).toBe("function");
    expect(typeof handlers.SIGINT).toBe("function");

    const first = handlers.SIGTERM("SIGTERM");
    const second = handlers.SIGINT("SIGINT");
    await first;
    await second;

    expect(order).toEqual(["close", "flush", "exit:0"]);
  });
});
