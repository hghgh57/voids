// Simple in-memory AFK tracker.
// Note: this resets if the bot restarts (not saved to disk).

const afkUsers = new Map(); // userId -> { reason, timestamp }

function setAfk(userId, reason) {
  afkUsers.set(userId, { reason, timestamp: Date.now() });
}

function clearAfk(userId) {
  return afkUsers.delete(userId);
}

function getAfk(userId) {
  return afkUsers.get(userId) || null;
}

function isAfk(userId) {
  return afkUsers.has(userId);
}

module.exports = {
  setAfk,
  clearAfk,
  getAfk,
  isAfk,
};
