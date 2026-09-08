const config = require('../config.json');


/* =========================================================
   CONFIGURED GIVEAWAY CHANNELS
========================================================= */

function configuredChannelIds() {

  return (
    config.giveawayCheckChannelIds ||
    []
  ).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );

}


/* =========================================================
   GET ALL MESSAGE TEXT
========================================================= */

function messageText(
  message
) {

  const parts = [];


  if (
    message.content
  ) {

    parts.push(
      message.content
    );

  }


  for (
    const embed of
    message.embeds || []
  ) {

    if (
      embed.title
    ) {

      parts.push(
        embed.title
      );

    }


    if (
      embed.description
    ) {

      parts.push(
        embed.description
      );

    }


    for (
      const field of
      embed.fields || []
    ) {

      if (
        field.name
      ) {

        parts.push(
          field.name
        );

      }


      if (
        field.value
      ) {

        parts.push(
          field.value
        );

      }

    }

  }


  return parts.join(
    '\n'
  );

}


/* =========================================================
   CHECK IF MESSAGE LOOKS LIKE A WINNER MESSAGE
========================================================= */

function looksLikeWinnerMessage(
  message,
  userId
) {

  /*
   * GiveawayBot is a bot, so only inspect bot messages.
   */

  if (
    !message?.author?.bot
  ) {

    return false;

  }


  const text =
    messageText(
      message
    );


  if (!text) {

    return false;

  }


  const lower =
    text.toLowerCase();


  /*
   * The user must actually be mentioned.
   */

  const mentionsUser =
    message.mentions?.users?.has(
      userId
    ) ||

    text.includes(
      `<@${userId}>`
    ) ||

    text.includes(
      `<@!${userId}>`
    );


  if (!mentionsUser) {

    return false;

  }


  /*
   * Words commonly used in winner announcements.
   */

  const winnerWords = [

    'congratulations',

    'congrats',

    'winner',

    'winners',

    'you won',

    'won',

    'winner(s)',

  ];


  /*
   * Words that make it much more likely
   * that this is actually a giveaway result.
   */

  const giveawayWords = [

    'giveaway',

    'give away',

    'prize',

    'reroll',

    'ended',

  ];


  const hasWinnerWord =
    winnerWords.some(
      (word) =>
        lower.includes(
          word
        )
    );


  const hasGiveawayWord =
    giveawayWords.some(
      (word) =>
        lower.includes(
          word
        )
    );


  return (
    hasWinnerWord &&
    hasGiveawayWord
  );

}


/* =========================================================
   EXTRACT PRIZE
========================================================= */

function extractPrize(
  message,
  userId
) {

  const texts = [];


  if (
    message.content
  ) {

    texts.push(
      message.content
    );

  }


  for (
    const embed of
    message.embeds || []
  ) {

    if (
      embed.title
    ) {

      texts.push(
        embed.title
      );

    }


    if (
      embed.description
    ) {

      texts.push(
        embed.description
      );

    }


    for (
      const field of
      embed.fields || []
    ) {

      if (
        field.name
      ) {

        texts.push(
          field.name
        );

      }


      if (
        field.value
      ) {

        texts.push(
          field.value
        );

      }

    }

  }


  const cleaned =
    texts
      .join('\n')
      .replace(
        new RegExp(
          `<@!?${userId}>`,
          'g'
        ),
        ''
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();


  const patterns = [

    /you won\s+(.+?)(?:!|\.|$)/i,

    /won\s+(.+?)(?:!|\.|$)/i,

    /prize\s*[:\-]\s*(.+?)(?:\n|$)/i,

  ];


  for (
    const pattern of
    patterns
  ) {

    const match =
      cleaned.match(
        pattern
      );


    if (
      match?.[1]
    ) {

      return match[1]
        .replace(
          /^[:\-\s]+/,
          ''
        )
        .trim()
        .slice(
          0,
          1024
        );

    }

  }


  /*
   * Fallback to an embed title if possible.
   */

  for (
    const embed of
    message.embeds || []
  ) {

    if (
      embed.title &&
      !/giveaway|ended|winner/i.test(
        embed.title
      )
    ) {

      return embed.title.slice(
        0,
        1024
      );

    }

  }


  return (
    'Giveaway prize found — ' +
    'please check the giveaway message.'
  );

}


/* =========================================================
   FETCH RECENT MESSAGES
========================================================= */

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

        limit:
          remaining,

        ...(before
          ? {
              before
            }
          : {}),

      });


    if (
      !batch.size
    ) {

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


    before =
      oldest.id;


    if (
      batch.size <
      remaining
    ) {

      break;

    }

  }


  return messages;

}


/* =========================================================
   FIND GIVEAWAY WIN
========================================================= */

async function findGiveawayWin(
  guild,
  userId
) {

  const channelIds =
    configuredChannelIds();


  if (
    !channelIds.length
  ) {

    return {

      configured:
        false,

      found:
        false,

      results:
        [],

    };

  }


  const results = [];


  for (
    const channelId of
    channelIds
  ) {

    const channel =
      await guild.channels
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

      continue;

    }


    let messages;


    try {

      messages =
        await fetchRecentMessages(
          channel,
          500
        );

    } catch (error) {

      console.error(
        `[GIVEAWAY CHECK] Failed to read #${channel.name}:`,
        error
      );

      continue;

    }


    for (
      const message of
      messages
    ) {

      if (
        !looksLikeWinnerMessage(
          message,
          userId
        )
      ) {

        continue;

      }


      results.push({

        channelId:
          channel.id,

        channelName:
          channel.name,

        messageId:
          message.id,

        messageUrl:
          message.url,

        prize:
          extractPrize(
            message,
            userId
          ),

        createdTimestamp:
          message.createdTimestamp,

      });

    }

  }


  /*
   * Newest wins first.
   */

  results.sort(
    (a, b) =>
      b.createdTimestamp -
      a.createdTimestamp
  );


  return {

    configured:
      true,

    found:
      results.length > 0,

    results,

  };

}


module.exports = {

  findGiveawayWin,

};
