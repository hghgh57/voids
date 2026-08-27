const {
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
   LOGGER SERVER

   This server ONLY receives logs.
   Events happening inside this server are ignored so the
   logger does not log itself back into the logger server.
========================================================= */

const LOGGER_GUILD_ID =
  '1542361762186268765';


/* =========================================================
   CROSS-SERVER LOGGER
========================================================= */

module.exports = {

  name: 'logger',

  register(client) {

    console.log(
      '[LOGGER] Registering cross-server logging listeners...'
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

          /*
            Ignore messages edited inside the logger server.
          */

          if (
            newMessage.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore messages deleted inside the logger server.
          */

          if (
            message.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore members joining the logger server.
          */

          if (
            member.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore members leaving the logger server.
          */

          if (
            member.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore member updates inside the logger server.
          */

          if (
            newMember.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore bans inside the logger server.
          */

          if (
            ban.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore unbans inside the logger server.
          */

          if (
            ban.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore roles created in the logger server.
          */

          if (
            role.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore roles deleted in the logger server.
          */

          if (
            role.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore role updates in the logger server.
          */

          if (
            newRole.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore channels created in the logger server.
          */

          if (
            channel.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore channels deleted in the logger server.
          */

          if (
            channel.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore channel updates in the logger server.
          */

          if (
            newChannel.guild?.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

          /*
            Ignore server updates to the logger server.
          */

          if (
            newGuild.id ===
            LOGGER_GUILD_ID
          ) {
            return;
          }


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

    console.log(
      `[LOGGER] Ignoring logger server: ${LOGGER_GUILD_ID}`
    );
  },
};
