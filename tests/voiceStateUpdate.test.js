import { describe, expect, test } from "bun:test";
import { VOICE_EVENT, tryLoad } from "./helpers/voiceFeature.js";

const VoiceStateUpdate = await tryLoad(VOICE_EVENT);

function silentLogger() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
    time() {},
  };
}

describe.skipIf(!VoiceStateUpdate)("voiceStateUpdate auto-cleanup", () => {
  test("deletes an empty on-demand voice channel", async () => {
    const deleted = [];
    const event = new VoiceStateUpdate({ logger: silentLogger() });
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

    await event.run(oldState, { channelId: "lobby" });

    expect(deleted).toEqual(["voice-1"]);
  });

  test("leaves occupied or non-on-demand channels alone", async () => {
    const deleted = [];
    const event = new VoiceStateUpdate({ logger: silentLogger() });
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

    await event.run(occupied, { channelId: "lobby" });
    await event.run(
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
