const {
  EmbedBuilder,
  AuditLogEvent,
} = require('discord.js');

const config =
  require('../config.json');


/* =========================================================
   SETTINGS
========================================================= */

function loggingEnabled() {

  return (
    config.logging?.enabled === true
  );
}


function getLogChannelId(
  type
) {

  return config
    .logging
    ?.channels
    ?.[type];
}


async function getLogChannel(
  client,
  type
) {

  if (
    !loggingEnabled()
  ) {
    return null;
  }


  const channelId =
    getLogChannelId(
      type
    );


  if (
    !channelId ||
    channelId.startsWith('PUT_')
  ) {
    return null;
  }


  const channel =
    await client.channels
      .fetch(
        channelId
      )
      .catch(
        () => null
      );


  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return null;
  }


  /*
    If a logGuildId is configured, make sure the
    destination channel is actually in that server.
  */

  const configuredLogGuildId =
    config.logging?.logGuildId;


  if (
    configuredLogGuildId &&
    channel.guildId &&
    channel.guildId !==
      configuredLogGuildId
  ) {

    console.error(
      `[LOGGER] Channel ${channelId} is not inside configured log guild ${configuredLogGuildId}.`
    );

    return null;
  }


  return channel;
}


/* =========================================================
   SAFE TEXT
========================================================= */

function clip(
  value,
  length = 1024
) {

  if (
    value === null ||
    value === undefined
  ) {
    return 'None';
  }


  const text =
    String(value);


  if (
    !text.length
  ) {
    return 'None';
  }


  return text.slice(
    0,
    length
  );
}


function userText(
  user
) {

  if (!user) {
    return 'Unknown';
  }


  return `${
    user.tag ||
    user.username ||
    'Unknown'
  } (${user.id})`;
}


function channelText(
  channel
) {

  if (!channel) {
    return 'Unknown';
  }


  if (
    channel.id &&
    channel.name
  ) {

    return `<#${channel.id}> (${channel.name})`;
  }


  return channel.name ||
    channel.id ||
    'Unknown';
}


/* =========================================================
   SEND LOG
========================================================= */

async function sendLog(
  client,
  type,
  embed
) {

  try {

    if (
      !client
    ) {
      return;
    }


    const channel =
      await getLogChannel(
        client,
        type
      );


    if (
      !channel
    ) {
      return;
    }


    await channel.send({
      embeds: [
        embed,
      ],
    });

  } catch (err) {

    console.error(
      `[LOGGER] Failed to send ${type} log:`,
      err
    );
  }
}


/* =========================================================
   MESSAGE CREATED
========================================================= */

async function logMessageCreate(
  message
) {

  if (
    !message?.guild
  ) {
    return;
  }


  if (
    message.author?.bot
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '💬 Message Sent'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              message.author
            ),

          inline:
            true,
        },

        {
          name:
            'Channel',

          value:
            channelText(
              message.channel
            ),

          inline:
            true,
        },

        {
          name:
            'Message ID',

          value:
            message.id,

          inline:
            true,
        },

        {
          name:
            'Content',

          value:
            clip(
              message.content ||
              'No text content'
            ),
        }
      )
      .setTimestamp();


  if (
    message.attachments?.size
  ) {

    embed.addFields({
      name:
        'Attachments',

      value:
        message.attachments
          .map(
            (attachment) =>
              attachment.url
          )
          .join('\n')
          .slice(
            0,
            1024
          ),
    });
  }


  if (
    message.url
  ) {

    embed.setURL(
      message.url
    );
  }


  await sendLog(
    message.client,
    'message',
    embed
  );
}


/* =========================================================
   MESSAGE EDITED
========================================================= */

async function logMessageEdit(
  oldMessage,
  newMessage
) {

  if (
    !oldMessage?.guild
  ) {
    return;
  }


  if (
    oldMessage.author?.bot
  ) {
    return;
  }


  const oldContent =
    oldMessage.content ||
    'No content';


  const newContent =
    newMessage.content ||
    'No content';


  if (
    oldContent ===
    newContent
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '✏️ Message Edited'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              oldMessage.author
            ),

          inline:
            true,
        },

        {
          name:
            'Channel',

          value:
            channelText(
              oldMessage.channel
            ),

          inline:
            true,
        },

        {
          name:
            'Message ID',

          value:
            oldMessage.id,

          inline:
            true,
        },

        {
          name:
            'Before',

          value:
            clip(
              oldContent
            ),
        },

        {
          name:
            'After',

          value:
            clip(
              newContent
            ),
        }
      )
      .setTimestamp();


  if (
    newMessage.url
  ) {

    embed.setURL(
      newMessage.url
    );
  }


  await sendLog(
    newMessage.client,
    'message',
    embed
  );
}


/* =========================================================
   MESSAGE DELETED
========================================================= */

async function logMessageDelete(
  message
) {

  if (
    !message?.guild
  ) {
    return;
  }


  if (
    message.author?.bot
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🗑️ Message Deleted'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              message.author
            ),

          inline:
            true,
        },

        {
          name:
            'Channel',

          value:
            channelText(
              message.channel
            ),

          inline:
            true,
        },

        {
          name:
            'Message ID',

          value:
            message.id,

          inline:
            true,
        },

        {
          name:
            'Content',

          value:
            clip(
              message.content ||
              'Content unavailable'
            ),
        }
      )
      .setTimestamp();


  if (
    message.attachments?.size
  ) {

    embed.addFields({
      name:
        'Attachments',

      value:
        message.attachments
          .map(
            (attachment) =>
              attachment.url
          )
          .join('\n')
          .slice(
            0,
            1024
          ),
    });
  }


  await sendLog(
    message.client,
    'message',
    embed
  );
}


/* =========================================================
   MEMBER JOIN
========================================================= */

async function logMemberJoin(
  member
) {

  if (
    !member?.guild
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '📥 Member Joined'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              member.user
            ),

          inline:
            true,
        },

        {
          name:
            'Account Created',

          value:
            `<t:${Math.floor(
              member.user.createdTimestamp /
              1000
            )}:F>`,

          inline:
            true,
        },

        {
          name:
            'Member Count',

          value:
            String(
              member.guild.memberCount
            ),

          inline:
            true,
        }
      )
      .setTimestamp();


  await sendLog(
    member.client,
    'member',
    embed
  );
}


/* =========================================================
   MEMBER LEAVE / KICK
========================================================= */

async function logMemberLeave(
  member
) {

  if (
    !member?.guild
  ) {
    return;
  }


  /*
    Try to determine whether this was a kick.
  */

  let auditEntry =
    null;


  try {

    const logs =
      await member.guild
        .fetchAuditLogs({
          type:
            AuditLogEvent.MemberKick,

          limit:
            5,
        });


    auditEntry =
      logs.entries.find(
        (entry) =>
          entry.target?.id ===
            member.id &&
          Date.now() -
            entry.createdTimestamp <
            10000
      );

  } catch {
    auditEntry = null;
  }


  const wasKick =
    Boolean(
      auditEntry
    );


  const embed =
    new EmbedBuilder()
      .setTitle(
        wasKick
          ? '👢 Member Kicked'
          : '📤 Member Left'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              member.user
            ),

          inline:
            true,
        },

        {
          name:
            'Member ID',

          value:
            member.id,

          inline:
            true,
        }
      )
      .setTimestamp();


  if (
    wasKick
  ) {

    embed.addFields(
      {
        name:
          'Moderator',

        value:
          auditEntry.executor
            ? userText(
                auditEntry.executor
              )
            : 'Unknown',

        inline:
          true,
      },

      {
        name:
          'Reason',

        value:
          clip(
            auditEntry.reason ||
            'No reason provided'
          ),
      }
    );
  }


  await sendLog(
    member.client,
    'member',
    embed
  );
}


/* =========================================================
   NICKNAME CHANGE
========================================================= */

async function logNicknameChange(
  oldMember,
  newMember
) {

  if (
    oldMember.nickname ===
    newMember.nickname
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '✏️ Nickname Changed'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              newMember.user
            ),

          inline:
            true,
        },

        {
          name:
            'Before',

          value:
            clip(
              oldMember.nickname ||
              oldMember.user.username
            ),

          inline:
            true,
        },

        {
          name:
            'After',

          value:
            clip(
              newMember.nickname ||
              newMember.user.username
            ),

          inline:
            true,
        }
      )
      .setTimestamp();


  await sendLog(
    newMember.client,
    'member',
    embed
  );
}


/* =========================================================
   MEMBER ROLE CHANGES
========================================================= */

async function logMemberRolesUpdate(
  oldMember,
  newMember
) {

  const oldRoles =
    new Set(
      oldMember.roles.cache
        .map(
          (role) =>
            role.id
        )
    );


  const newRoles =
    new Set(
      newMember.roles.cache
        .map(
          (role) =>
            role.id
        )
    );


  const added =
    newMember.roles.cache
      .filter(
        (role) =>
          !oldRoles.has(
            role.id
          )
      );


  const removed =
    oldMember.roles.cache
      .filter(
        (role) =>
          !newRoles.has(
            role.id
          )
      );


  if (
    !added.size &&
    !removed.size
  ) {
    return;
  }


  const changes = [];


  if (
    added.size
  ) {

    changes.push(
      `**Added:** ${added
        .map(
          (role) =>
            `${role}`
        )
        .join(', ')}`
    );
  }


  if (
    removed.size
  ) {

    changes.push(
      `**Removed:** ${removed
        .map(
          (role) =>
            `${role.name}`
        )
        .join(', ')}`
    );
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🎭 Member Roles Changed'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              newMember.user
            ),

          inline:
            true,
        },

        {
          name:
            'Changes',

          value:
            clip(
              changes.join('\n')
            ),
        }
      )
      .setTimestamp();


  await sendLog(
    newMember.client,
    'member',
    embed
  );
}


/* =========================================================
   TIMEOUT
========================================================= */

async function logTimeout(
  oldMember,
  newMember
) {

  const oldTimeout =
    oldMember.communicationDisabledUntilTimestamp;


  const newTimeout =
    newMember.communicationDisabledUntilTimestamp;


  if (
    oldTimeout ===
    newTimeout
  ) {
    return;
  }


  const isTimedOut =
    Boolean(
      newTimeout
    );


  let auditEntry =
    null;


  try {

    const logs =
      await newMember.guild
        .fetchAuditLogs({
          type:
            AuditLogEvent.MemberUpdate,

          limit:
            10,
        });


    auditEntry =
      logs.entries.find(
        (entry) =>
          entry.target?.id ===
            newMember.id &&
          Date.now() -
            entry.createdTimestamp <
            10000
      );

  } catch {
    auditEntry = null;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        isTimedOut
          ? '⏱️ Member Timed Out'
          : '✅ Timeout Removed'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              newMember.user
            ),

          inline:
            true,
        },

        {
          name:
            'Until',

          value:
            newTimeout
              ? `<t:${Math.floor(
                  newTimeout /
                  1000
                )}:F>`
              : 'Timeout removed',

          inline:
            true,
        }
      )
      .setTimestamp();


  if (
    auditEntry?.executor
  ) {

    embed.addFields({
      name:
        'Moderator',

      value:
        userText(
          auditEntry.executor
        ),

      inline:
        true,
    });
  }


  if (
    auditEntry?.reason
  ) {

    embed.addFields({
      name:
        'Reason',

      value:
        clip(
          auditEntry.reason
        ),
    });
  }


  await sendLog(
    newMember.client,
    'moderation',
    embed
  );
}


/* =========================================================
   AUDIT LOG HELPER
========================================================= */

async function getAuditExecutor(
  guild,
  type,
  targetId
) {

  try {

    const logs =
      await guild
        .fetchAuditLogs({
          type,
          limit:
            10,
        });


    const entry =
      logs.entries.find(
        (entry) =>
          entry.target?.id ===
            targetId &&
          Date.now() -
            entry.createdTimestamp <
            10000
      );


    return (
      entry ||
      null
    );

  } catch {

    return null;
  }
}


/* =========================================================
   BAN
========================================================= */

async function logBan(
  ban
) {

  const entry =
    await getAuditExecutor(
      ban.guild,
      AuditLogEvent.MemberBanAdd,
      ban.user.id
    );


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔨 Member Banned'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              ban.user
            ),

          inline:
            true,
        },

        {
          name:
            'Moderator',

          value:
            entry?.executor
              ? userText(
                  entry.executor
                )
              : 'Unknown',

          inline:
            true,
        },

        {
          name:
            'Reason',

          value:
            clip(
              ban.reason ||
              entry?.reason ||
              'No reason provided'
            ),
        }
      )
      .setTimestamp();


  await sendLog(
    ban.client,
    'moderation',
    embed
  );
}


/* =========================================================
   UNBAN
========================================================= */

async function logUnban(
  ban
) {

  const entry =
    await getAuditExecutor(
      ban.guild,
      AuditLogEvent.MemberBanRemove,
      ban.user.id
    );


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔓 Member Unbanned'
      )
      .addFields(
        {
          name:
            'User',

          value:
            userText(
              ban.user
            ),

          inline:
            true,
        },

        {
          name:
            'Moderator',

          value:
            entry?.executor
              ? userText(
                  entry.executor
                )
              : 'Unknown',

          inline:
            true,
        }
      )
      .setTimestamp();


  await sendLog(
    ban.client,
    'moderation',
    embed
  );
}


/* =========================================================
   ROLE CREATED
========================================================= */

async function logRoleCreate(
  role
) {

  if (
    !role.guild
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🟢 Role Created'
      )
      .addFields(
        {
          name:
            'Role',

          value:
            `${role.name} (${role.id})`,

          inline:
            true,
        },

        {
          name:
            'Color',

          value:
            role.hexColor,

          inline:
            true,
        }
      )
      .setTimestamp();


  await sendLog(
    role.client,
    'server',
    embed
  );
}


/* =========================================================
   ROLE DELETED
========================================================= */

async function logRoleDelete(
  role
) {

  if (
    !role.guild
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔴 Role Deleted'
      )
      .addFields({
        name:
          'Role',

        value:
          `${role.name} (${role.id})`,
      })
      .setTimestamp();


  await sendLog(
    role.client,
    'server',
    embed
  );
}


/* =========================================================
   ROLE UPDATED
========================================================= */

async function logRoleUpdate(
  oldRole,
  newRole
) {

  if (
    !newRole.guild
  ) {
    return;
  }


  const changes = [];


  if (
    oldRole.name !==
    newRole.name
  ) {

    changes.push(
      `**Name:** ${oldRole.name} → ${newRole.name}`
    );
  }


  if (
    oldRole.hexColor !==
    newRole.hexColor
  ) {

    changes.push(
      `**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`
    );
  }


  if (
    oldRole.position !==
    newRole.position
  ) {

    changes.push(
      `**Position:** ${oldRole.position} → ${newRole.position}`
    );
  }


  if (
    oldRole.permissions.bitfield !==
    newRole.permissions.bitfield
  ) {

    changes.push(
      '**Permissions changed**'
    );
  }


  if (
    oldRole.mentionable !==
    newRole.mentionable
  ) {

    changes.push(
      `**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`
    );
  }


  if (
    oldRole.hoist !==
    newRole.hoist
  ) {

    changes.push(
      `**Displayed separately:** ${oldRole.hoist} → ${newRole.hoist}`
    );
  }


  if (
    !changes.length
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '✏️ Role Updated'
      )
      .addFields(
        {
          name:
            'Role',

          value:
            `${newRole.name} (${newRole.id})`,
        },

        {
          name:
            'Changes',

          value:
            clip(
              changes.join('\n')
            ),
        }
      )
      .setTimestamp();


  await sendLog(
    newRole.client,
    'server',
    embed
  );
}


/* =========================================================
   CHANNEL CREATED
========================================================= */

async function logChannelCreate(
  channel
) {

  if (
    !channel.guild
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🟢 Channel Created'
      )
      .addFields(
        {
          name:
            'Channel',

          value:
            `${channel.name} (${channel.id})`,
        },

        {
          name:
            'Type',

          value:
            String(
              channel.type
            ),
        },

        {
          name:
            'Category',

          value:
            channel.parent
              ? `${channel.parent.name} (${channel.parent.id})`
              : 'None',
        }
      )
      .setTimestamp();


  await sendLog(
    channel.client,
    'server',
    embed
  );
}


/* =========================================================
   CHANNEL DELETED
========================================================= */

async function logChannelDelete(
  channel
) {

  if (
    !channel.guild
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔴 Channel Deleted'
      )
      .addFields({
        name:
          'Channel',

        value:
          `${channel.name} (${channel.id})`,
      })
      .setTimestamp();


  await sendLog(
    channel.client,
    'server',
    embed
  );
}


/* =========================================================
   CHANNEL UPDATED
========================================================= */

async function logChannelUpdate(
  oldChannel,
  newChannel
) {

  if (
    !newChannel.guild
  ) {
    return;
  }


  const changes = [];


  if (
    oldChannel.name !==
    newChannel.name
  ) {

    changes.push(
      `**Name:** ${oldChannel.name} → ${newChannel.name}`
    );
  }


  if (
    oldChannel.topic !==
    newChannel.topic
  ) {

    changes.push(
      '**Topic changed**'
    );
  }


  if (
    oldChannel.parentId !==
    newChannel.parentId
  ) {

    changes.push(
      '**Category changed**'
    );
  }


  if (
    oldChannel.nsfw !==
    newChannel.nsfw
  ) {

    changes.push(
      `**NSFW:** ${oldChannel.nsfw} → ${newChannel.nsfw}`
    );
  }


  if (
    oldChannel.rateLimitPerUser !==
    newChannel.rateLimitPerUser
  ) {

    changes.push(
      `**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`
    );
  }


  if (
    !changes.length
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '✏️ Channel Updated'
      )
      .addFields(
        {
          name:
            'Channel',

          value:
            `${newChannel.name} (${newChannel.id})`,
        },

        {
          name:
            'Changes',

          value:
            clip(
              changes.join('\n')
            ),
        }
      )
      .setTimestamp();


  await sendLog(
    newChannel.client,
    'server',
    embed
  );
}


/* =========================================================
   SERVER UPDATED
========================================================= */

async function logGuildUpdate(
  oldGuild,
  newGuild
) {

  const changes = [];


  if (
    oldGuild.name !==
    newGuild.name
  ) {

    changes.push(
      `**Name:** ${oldGuild.name} → ${newGuild.name}`
    );
  }


  if (
    oldGuild.icon !==
    newGuild.icon
  ) {

    changes.push(
      '**Server icon changed**'
    );
  }


  if (
    oldGuild.banner !==
    newGuild.banner
  ) {

    changes.push(
      '**Server banner changed**'
    );
  }


  if (
    !changes.length
  ) {
    return;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🏠 Server Updated'
      )
      .addFields({
        name:
          'Changes',

        value:
          clip(
            changes.join('\n')
          ),
      })
      .setTimestamp();


  await sendLog(
    newGuild.client,
    'server',
    embed
  );
}


/* =========================================================
   TICKET CLOSED
========================================================= */

async function logTicketClose(
  client,
  data
) {

  const embed =
    new EmbedBuilder()
      .setTitle(
        '🔒 Ticket Closed'
      )
      .addFields(
        {
          name:
            'Ticket',

          value:
            data.channelName ||
            'Unknown',

          inline:
            true,
        },

        {
          name:
            'Opened By',

          value:
            data.ownerId
              ? `<@${data.ownerId}>`
              : 'Unknown',

          inline:
            true,
        },

        {
          name:
            'Closed By',

          value:
            data.closerId
              ? `<@${data.closerId}>`
              : 'Unknown',

          inline:
            true,
        },

        {
          name:
            'Confirmed By',

          value:
            data.confirmedBy
              ? `<@${data.confirmedBy}>`
              : 'N/A',

          inline:
            true,
        },

        {
          name:
            'Method',

          value:
            data.forced
              ? '⚡ Admin Force Close'
              : 'Normal Confirmation',

          inline:
            true,
        },

        {
          name:
            'Category',

          value:
            data.categoryId ||
            'Unknown',

          inline:
            true,
        },

        {
          name:
            'Reason',

          value:
            clip(
              data.reason ||
              'No reason provided'
            ),
        }
      )
      .setTimestamp();


  await sendLog(
    client,
    'ticket',
    embed
  );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  sendLog,

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

  logTicketClose,
};
