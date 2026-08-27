const {
  EmbedBuilder,
  AuditLogEvent,
} = require('discord.js');

const config = require('../config.json');


/* =========================================================
   LOGGER HELPERS
========================================================= */

function loggingEnabled() {
  return (
    config.logging?.enabled === true
  );
}


function getLogChannelId(type) {
  return config.logging?.channels?.[type];
}


async function getLogChannel(client, type) {
  if (!loggingEnabled()) return null;

  const channelId =
    getLogChannelId(type);

  if (
    !channelId ||
    channelId.startsWith('PUT_')
  ) {
    return null;
  }

  return client.channels
    .fetch(channelId)
    .catch(() => null);
}


function clip(value, length = 1024) {
  if (value === null || value === undefined) {
    return 'None';
  }

  const text = String(value);

  if (!text.length) {
    return 'None';
  }

  return text.slice(0, length);
}


function userText(user) {
  if (!user) return 'Unknown';

  return `${user.tag || user.username} (${user.id})`;
}


async function sendLog(
  client,
  type,
  embed
) {
  try {
    const channel =
      await getLogChannel(
        client,
        type
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return;
    }

    await channel.send({
      embeds: [embed],
    });
  }

  catch (err) {
    console.error(
      `[LOGGER] Failed to send ${type} log:`,
      err
    );
  }
}


/* =========================================================
   MESSAGE LOGS
========================================================= */

async function logMessageEdit(
  oldMessage,
  newMessage
) {
  if (!oldMessage?.guild) return;

  if (
    oldMessage.author?.bot &&
    newMessage.author?.bot
  ) {
    return;
  }

  const oldContent =
    oldMessage.content || 'No content';

  const newContent =
    newMessage.content || 'No content';

  if (oldContent === newContent) {
    return;
  }

  const embed =
    new EmbedBuilder()
      .setTitle('✏️ Message Edited')
      .addFields(
        {
          name: 'User',
          value: userText(
            oldMessage.author
          ),
          inline: true,
        },
        {
          name: 'Channel',
          value:
            `${oldMessage.channel}`,
          inline: true,
        },
        {
          name: 'Message ID',
          value:
            oldMessage.id,
          inline: true,
        },
        {
          name: 'Before',
          value:
            clip(oldContent),
        },
        {
          name: 'After',
          value:
            clip(newContent),
        }
      )
      .setTimestamp();

  if (newMessage.url) {
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


async function logMessageDelete(
  message
) {
  if (!message?.guild) return;

  if (message.author?.bot) {
    return;
  }

  const embed =
    new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .addFields(
        {
          name: 'User',
          value:
            userText(message.author),
          inline: true,
        },
        {
          name: 'Channel',
          value:
            `${message.channel}`,
          inline: true,
        },
        {
          name: 'Message ID',
          value:
            message.id,
          inline: true,
        },
        {
          name: 'Content',
          value:
            clip(
              message.content ||
              'Content unavailable'
            ),
        }
      )
      .setTimestamp();

  await sendLog(
    message.client,
    'message',
    embed
  );
}


/* =========================================================
   MEMBER LOGS
========================================================= */

async function logMemberJoin(
  member
) {
  const embed =
    new EmbedBuilder()
      .setTitle('📥 Member Joined')
      .addFields(
        {
          name: 'User',
          value:
            userText(member.user),
          inline: true,
        },
        {
          name: 'Account Created',
          value:
            `<t:${Math.floor(
              member.user.createdTimestamp / 1000
            )}:F>`,
          inline: true,
        },
        {
          name: 'Member Count',
          value:
            String(
              member.guild.memberCount
            ),
          inline: true,
        }
      )
      .setTimestamp();

  await sendLog(
    member.client,
    'member',
    embed
  );
}


async function logMemberLeave(
  member
) {
  const embed =
    new EmbedBuilder()
      .setTitle('📤 Member Left')
      .addFields(
        {
          name: 'User',
          value:
            userText(member.user),
          inline: true,
        },
        {
          name: 'Member ID',
          value:
            member.id,
          inline: true,
        }
      )
      .setTimestamp();

  await sendLog(
    member.client,
    'member',
    embed
  );
}


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
      .setTitle('✏️ Nickname Changed')
      .addFields(
        {
          name: 'User',
          value:
            userText(newMember.user),
          inline: true,
        },
        {
          name: 'Before',
          value:
            oldMember.nickname ||
            oldMember.user.username,
          inline: true,
        },
        {
          name: 'After',
          value:
            newMember.nickname ||
            newMember.user.username,
          inline: true,
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
   MODERATION LOGS
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
    Boolean(newTimeout);

  const embed =
    new EmbedBuilder()
      .setTitle(
        isTimedOut
          ? '⏱️ Member Timed Out'
          : '✅ Timeout Removed'
      )
      .addFields(
        {
          name: 'User',
          value:
            userText(newMember.user),
          inline: true,
        },
        {
          name: 'Until',
          value:
            newTimeout
              ? `<t:${Math.floor(
                  newTimeout / 1000
                )}:F>`
              : 'Timeout removed',
          inline: true,
        }
      )
      .setTimestamp();

  await sendLog(
    newMember.client,
    'moderation',
    embed
  );
}


async function getAuditExecutor(
  guild,
  type,
  targetId
) {
  try {
    const logs =
      await guild.fetchAuditLogs({
        type,
        limit: 5,
      });

    const entry =
      logs.entries.find(
        (entry) =>
          entry.target?.id === targetId &&
          Date.now() -
            entry.createdTimestamp <
            10000
      );

    return entry || null;
  }

  catch {
    return null;
  }
}


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
      .setTitle('🔨 Member Banned')
      .addFields(
        {
          name: 'User',
          value:
            userText(ban.user),
          inline: true,
        },
        {
          name: 'Moderator',
          value:
            entry?.executor
              ? userText(entry.executor)
              : 'Unknown',
          inline: true,
        },
        {
          name: 'Reason',
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
      .setTitle('🔓 Member Unbanned')
      .addFields(
        {
          name: 'User',
          value:
            userText(ban.user),
          inline: true,
        },
        {
          name: 'Moderator',
          value:
            entry?.executor
              ? userText(entry.executor)
              : 'Unknown',
          inline: true,
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
   ROLE LOGS
========================================================= */

async function logRoleCreate(
  role
) {
  const embed =
    new EmbedBuilder()
      .setTitle('🟢 Role Created')
      .addFields(
        {
          name: 'Role',
          value:
            `${role.name} (${role.id})`,
          inline: true,
        },
        {
          name: 'Color',
          value:
            role.hexColor,
          inline: true,
        }
      )
      .setTimestamp();

  await sendLog(
    role.client,
    'server',
    embed
  );
}


async function logRoleDelete(
  role
) {
  const embed =
    new EmbedBuilder()
      .setTitle('🔴 Role Deleted')
      .addFields(
        {
          name: 'Role',
          value:
            `${role.name} (${role.id})`,
        }
      )
      .setTimestamp();

  await sendLog(
    role.client,
    'server',
    embed
  );
}


async function logRoleUpdate(
  oldRole,
  newRole
) {
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

  if (!changes.length) {
    return;
  }

  const embed =
    new EmbedBuilder()
      .setTitle('✏️ Role Updated')
      .addFields(
        {
          name: 'Role',
          value:
            `${newRole.name} (${newRole.id})`,
        },
        {
          name: 'Changes',
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
   CHANNEL LOGS
========================================================= */

async function logChannelCreate(
  channel
) {
  if (!channel.guild) return;

  const embed =
    new EmbedBuilder()
      .setTitle('🟢 Channel Created')
      .addFields(
        {
          name: 'Channel',
          value:
            `${channel.name} (${channel.id})`,
        },
        {
          name: 'Type',
          value:
            String(channel.type),
        }
      )
      .setTimestamp();

  await sendLog(
    channel.client,
    'server',
    embed
  );
}


async function logChannelDelete(
  channel
) {
  if (!channel.guild) return;

  const embed =
    new EmbedBuilder()
      .setTitle('🔴 Channel Deleted')
      .addFields(
        {
          name: 'Channel',
          value:
            `${channel.name} (${channel.id})`,
        }
      )
      .setTimestamp();

  await sendLog(
    channel.client,
    'server',
    embed
  );
}


async function logChannelUpdate(
  oldChannel,
  newChannel
) {
  if (!newChannel.guild) return;

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
      `**Topic changed**`
    );
  }

  if (
    oldChannel.parentId !==
    newChannel.parentId
  ) {
    changes.push(
      `**Category changed**`
    );
  }

  if (!changes.length) {
    return;
  }

  const embed =
    new EmbedBuilder()
      .setTitle('✏️ Channel Updated')
      .addFields(
        {
          name: 'Channel',
          value:
            `${newChannel.name} (${newChannel.id})`,
        },
        {
          name: 'Changes',
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
   TICKET LOG
========================================================= */

async function logTicketClose(
  client,
  data
) {
  const embed =
    new EmbedBuilder()
      .setTitle('🔒 Ticket Closed')
      .addFields(
        {
          name: 'Ticket',
          value:
            data.channelName || 'Unknown',
          inline: true,
        },
        {
          name: 'Opened By',
          value:
            `<@${data.ownerId}>`,
          inline: true,
        },
        {
          name: 'Closed By',
          value:
            `<@${data.closerId}>`,
          inline: true,
        },
        {
          name: 'Confirmed By',
          value:
            data.confirmedBy
              ? `<@${data.confirmedBy}>`
              : 'N/A',
          inline: true,
        },
        {
          name: 'Method',
          value:
            data.forced
              ? '⚡ Admin Force Close'
              : 'Normal Confirmation',
          inline: true,
        },
        {
          name: 'Category',
          value:
            data.categoryId || 'Unknown',
          inline: true,
        },
        {
          name: 'Reason',
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

  logMessageEdit,
  logMessageDelete,

  logMemberJoin,
  logMemberLeave,
  logNicknameChange,

  logTimeout,

  logBan,
  logUnban,

  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,

  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,

  logTicketClose,
};
