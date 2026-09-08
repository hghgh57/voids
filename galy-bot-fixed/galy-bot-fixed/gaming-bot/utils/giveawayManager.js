const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const GIVEAWAY_FILE = path.join(DATA_DIR, "giveaways.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadGiveaways() {
  try {
    if (!fs.existsSync(GIVEAWAY_FILE)) {
      fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify({}, null, 2));
      return {};
    }

    return JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
  } catch (error) {
    console.error("[GIVEAWAY] Failed to load giveaways:", error);
    return {};
  }
}

function saveGiveaways(giveaways) {
  try {
    fs.writeFileSync(
      GIVEAWAY_FILE,
      JSON.stringify(giveaways, null, 2)
    );
  } catch (error) {
    console.error("[GIVEAWAY] Failed to save giveaways:", error);
  }
}

function getGiveaways() {
  return loadGiveaways();
}

function getGiveaway(messageId) {
  const giveaways = loadGiveaways();
  return giveaways[messageId] || null;
}

function createGiveaway(data) {
  const giveaways = loadGiveaways();

  giveaways[data.messageId] = {
    ...data,
    entries: data.entries || [],
    ended: false,
    createdAt: Date.now()
  };

  saveGiveaways(giveaways);

  return giveaways[data.messageId];
}

function updateGiveaway(messageId, data) {
  const giveaways = loadGiveaways();

  if (!giveaways[messageId]) {
    return null;
  }

  giveaways[messageId] = {
    ...giveaways[messageId],
    ...data
  };

  saveGiveaways(giveaways);

  return giveaways[messageId];
}

function deleteGiveaway(messageId) {
  const giveaways = loadGiveaways();

  if (!giveaways[messageId]) {
    return false;
  }

  delete giveaways[messageId];
  saveGiveaways(giveaways);

  return true;
}

function addEntry(messageId, userId) {
  const giveaway = getGiveaway(messageId);

  if (!giveaway) {
    return {
      success: false,
      reason: "not_found"
    };
  }

  if (giveaway.ended) {
    return {
      success: false,
      reason: "ended"
    };
  }

  if (!Array.isArray(giveaway.entries)) {
    giveaway.entries = [];
  }

  if (giveaway.entries.includes(userId)) {
    return {
      success: false,
      reason: "already_entered"
    };
  }

  giveaway.entries.push(userId);

  updateGiveaway(messageId, {
    entries: giveaway.entries
  });

  return {
    success: true,
    giveaway
  };
}

function removeEntry(messageId, userId) {
  const giveaway = getGiveaway(messageId);

  if (!giveaway) {
    return {
      success: false,
      reason: "not_found"
    };
  }

  if (!Array.isArray(giveaway.entries)) {
    giveaway.entries = [];
  }

  const index = giveaway.entries.indexOf(userId);

  if (index === -1) {
    return {
      success: false,
      reason: "not_entered"
    };
  }

  giveaway.entries.splice(index, 1);

  updateGiveaway(messageId, {
    entries: giveaway.entries
  });

  return {
    success: true,
    giveaway
  };
}

function pickWinners(entries, amount) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [
      shuffled[j],
      shuffled[i]
    ];
  }

  return shuffled.slice(
    0,
    Math.min(amount, shuffled.length)
  );
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "Unknown";
  }

  return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

function buildGiveawayEmbed(giveaway) {
  const embed = new EmbedBuilder()
    .setTitle(giveaway.title || "Giveaway")
    .setDescription(
      giveaway.description ||
        "Click the button below to enter the giveaway!"
    )
    .setTimestamp();

  if (giveaway.prize) {
    embed.addFields({
      name: "Prize",
      value: String(giveaway.prize),
      inline: true
    });
  }

  if (giveaway.winners) {
    embed.addFields({
      name: "Winners",
      value: String(giveaway.winners),
      inline: true
    });
  }

  if (giveaway.endsAt) {
    embed.addFields({
      name: "Ends",
      value: formatTime(giveaway.endsAt),
      inline: true
    });
  }

  const entries = Array.isArray(giveaway.entries)
    ? giveaway.entries.length
    : 0;

  embed.addFields({
    name: "Entries",
    value: String(entries),
    inline: true
  });

  if (giveaway.hostedBy) {
    embed.setFooter({
      text: `Hosted by ${giveaway.hostedBy}`
    });
  }

  return embed;
}

function buildGiveawayButtons(giveaway) {
  const row = new ActionRowBuilder();

  if (!giveaway.ended) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join_${giveaway.messageId}`)
        .setLabel("Enter Giveaway")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎉"),

      new ButtonBuilder()
        .setCustomId(`giveaway_leave_${giveaway.messageId}`)
        .setLabel("Leave Giveaway")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🚪")
    );
  }

  return row;
}

async function updateGiveawayMessage(client, messageId) {
  const giveaway = getGiveaway(messageId);

  if (!giveaway) {
    return false;
  }

  try {
    const channel = await client.channels.fetch(
      giveaway.channelId
    );

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const message = await channel.messages.fetch(
      giveaway.messageId
    );

    if (!message) {
      return false;
    }

    await message.edit({
      embeds: [buildGiveawayEmbed(giveaway)],
      components: giveaway.ended
        ? []
        : [buildGiveawayButtons(giveaway)]
    });

    return true;
  } catch (error) {
    console.error(
      `[GIVEAWAY] Failed to update message ${messageId}:`,
      error
    );

    return false;
  }
}

async function finishGiveaway(client, messageId) {
  const giveaway = getGiveaway(messageId);

  if (!giveaway || giveaway.ended) {
    return null;
  }

  const winners = pickWinners(
    giveaway.entries || [],
    Number(giveaway.winners) || 1
  );

  updateGiveaway(messageId, {
    ended: true,
    winners,
    endedAt: Date.now()
  });

  try {
    const channel = await client.channels.fetch(
      giveaway.channelId
    );

    if (channel && channel.isTextBased()) {
      const message = await channel.messages.fetch(
        giveaway.messageId
      );

      if (message) {
        const winnerText =
          winners.length > 0
            ? winners.map(id => `<@${id}>`).join(", ")
            : "No valid winners.";

        const embed = new EmbedBuilder()
          .setTitle(`🎉 ${giveaway.title || "Giveaway"} — ENDED`)
          .setDescription(
            `**Prize:** ${giveaway.prize || "Unknown"}\n\n` +
            `**Winner(s):** ${winnerText}\n\n` +
            `**Entries:** ${
              Array.isArray(giveaway.entries)
                ? giveaway.entries.length
                : 0
            }`
          )
          .setTimestamp();

        await message.edit({
          embeds: [embed],
          components: []
        });

        if (winners.length > 0) {
          await channel.send(
            `🎉 Congratulations ${winnerText}! You won **${
              giveaway.title || giveaway.prize || "the giveaway"
            }**!`
          );
        } else {
          await channel.send(
            `❌ The giveaway **${
              giveaway.title || giveaway.prize || "giveaway"
            }** ended with no valid entries.`
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `[GIVEAWAY] Failed to finish giveaway ${messageId}:`,
      error
    );
  }

  return winners;
}

async function checkGiveaways(client) {
  const giveaways = loadGiveaways();
  const now = Date.now();

  for (const [messageId, giveaway] of Object.entries(
    giveaways
  )) {
    if (
      giveaway &&
      !giveaway.ended &&
      giveaway.endsAt &&
      Number(giveaway.endsAt) <= now
    ) {
      await finishGiveaway(client, messageId);
    }
  }
}

async function fetchRecentMessages(
  channel,
  maxMessages = 500
) {
  const messages = [];

  let before;

  while (
    messages.length <
    maxMessages
  ) {
    const remaining =
      Math.min(
        100,
        maxMessages -
          messages.length
      );

    const batch =
      await channel.messages.fetch({
        limit: remaining,

        ...(before
          ? {
              before
            }
          : {})
      });

    if (!batch.size) {
      break;
    }

    messages.push(
      ...batch.values()
    );

    const oldest =
      batch.last();

    if (!oldest) {
      break;
    }

    before = oldest.id;

    if (
      batch.size <
      remaining
    ) {
      break;
    }
  }

  return messages;
}

async function recoverGiveaways(client) {
  const giveaways = loadGiveaways();

  for (const [messageId, giveaway] of Object.entries(
    giveaways
  )) {
    if (!giveaway || giveaway.ended) {
      continue;
    }

    try {
      await updateGiveawayMessage(
        client,
        messageId
      );
    } catch (error) {
      console.error(
        `[GIVEAWAY] Failed to recover ${messageId}:`,
        error
      );
    }
  }
}

function startGiveawayChecker(client) {
  checkGiveaways(client).catch(error => {
    console.error(
      "[GIVEAWAY] Initial giveaway check failed:",
      error
    );
  });

  setInterval(() => {
    checkGiveaways(client).catch(error => {
      console.error(
        "[GIVEAWAY] Giveaway check failed:",
        error
      );
    });
  }, 15000);

  recoverGiveaways(client).catch(error => {
    console.error(
      "[GIVEAWAY] Giveaway recovery failed:",
      error
    );
  });

  console.log(
    "[GIVEAWAY] Giveaway checker started."
  );
}

module.exports = {
  loadGiveaways,
  saveGiveaways,
  getGiveaways,
  getGiveaway,
  createGiveaway,
  updateGiveaway,
  deleteGiveaway,
  addEntry,
  removeEntry,
  pickWinners,
  buildGiveawayEmbed,
  buildGiveawayButtons,
  updateGiveawayMessage,
  finishGiveaway,
  checkGiveaways,
  fetchRecentMessages,
  recoverGiveaways,
  startGiveawayChecker
};
