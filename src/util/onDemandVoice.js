import { ChannelType } from "discord.js";

// Helpers for the sample voice command + event only. Safe to delete with
// src/commands/slash/voiceCreate.js and src/events/voiceStateUpdate.js.

const ON_DEMAND_CATEGORY_NAME = "on-demand voice";
const FALLBACK_PARENT_ID = 454471197510598666;

function findOnDemandCategory(channelCache) {
  return channelCache.find(
    (c) =>
      c.name.toLowerCase() === ON_DEMAND_CATEGORY_NAME &&
      c.type === ChannelType.GuildCategory
  );
}

function resolveOnDemandParent(channelCache) {
  return findOnDemandCategory(channelCache) || FALLBACK_PARENT_ID;
}

function shouldDeleteEmptyOnDemandChannel(oldState, newState) {
  if (oldState.channelId === newState.channelId) return false;
  if (!oldState.channel) return false;
  const parentName = oldState.channel.parent?.name;
  if (!parentName || parentName.toLowerCase() !== ON_DEMAND_CATEGORY_NAME) {
    return false;
  }
  return oldState.channel.members.size === 0;
}

export {
  ON_DEMAND_CATEGORY_NAME,
  FALLBACK_PARENT_ID,
  findOnDemandCategory,
  resolveOnDemandParent,
  shouldDeleteEmptyOnDemandChannel,
};
