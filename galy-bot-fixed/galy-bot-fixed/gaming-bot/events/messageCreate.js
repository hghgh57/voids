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
      Bots are ignored by the logger and sticky system.
    */

    if (
      message.author?.bot
    ) {
      return;
    }


    /*
      Cross-server message log.

      This records normal user messages in the configured
      logging server, before ping protection or sticky
      processing changes anything.
    */

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
