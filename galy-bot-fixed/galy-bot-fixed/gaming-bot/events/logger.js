const {
  logMessageCreate,
  logMessageEdit,
  logMessageDelete,

  logMemberJoin,
  logMemberLeave,
  logNicknameChange,
  logMemberRolesUpdate,
  logTimeout,

  logBan,
  logUnban,

  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,

  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,

  logGuildUpdate,
} = require('../utils/logger');


/* =========================================================
   CROSS-SERVER LOGGER
========================================================= */

module.exports = {

  /*
    This name is only informational because this file uses
    register() to attach multiple Discord event listeners.
  */

  name: 'logger',


  register(client) {

    console.log(
      '[LOGGER] Registering cross-server logging listeners...'
    );


    /* =====================================================
       MESSAGE CREATED
    ===================================================== */

    client.on(
      'messageCreate',
      async (message) => {

        try {

          await logMessageCreate(
            message
          );

        } catch (err) {

          console.error(
            '[LOGGER] messageCreate failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       MESSAGE EDITED
    ===================================================== */

    client.on(
      'messageUpdate',
      async (
        oldMessage,
        newMessage
      ) => {

        try {

          await logMessageEdit(
            oldMessage,
            newMessage
          );

        } catch (err) {

          console.error(
            '[LOGGER] messageUpdate failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       MESSAGE DELETED
    ===================================================== */

    client.on(
      'messageDelete',
      async (message) => {

        try {

          await logMessageDelete(
            message
          );

        } catch (err) {

          console.error(
            '[LOGGER] messageDelete failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       MEMBER JOIN
    ===================================================== */

    client.on(
      'guildMemberAdd',
      async (member) => {

        try {

          await logMemberJoin(
            member
          );

        } catch (err) {

          console.error(
            '[LOGGER] guildMemberAdd failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       MEMBER LEAVE / KICK
    ===================================================== */

    client.on(
      'guildMemberRemove',
      async (member) => {

        try {

          await logMemberLeave(
            member
          );

        } catch (err) {

          console.error(
            '[LOGGER] guildMemberRemove failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       MEMBER UPDATE
    ===================================================== */

    client.on(
      'guildMemberUpdate',
      async (
        oldMember,
        newMember
      ) => {

        try {

          await logNicknameChange(
            oldMember,
            newMember
          );

        } catch (err) {

          console.error(
            '[LOGGER] nickname logging failed:',
            err
          );
        }


        try {

          await logMemberRolesUpdate(
            oldMember,
            newMember
          );

        } catch (err) {

          console.error(
            '[LOGGER] role logging failed:',
            err
          );
        }


        try {

          await logTimeout(
            oldMember,
            newMember
          );

        } catch (err) {

          console.error(
            '[LOGGER] timeout logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       BAN
    ===================================================== */

    client.on(
      'guildBanAdd',
      async (ban) => {

        try {

          await logBan(
            ban
          );

        } catch (err) {

          console.error(
            '[LOGGER] ban logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       UNBAN
    ===================================================== */

    client.on(
      'guildBanRemove',
      async (ban) => {

        try {

          await logUnban(
            ban
          );

        } catch (err) {

          console.error(
            '[LOGGER] unban logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       ROLE CREATED
    ===================================================== */

    client.on(
      'roleCreate',
      async (role) => {

        try {

          await logRoleCreate(
            role
          );

        } catch (err) {

          console.error(
            '[LOGGER] roleCreate logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       ROLE DELETED
    ===================================================== */

    client.on(
      'roleDelete',
      async (role) => {

        try {

          await logRoleDelete(
            role
          );

        } catch (err) {

          console.error(
            '[LOGGER] roleDelete logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       ROLE UPDATED
    ===================================================== */

    client.on(
      'roleUpdate',
      async (
        oldRole,
        newRole
      ) => {

        try {

          await logRoleUpdate(
            oldRole,
            newRole
          );

        } catch (err) {

          console.error(
            '[LOGGER] roleUpdate logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       CHANNEL CREATED
    ===================================================== */

    client.on(
      'channelCreate',
      async (channel) => {

        try {

          await logChannelCreate(
            channel
          );

        } catch (err) {

          console.error(
            '[LOGGER] channelCreate logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       CHANNEL DELETED
    ===================================================== */

    client.on(
      'channelDelete',
      async (channel) => {

        try {

          await logChannelDelete(
            channel
          );

        } catch (err) {

          console.error(
            '[LOGGER] channelDelete logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       CHANNEL UPDATED
    ===================================================== */

    client.on(
      'channelUpdate',
      async (
        oldChannel,
        newChannel
      ) => {

        try {

          await logChannelUpdate(
            oldChannel,
            newChannel
          );

        } catch (err) {

          console.error(
            '[LOGGER] channelUpdate logging failed:',
            err
          );
        }
      }
    );


    /* =====================================================
       SERVER UPDATED
    ===================================================== */

    client.on(
      'guildUpdate',
      async (
        oldGuild,
        newGuild
      ) => {

        try {

          await logGuildUpdate(
            oldGuild,
            newGuild
          );

        } catch (err) {

          console.error(
            '[LOGGER] guildUpdate logging failed:',
            err
          );
        }
      }
    );


    console.log(
      '[LOGGER] Cross-server logger is active.'
    );
  },
};
