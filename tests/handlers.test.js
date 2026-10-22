import { describe, expect, test } from "bun:test";
import loadEvents from "../src/handlers/events.js";

function silentLogger() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
  };
}

describe("event handler", () => {
  test("registers ready, interactionCreate, and voiceStateUpdate without a Discord token", () => {
    const registered = {};
    loadEvents({
      logger: silentLogger(),
      on(name, handler) {
        registered[name] = handler;
      },
    });

    expect(typeof registered.ready).toBe("function");
    expect(typeof registered.interactionCreate).toBe("function");
    expect(typeof registered.voiceStateUpdate).toBe("function");
  });
});
