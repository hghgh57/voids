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

  return (config.modRoleIds || []).some(
    (roleId) =>
      roleId &&
      !roleId.startsWith('PUT_') &&
      member.roles.cache.has(roleId)
  );
}

function canModerate(moderator, target) {
  if (!moderator || !target) return false;

  // Cannot moderate yourself
  if (moderator.id === target.id) {
    return false;
  }

  // Cannot moderate the server owner
  if (target.guild.ownerId === target.id) {
    return false;
  }

  // Moderator must have a HIGHER role than the target
  return (
    moderator.roles.highest.position >
    target.roles.highest.position
  );
}

module.exports = {
  isAdmin,
  isSupport,
  isMod,
  canModerate,
};
