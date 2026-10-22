import { describe, expect, test } from "bun:test";
import voiceStateUpdate from "../src/events/voiceStateUpdate.js";

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

describe("voiceStateUpdate auto-cleanup", () => {
  test("deletes an empty on-demand voice channel", () => {
    const deleted = [];
    const oldState = {
      channelId: "voice-1",
      channel: {
        parent: { name: "on-demand voice" },
        members: { size: 0 },
        delete() {
          deleted.push("voice-1");
        },
      },
    };

    voiceStateUpdate({ logger: silentLogger() }, oldState, {
      channelId: "lobby",
    });

    expect(deleted).toEqual(["voice-1"]);
  });

  test("leaves occupied or non-on-demand channels alone", () => {
    const deleted = [];
    const occupied = {
      channelId: "voice-1",
      channel: {
        parent: { name: "on-demand voice" },
        members: { size: 2 },
        delete() {
          deleted.push("occupied");
        },
      },
    };

    voiceStateUpdate({ logger: silentLogger() }, occupied, {
      channelId: "lobby",
    });
    voiceStateUpdate(
      { logger: silentLogger() },
      {
        channelId: "perm-1",
        channel: {
          parent: { name: "General" },
          members: { size: 0 },
          delete() {
            deleted.push("permanent");
          },
        },
      },
      { channelId: "lobby" }
    );

    expect(deleted).toEqual([]);
  });
});
