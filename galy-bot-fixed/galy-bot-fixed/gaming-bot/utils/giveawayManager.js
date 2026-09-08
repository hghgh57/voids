const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'giveaways.json');

// setTimeout only accepts a 32-bit signed int (~24.8 days) before it
// overflows and fires immediately. Giveaways can run up to 30 days, so
// long timers are chained instead of scheduled in one shot.
const MAX_TIMEOUT_MS = 2147483647;

function scheduleTimeout(callback, delay) {
  if (delay > MAX_TIMEOUT_MS) {
    return setTimeout(
      () => scheduleTimeout(callback, delay - MAX_TIMEOUT_MS),
      MAX_TIMEOUT_MS
    );
  }
  return setTimeout(callback, delay);
}


/* =========================================================
   STORAGE
========================================================= */

function loadGiveaways() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveGiveaways(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}


/* =========================================================
   DURATION HELPERS
========================================================= */

function parseDuration(str) {
  const match = str.toLowerCase().trim().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return num * multipliers[unit];
}

// Discord's <t:...:R> tag only updates in coarse steps (minutes at a time
// past the first minute), so on short giveaways it can look frozen. This
// builds a literal "Xm Ys" string from the actual remaining time, so it
// genuinely counts down every time we refresh the embed.
function formatTimeLeft(ms) {
  if (ms <= 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.slice(0, 2).join(' ');
}


/* =========================================================
   EMBED / BUTTONS
========================================================= */

function buildGiveawayEmbed(giveaway) {
  const ended = !!giveaway.ended;
  const hostedByLine = giveaway.hostId ? `**Hosted by:** <@${giveaway.hostId}>\n` : '';

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(ended ? '#2F3136' : '#89CFF0')
    .setTimestamp(giveaway.endTimestamp);

  if (ended) {
    embed.setDescription(
      giveaway.winners && giveaway.winners.length > 0
        ? `**Winner(s):** ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}\n\n${hostedByLine}`
        : `No valid entrants — no winner could be chosen.\n\n${hostedByLine}`
    );
    embed.setFooter({ text: 'Giveaway ended' });
  } else {
    const timeLeft = formatTimeLeft(giveaway.endTimestamp - Date.now());

    embed.setDescription(
      'Click below to enter!\n\n' +
      `**Winners:** ${giveaway.winnerCount}\n` +
      hostedByLine +
      `**Ends:** \`${timeLeft}\`\n\n` +
      `<t:${Math.floor(giveaway.endTimestamp / 1000)}:F>`
    );
    embed.setFooter({ text: 'Good luck!' });
  }

  return embed;
}

function buildJoinRow(entrantCount = 0, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_join')
      .setLabel(`🎉 Join Giveaway (${entrantCount})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

// Shown ephemerally to a user right after they join, so they have a quick
// way to back out without hunting for a toggle on the public message.
function buildLeaveRow(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_leave_${messageId}`)
      .setLabel('Leave Giveaway')
      .setStyle(ButtonStyle.Danger)
  );
}


/* =========================================================
   WINNER SELECTION
========================================================= */

function pickWinners(entrants, count) {
  const pool = [...entrants];
  const winners = [];
  const num = Math.min(count, pool.length);

  for (let i = 0; i < num; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  return winners;
}


/* =========================================================
   LIVE COUNTDOWN REFRESH

   Discord's <t:...:F> tag DOES tick down on its own client-side, but if
   the message never gets edited some clients cache/stop refreshing it
   and it visually "sticks". We force a re-render every 9s so it never
   freezes, on top of the live client-side ticking.
========================================================= */

const refreshIntervals = new Map();

function stopCountdownRefresh(messageId) {
  const existing = refreshIntervals.get(messageId);
  if (existing) {
    clearInterval(existing);
    refreshIntervals.delete(messageId);
  }
}

function startCountdownRefresh(client, messageId) {
  stopCountdownRefresh(messageId);

  const interval = setInterval(async () => {
    const giveaways = loadGiveaways();
    const giveaway = giveaways[messageId];

    if (!giveaway || giveaway.ended || Date.now() >= giveaway.endTimestamp) {
      stopCountdownRefresh(messageId);
      return;
    }

    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      const message = await channel.messages.fetch(messageId);

      await message.edit({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: [buildJoinRow((giveaway.entrants || []).length)],
      });
    } catch (err) {
      console.error('Giveaway countdown refresh error:', err);
    }
  }, 9 * 1000);

  refreshIntervals.set(messageId, interval);
}


/* =========================================================
   END / SCHEDULE / REARM
========================================================= */

async function endGiveaway(client, messageId) {
  const giveaways = loadGiveaways();
  const giveaway = giveaways[messageId];
  if (!giveaway || giveaway.ended) return;

  stopCountdownRefresh(messageId);

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);

    const winners = pickWinners(giveaway.entrants || [], giveaway.winnerCount);
    giveaway.ended = true;
    giveaway.winners = winners;
    giveaways[messageId] = giveaway;
    saveGiveaways(giveaways);

    await message.edit({
      embeds: [buildGiveawayEmbed(giveaway)],
      components: [buildJoinRow((giveaway.entrants || []).length, true)],
    });

    if (winners.length > 0) {
      await channel.send({
        content: `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**!`,
      });
    } else {
      await channel.send({ content: `No one entered the giveaway for **${giveaway.prize}**.` });
    }
  } catch (err) {
    console.error('Failed to end giveaway:', err);
  }
}

function scheduleGiveaway(client, messageId, msUntilEnd) {
  scheduleTimeout(() => endGiveaway(client, messageId), msUntilEnd);
  startCountdownRefresh(client, messageId);
}

function rearmActiveGiveaways(client) {
  const giveaways = loadGiveaways();
  const now = Date.now();

  for (const [messageId, giveaway] of Object.entries(giveaways)) {
    if (giveaway.ended) continue;

    const msLeft = giveaway.endTimestamp - now;
    if (msLeft <= 0) {
      endGiveaway(client, messageId);
    } else {
      scheduleGiveaway(client, messageId, msLeft);
    }
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  loadGiveaways,
  saveGiveaways,
  parseDuration,
  buildGiveawayEmbed,
  buildJoinRow,
  buildLeaveRow,
  pickWinners,
  endGiveaway,
  scheduleGiveaway,
  rearmActiveGiveaways,
};
