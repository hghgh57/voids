const config = require('../config.json');

function isAdmin(member) {
  if (!member) return false;

  return (config.adminRoleIds || []).some(
    (roleId) =>
      roleId &&
      !roleId.startsWith('PUT_') &&
      member.roles.cache.has(roleId)
  );
}

function isSupport(member) {
  if (!member) return false;

  return (config.supportRoleIds || []).some(
    (roleId) =>
      roleId &&
      !roleId.startsWith('PUT_') &&
      member.roles.cache.has(roleId)
  );
}

function isMod(member) {
  if (!member) return false;

  // Whitelisted user
  if (member.id === '1492833649123393676') return true;

  return (config.modRoleIds || []).some(
    (roleId) =>
      roleId &&
      !roleId.startsWith('PUT_') &&
      member.roles.cache.has(roleId)
  );
}

/**
 * Checks whether a moderator is allowed to moderate a target.
 *
 * A moderator:
 * - cannot moderate themselves
 * - cannot moderate the server owner
 * - cannot moderate someone with an equal or higher highest role
 */
function canModerate(moderator, target) {
  if (!moderator || !target) return false;

  // Cannot moderate yourself
  if (moderator.id === target.id) return false;

  // Cannot moderate the server owner
  if (target.guild.ownerId === target.id) return false;

  // Target must be BELOW the moderator's highest role
  return moderator.roles.highest.position > target.roles.highest.position;
}

module.exports = {
  isAdmin,
  isSupport,
  isMod,
  canModerate,
};
