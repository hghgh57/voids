// Tracks the pre-lock SendMessages state for every role in a locked channel,
// so !unlock can restore things exactly as they were.
// In-memory only — resets if the bot restarts (channels stay locked, they just
// won't remember the old per-role state, so !unlock would just clear the deny).

const lockedChannels = new Map(); // channelId -> Map(roleId -> true | false | null)

function saveLockState(channelId, state) {
  lockedChannels.set(channelId, state);
}

function getLockState(channelId) {
  return lockedChannels.get(channelId) || null;
}

function clearLockState(channelId) {
  return lockedChannels.delete(channelId);
}

function isLocked(channelId) {
  return lockedChannels.has(channelId);
}

module.exports = {
  saveLockState,
  getLockState,
  clearLockState,
  isLocked,
};
