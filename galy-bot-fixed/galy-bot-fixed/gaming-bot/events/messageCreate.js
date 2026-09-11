const { EmbedBuilder } = require('discord.js');

const {
  getSticky,
  updateLastMessageId,
} = require('../utils/stickyManager');

const {
  logMessageCreate,
} = require('../utils/logger');

const {
  logModAction,
} = require('../utils/modLog');

const {
  setAfk,
  clearAfk,
  getAfk,
  isAfk,
} = require('../utils/afkManager');

const config = require('../config.json');

/* =========================================================
   LOGGER SERVER
========================================================= */

const LOGGER_GUILD_ID = '1542361762186268765';

/* =========================================================
   PREFIX COMMANDS
========================================================= */

const PREFIX = '!';

// Role allowed to use !purge, !lock and !unlock
const MOD_COMMAND_ROLE_ID = '1547855037345177660';

function hasModCommandRole(member) {
  return !!member?.roles.cache.has(MOD_COMMAND_ROLE_ID);
}

/* ---------------------------------------------------------
   !purge <amount>
--------------------------------------------------------- */

async function handlePurgeCommand(message, args) {
  if (!hasModCommandRole(message.member)) {
    const denied = await message.reply('You do not have permission to use this command.');
    setTimeout(() => denied.delete().catch(() => {}), 5000);
    return;
  }

  const amount = parseInt(args[0], 10);

  if (!amount || Number.isNaN(amount) || amount < 1) {
    return message.reply('Please provide a number of messages to delete (1-100). Example: `!purge 20`');
  }

  if (amount > 100) {
    return message.reply('You can only purge up to 100 messages at a time.');
  }

  let deleted;
  try {
    // +1 to also remove the "!purge" command message itself.
    // bulkDelete only works on messages younger than 14 days; older ones are skipped automatically.
    deleted = await message.channel.bulkDelete(amount + 1, true);
  } catch (err) {
    return message.channel.send({
      content: "Couldn't delete messages — I may be missing the Manage Messages permission in this channel.",
    });
  }

  const deletedCount = Math.max(deleted.size - 1, 0);

  const confirmation = await message.channel.send(`🧹 Deleted ${deletedCount} message(s).`);
  setTimeout(() => confirmation.delete().catch(() => {}), 5000);

  await logModAction(message.guild, {
    action: 'Purge',
    moderator: message.author,
    target: message.author,
    reason: `Purged messages in #${message.channel.name}`,
    extra: [
      { name: 'Channel', value: `${message.channel}`, inline: true },
      { name: 'Requested', value: `${amount}`, inline: true },
      { name: 'Deleted', value: `${deletedCount}`, inline: true },
    ],
  }).catch(() => {});
}

/* ---------------------------------------------------------
   !lock / !unlock
--------------------------------------------------------- */

async function handleLockCommand(message) {
  if (!hasModCommandRole(message.member)) {
    const denied = await message.reply('You do not have permission to use this command.');
    setTimeout(() => denied.delete().catch(() => {}), 5000);
    return;
  }

  const everyoneRole = message.guild.roles.everyone;
  await message.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
  await message.channel.send('🔒 This channel has been locked.');

  await logModAction(message.guild, {
    action: 'Channel Locked',
    moderator: message.author,
    target: message.author,
    reason: `#${message.channel.name}`,
  }).catch(() => {});
}

async function handleUnlockCommand(message) {
  if (!hasModCommandRole(message.member)) {
    const denied = await message.reply('You do not have permission to use this command.');
    setTimeout(() => denied.delete().catch(() => {}), 5000);
    return;
  }

  const everyoneRole = message.guild.roles.everyone;
  await message.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
  await message.channel.send('🔓 This channel has been unlocked.');

  await logModAction(message.guild, {
    action: 'Channel Unlocked',
    moderator: message.author,
    target: message.author,
    reason: `#${message.channel.name}`,
  }).catch(() => {});
}

/* ---------------------------------------------------------
   !afk [reason]
--------------------------------------------------------- */

async function handleAfkCommand(message, args) {
  const reason = args.join(' ').trim() || 'AFK';
  setAfk(message.author.id, reason);
  await message.reply(`💤 You are now AFK: ${reason}`);
}

/* ---------------------------------------------------------
   Dispatcher for prefix commands. Returns true if a command
   was matched & handled (caller should stop processing).
--------------------------------------------------------- */

async function handlePrefixCommands(message) {
  if (!message.guild) return false;
  if (!message.content.startsWith(PREFIX)) return false;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  switch (commandName) {
    case 'purge':
      await handlePurgeCommand(message, args);
      return true;
    case 'lock':
      await handleLockCommand(message);
      return true;
    case 'unlock':
      await handleUnlockCommand(message);
      return true;
    case 'afk':
      await handleAfkCommand(message, args);
      return true;
    default:
      return false;
  }
}

/* =========================================================
   AFK MENTION / REPLY / RETURN NOTICES
========================================================= */

async function handleAfkNotices(message) {
  // If the author was AFK and sends a new message, welcome them back.
  if (isAfk(message.author.id)) {
    clearAfk(message.author.id);
    const back = await message.reply('Your back!');
    setTimeout(() => back.delete().catch(() => {}), 5000);
  }

  const notifiedUserIds = new Set();

  // Replying to an AFK user
  if (message.reference?.messageId) {
    const repliedTo = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch(() => null);

    if (repliedTo && repliedTo.author.id !== message.author.id) {
      const afk = getAfk(repliedTo.author.id);
      if (afk) {
        notifiedUserIds.add(repliedTo.author.id);

        const embed = new EmbedBuilder()
          .setColor(0x99AAB5)
          .setDescription(`${repliedTo.author} is AFK: ${afk.reason}`);

        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  // @mentioning an AFK user
  for (const [userId, user] of message.mentions.users) {
    if (userId === message.author.id) continue;
    if (notifiedUserIds.has(userId)) continue;

    const afk = getAfk(userId);
    if (!afk) continue;

    notifiedUserIds.add(userId);

    const embed = new EmbedBuilder()
      .setColor(0x99AAB5)
      .setDescription(`${user} is AFK: ${afk.reason}`);

    await message.channel.send({ embeds: [embed] }).catch(() => {});
  }
}

/* =========================================================
   PING PROTECTION
========================================================= */

async function enforcePingProtection(message) {
  const roleId = config.pingProtectionRoleId;

  if (!roleId || roleId.startsWith('PUT_')) return false;
  if (!message.mentions.users.size) return false;

  const protectedHit = message.mentions.members?.some((member) =>
    member.roles.cache.has(roleId)
  );

  if (!protectedHit) return false;

  // Staff with Manage Server can still ping protected members
  if (message.member?.permissions.has('ManageGuild')) return false;

  await message.delete().catch((err) => {
    console.error(
      'Failed to delete message pinging a ping-protected member:',
      err
    );
  });

  await message.channel
    .send({
      content: `${message.author}, that member has ping protection — you can't ping them.`,
    })
    .then((notice) => {
      setTimeout(() => notice.delete().catch(() => {}), 6000);
    })
    .catch(() => {});

  return true;
}

/* =========================================================
   MESSAGE CREATE
========================================================= */

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    // Ignore bots
    if (message.author?.bot) return;

    // Don't log messages inside the logger server
    if (message.guild?.id === LOGGER_GUILD_ID) return;

    /* =====================================================
       CROSS-SERVER MESSAGE LOG
    ===================================================== */

    try {
      await logMessageCreate(message);
    } catch (err) {
      console.error('[MESSAGE] Failed to log message:', err);
    }

    /* =====================================================
       PREFIX COMMANDS (!purge, !lock, !unlock, !afk)
    ===================================================== */

    try {
      const handled = await handlePrefixCommands(message);
      if (handled) return;
    } catch (err) {
      console.error('[MESSAGE] Failed to handle prefix command:', err);
    }

    /* =====================================================
       AFK MENTION / REPLY / RETURN NOTICES
    ===================================================== */

    try {
      await handleAfkNotices(message);
    } catch (err) {
      console.error('[MESSAGE] Failed to handle AFK notices:', err);
    }

    /* =====================================================
       PING PROTECTION
    ===================================================== */

    if (await enforcePingProtection(message)) return;

    /* =====================================================
       STICKY MESSAGE
    ===================================================== */

    const sticky = getSticky(message.channel.id);
    if (!sticky) return;

    // Delete previous sticky
    if (sticky.lastMessageId) {
      const oldMsg = await message.channel.messages
        .fetch(sticky.lastMessageId)
        .catch(() => null);

      if (oldMsg) {
        await oldMsg.delete().catch(() => {});
      }
    }

    // Create blue embed
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setDescription(sticky.content)
      .setFooter({ text: '📌 Sticky Message' })
      .setTimestamp();

    const sent = await message.channel
      .send({ embeds: [embed] })
      .catch(() => null);

    if (sent) {
      updateLastMessageId(message.channel.id, sent.id);
    }
  },
};
