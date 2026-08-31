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

module.exports = {
  isAdmin,
  isSupport,
  isMod,
};
