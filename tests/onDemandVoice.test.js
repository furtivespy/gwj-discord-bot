import { describe, expect, test } from "bun:test";
import { ChannelType } from "discord.js";
import { VOICE_UTIL, tryLoad } from "./helpers/voiceFeature.js";

const voiceHelpers = await tryLoad(VOICE_UTIL);
const FALLBACK_PARENT_ID = voiceHelpers?.FALLBACK_PARENT_ID;
const ON_DEMAND_CATEGORY_NAME = voiceHelpers?.ON_DEMAND_CATEGORY_NAME;
const findOnDemandCategory = voiceHelpers?.findOnDemandCategory;
const resolveOnDemandParent = voiceHelpers?.resolveOnDemandParent;
const shouldDeleteEmptyOnDemandChannel =
  voiceHelpers?.shouldDeleteEmptyOnDemandChannel;

function cacheOf(channels) {
  return { find: (predicate) => channels.find(predicate) };
}

describe.skipIf(!voiceHelpers)("on-demand voice helpers", () => {
  test("finds the on-demand category case-insensitively", () => {
    const category = {
      id: "cat-1",
      name: "On-Demand Voice",
      type: ChannelType.GuildCategory,
    };
    const other = {
      id: "voice-1",
      name: "On-Demand Voice",
      type: ChannelType.GuildVoice,
    };

    expect(findOnDemandCategory(cacheOf([other, category]))).toBe(category);
    expect(ON_DEMAND_CATEGORY_NAME).toBe("on-demand voice");
  });

  test("resolveOnDemandParent uses the category or the legacy fallback id", () => {
    const category = {
      id: "cat-1",
      name: "on-demand voice",
      type: ChannelType.GuildCategory,
    };

    expect(resolveOnDemandParent(cacheOf([category]))).toBe(category);
    expect(resolveOnDemandParent(cacheOf([]))).toBe(FALLBACK_PARENT_ID);
  });

  test("deletes an empty on-demand channel after the last member leaves", () => {
    const channel = {
      parent: { name: "On-Demand Voice" },
      members: { size: 0 },
    };

    expect(
      shouldDeleteEmptyOnDemandChannel(
        { channelId: "voice-1", channel },
        { channelId: "lobby" }
      )
    ).toBe(true);
  });

  test("does not delete when the user stays, the channel still has members, or it is not on-demand", () => {
    const occupied = {
      parent: { name: "on-demand voice" },
      members: { size: 1 },
    };
    const otherCategory = {
      parent: { name: "permanent voice" },
      members: { size: 0 },
    };

    expect(
      shouldDeleteEmptyOnDemandChannel(
        { channelId: "voice-1", channel: occupied },
        { channelId: "voice-1" }
      )
    ).toBe(false);

    expect(
      shouldDeleteEmptyOnDemandChannel(
        { channelId: "voice-1", channel: occupied },
        { channelId: "lobby" }
      )
    ).toBe(false);

    expect(
      shouldDeleteEmptyOnDemandChannel(
        { channelId: "voice-1", channel: otherCategory },
        { channelId: "lobby" }
      )
    ).toBe(false);

    expect(
      shouldDeleteEmptyOnDemandChannel(
        { channelId: "voice-1", channel: null },
        { channelId: "lobby" }
      )
    ).toBe(false);

    expect(
      shouldDeleteEmptyOnDemandChannel(
        { channelId: "voice-1", channel: { parent: null, members: { size: 0 } } },
        { channelId: "lobby" }
      )
    ).toBe(false);
  });
});
