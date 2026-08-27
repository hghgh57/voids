const {
  getSticky,
  updateLastMessageId,
} = require('../utils/stickyManager');

const {
  logMessageCreate,
} = require('../utils/logger');

const config =
  require('../config.json');


/* =========================================================
   LOGGER SERVER
========================================================= */

const LOGGER_GUILD_ID =
  '1542361762186268765';


/* =========================================================
   PING PROTECTION
========================================================= */

async function enforcePingProtection(
  message
) {

  const roleId =
    config.pingProtectionRoleId;


  if (
    !roleId ||
    roleId.startsWith('PUT_')
  ) {
    return false;
  }


  if (
    !message.mentions.users.size
  ) {
    return false;
  }


  const protectedHit =
    message.mentions.members?.some(
      (member) =>
        member.roles.cache.has(
          roleId
        )
    );


  if (!protectedHit) {
    return false;
  }


  /*
    Staff with Manage Server can still ping
    protected members.
  */

  if (
    message.member?.permissions.has(
      'ManageGuild'
    )
  ) {
    return false;
  }


  await message.delete()
    .catch(
      (err) => {

        console.error(
          'Failed to delete message pinging a ping-protected member:',
          err
        );
      }
    );


  await message.channel
    .send({
      content:
        `${message.author}, that member has ping protection — you can't ping them.`,
    })
    .then(
      (notice) => {

        setTimeout(
          () => {

            notice
              .delete()
              .catch(
                () => {}
              );

          },
          6000
        );
      }
    )
    .catch(
      () => {}
    );


  return true;
}


/* =========================================================
   MESSAGE CREATE
========================================================= */

module.exports = {

  name:
    'messageCreate',


  async execute(
    message
  ) {

    /*
      Ignore bots.
    */

    if (
      message.author?.bot
    ) {
      return;
    }


    /*
      IMPORTANT:

      Never log messages that are sent inside the
      logger server.

      This prevents the logger from logging its own
      log messages and creating duplicates/loops.
    */

    if (
      message.guild?.id ===
      LOGGER_GUILD_ID
    ) {
      return;
    }


    /* =====================================================
       CROSS-SERVER MESSAGE LOG
    ===================================================== */

    try {

      await logMessageCreate(
        message
      );

    } catch (err) {

      console.error(
        '[MESSAGE] Failed to log message:',
        err
      );
    }


    /* =====================================================
       PING PROTECTION
    ===================================================== */

    if (
      await enforcePingProtection(
        message
      )
    ) {
      return;
    }


    /* =====================================================
       STICKY MESSAGE
    ===================================================== */

    const sticky =
      getSticky(
        message.channel.id
      );


    if (!sticky) {
      return;
    }


    if (
      sticky.lastMessageId
    ) {

      const oldMsg =
        await message.channel.messages
          .fetch(
            sticky.lastMessageId
          )
          .catch(
            () => null
          );


      if (oldMsg) {

        await oldMsg
          .delete()
          .catch(
            () => {}
          );
      }
    }


    const sent =
      await message.channel
        .send(
          `📌 ${sticky.content}`
        )
        .catch(
          () => null
        );


    if (sent) {

      updateLastMessageId(
        message.channel.id,
        sent.id
      );
    }
  },
};
