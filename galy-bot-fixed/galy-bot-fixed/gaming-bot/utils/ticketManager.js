const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config = require('../config.json');

const { buildTranscript } =
  require('./transcript');

const {
  buildApplicationEmbed,
  buildDecisionRow,
} =
  require('./applicationManager');

const {
  incrementStat,
} =
  require('./staffTracker');

const {
  logTicketClose,
} =
  require('./logger');


/* =========================================================
   TICKET METADATA
========================================================= */

function parseTopic(topic) {
  if (
    !topic ||
    !topic.startsWith('ticket|')
  ) {
    return null;
  }

  const [
    ,
    userId,
    categoryId,
  ] = topic.split('|');

  if (
    !userId ||
    !categoryId
  ) {
    return null;
  }

  return {
    userId,
    categoryId,
  };
}


function countOpenTicketsForUser(
  guild,
  userId
) {
  return guild.channels.cache.filter(
    (channel) => {

      const meta =
        parseTopic(
          channel.topic
        );

      return (
        meta &&
        meta.userId === userId
      );
    }
  ).size;
}


/* =========================================================
   TICKET BUTTONS
========================================================= */

function buildTicketControlRow(
  claimed = false
) {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          'ticket_claim'
        )
        .setLabel(
          claimed
            ? 'Claimed'
            : 'Claim'
        )
        .setEmoji('🙋')
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          claimed
        ),

      new ButtonBuilder()
        .setCustomId(
          'ticket_close'
        )
        .setLabel('Close')
        .setEmoji('🔒')
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          'ticket_close_reason'
        )
        .setLabel(
          'Close with Reason'
        )
        .setEmoji('📝')
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}


/* =========================================================
   ROLE HELPERS
========================================================= */

function getTicketRoleIds() {
  return (
    config.ticketRoleIds || []
  ).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );
}


function getApplicationTicketRoleIds() {
  return (
    config.applicationTicketRoleIds || []
  ).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );
}


function getServiceTicketRoleIds() {

  const ids =
    (
      config.serviceTicketRoleIds ||
      []
    ).filter(
      (id) =>
        id &&
        typeof id === 'string' &&
        !id.startsWith('PUT_')
    );

  return ids.length
    ? ids
    : getTicketRoleIds();
}


/* =========================================================
   CATEGORY HELPERS
========================================================= */

function isApplicationTicket(
  categoryId
) {
  return (
    config.applications || []
  ).some(
    (application) =>
      application.id ===
      categoryId
  );
}


function isServiceTicket(
  categoryId
) {
  return (
    config.serviceCategories || []
  ).some(
    (category) =>
      category.id ===
      categoryId
  );
}


function findCategory(
  categoryId
) {
  return (
    (
      config.categories || []
    ).find(
      (category) =>
        category.id ===
        categoryId
    )

    ||

    (
      config.serviceCategories || []
    ).find(
      (category) =>
        category.id ===
        categoryId
    )
  );
}


function getRoleIdsForTicket(
  categoryId
) {

  const category =
    findCategory(
      categoryId
    );

  const categoryRoleIds =
    (
      category?.roleIds ||
      []
    ).filter(
      (id) =>
        id &&
        typeof id === 'string' &&
        !id.startsWith('PUT_')
    );


  if (
    categoryRoleIds.length
  ) {
    return categoryRoleIds;
  }


  if (
    isApplicationTicket(
      categoryId
    )
  ) {
    return getApplicationTicketRoleIds();
  }


  if (
    isServiceTicket(
      categoryId
    )
  ) {
    return getServiceTicketRoleIds();
  }


  return getTicketRoleIds();
}


/* =========================================================
   GIVEAWAY CLAIM CHECK
========================================================= */

/*
 * Official GiveawayBot ID.
 *
 * Void does NOT run the giveaway.
 * Void only reads the giveaway result messages
 * from the configured giveaway channels.
 */
const OFFICIAL_GIVEAWAY_BOT_ID =
  '294882584201003009';


function getGiveawayChannelIds() {

  const ids =
    config.giveawayChannelIds ||
    config.giveawayChannels ||
    [];

  if (
    !Array.isArray(ids)
  ) {
    return [];
  }

  return [
    ...new Set(
      ids.filter(
        (id) =>
          typeof id === 'string' &&
          /^\d{17,20}$/.test(id)
      )
    ),
  ];
}


/*
 * Get Discord IDs from mentions.
 */
function extractUserIdsFromText(
  text
) {

  if (!text) {
    return [];
  }

  const ids = [];

  const regex =
    /<@!?(\d{17,20})>/g;

  let match;

  while (
    (match =
      regex.exec(text)) !== null
  ) {

    ids.push(
      match[1]
    );
  }

  return ids;
}


/*
 * Check whether the message contains
 * a winner mention for the ticket owner.
 */
function messageContainsWinner(
  message,
  userId
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

    if (
      embed.footer?.text
    ) {
      parts.push(
        embed.footer.text
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


  const text =
    parts.join('\n');


  /*
   * Only treat the message as a win if it
   * contains winner-related wording.
   */
  const winnerText =
    /winner\(s\)?|winner|won|congratulations/i
      .test(text);


  if (!winnerText) {
    return false;
  }


  return extractUserIdsFromText(
    text
  ).includes(
    userId
  );
}


/*
 * Try to get the giveaway prize.
 */
function extractGiveawayPrize(
  message
) {

  for (
    const embed of
    message.embeds || []
  ) {

    if (
      embed.title
    ) {

      const title =
        embed.title
          .replace(
            /^🎉\s*/,
            ''
          )
          .trim();

      if (title) {
        return title.slice(
          0,
          256
        );
      }
    }


    const description =
      embed.description || '';


    const prizeMatch =
      description.match(
        /(?:prize|giveaway)\s*[:\-]\s*([^\n]+)/i
      );


    if (
      prizeMatch?.[1]
    ) {

      return prizeMatch[1]
        .trim()
        .slice(
          0,
          256
        );
    }
  }


  const content =
    message.content || '';


  const contentPrize =
    content.match(
      /(?:won|giveaway(?:\s+for)?)\s+\*\*([^*]+)\*\*/i
    );


  if (
    contentPrize?.[1]
  ) {

    return contentPrize[1]
      .trim()
      .slice(
        0,
        256
      );
  }


  return 'Unknown prize';
}


/*
 * Make sure this is an ended giveaway result.
 */
function isEndedGiveawayMessage(
  message
) {

  if (!message) {
    return false;
  }

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

    if (
      embed.footer?.text
    ) {
      parts.push(
        embed.footer.text
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


  return /winner\(s\)?|giveaway ended|ended/i
    .test(
      parts.join('\n')
    );
}


/*
 * Scan one giveaway channel.
 */
async function scanGiveawayChannel(
  channel,
  userId,
  maxMessages
) {

  const wins = [];

  let before;

  let scanned = 0;


  while (
    scanned <
    maxMessages
  ) {

    const remaining =
      maxMessages -
      scanned;


    const limit =
      Math.min(
        100,
        remaining
      );


    const options = {
      limit,
    };


    if (
      before
    ) {

      options.before =
        before;
    }


    const messages =
      await channel.messages
        .fetch(
          options
        )
        .catch(
          (error) => {

            console.error(
              `[GIVEAWAY CLAIM] Failed to read #${channel.id}:`,
              error
            );

            return null;
          }
        );


    if (
      !messages ||
      !messages.size
    ) {
      break;
    }


    scanned +=
      messages.size;


    for (
      const message of
      messages.values()
    ) {

      /*
       * Only read messages sent by the
       * official GiveawayBot.
       */
      if (
        message.author?.id !==
        OFFICIAL_GIVEAWAY_BOT_ID
      ) {
        continue;
      }


      if (
        !messageContainsWinner(
          message,
          userId
        )
      ) {
        continue;
      }


      if (
        !isEndedGiveawayMessage(
          message
        )
      ) {
        continue;
      }


      wins.push({

        messageId:
          message.id,

        channelId:
          channel.id,

        prize:
          extractGiveawayPrize(
            message
          ),

        createdTimestamp:
          message.createdTimestamp ||
          0,

      });
    }


    const oldest =
      messages.last();


    if (
      !oldest ||
      messages.size <
        limit
    ) {
      break;
    }


    before =
      oldest.id;
  }


  return wins;
}


/*
 * Scan every configured GiveawayBot channel.
 */
async function findGiveawayWins(
  client,
  guild,
  userId
) {

  const configuredChannelIds =
    getGiveawayChannelIds();


  if (
    !configuredChannelIds.length
  ) {

    console.warn(
      '[GIVEAWAY CLAIM] No giveawayChannelIds are configured in config.json.'
    );

    return [];
  }


  const maxMessages =
    Math.max(
      100,
      Math.min(
        Number(
          config.giveawayScanMessageLimit ||
          2000
        ),
        10000
      )
    );


  const wins = [];


  for (
    const channelId of
    configuredChannelIds
  ) {

    const channel =
      await client.channels
        .fetch(
          channelId
        )
        .catch(
          (error) => {

            console.error(
              `[GIVEAWAY CLAIM] Could not fetch giveaway channel ${channelId}:`,
              error
            );

            return null;
          }
        );


    if (!channel) {
      continue;
    }


    if (
      channel.guildId !==
      guild.id
    ) {

      console.warn(
        `[GIVEAWAY CLAIM] Ignoring giveaway channel ${channelId} because it is not in ${guild.id}.`
      );

      continue;
    }


    if (
      !channel.isTextBased()
    ) {
      continue;
    }


    const channelWins =
      await scanGiveawayChannel(
        channel,
        userId,
        maxMessages
      );


    wins.push(
      ...channelWins
    );
  }


  /*
   * Remove duplicate results.
   */
  const unique =
    new Map();


  for (
    const win of
    wins
  ) {

    unique.set(
      `${win.channelId}:${win.messageId}`,
      win
    );
  }


  return [
    ...unique.values()
  ].sort(
    (a, b) =>
      b.createdTimestamp -
      a.createdTimestamp
  );
}


/* =========================================================
   TICKET CREATION
========================================================= */

async function createTicket(
  interaction,
  categoryId,
  answers = []
) {

  try {

    const guild =
      interaction.guild;


    const user =
      interaction.user;


    if (!guild) {

      return null;
    }


    const category =
      findCategory(
        categoryId
      );


    if (!category) {

      await interaction.reply({
        content:
          '❌ That ticket category does not exist.',
        ephemeral: true,
      }).catch(
        () => {}
      );

      return null;
    }


    const openTickets =
      countOpenTicketsForUser(
        guild,
        user.id
      );


    const maxTickets =
      Number(
        config.maxOpenTickets ||
        1
      );


    if (
      openTickets >=
      maxTickets
    ) {

      await interaction.reply({
        content:
          `❌ You already have ${openTickets} open ticket${openTickets === 1 ? '' : 's'}. The maximum is ${maxTickets}.`,
        ephemeral: true,
      }).catch(
        () => {}
      );

      return null;
    }


    const staffRoleIds =
      getRoleIdsForTicket(
        categoryId
      );


    const permissionOverwrites = [

      {
        id:
          guild.roles.everyone.id,

        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      },

      {
        id:
          user.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },

      {
        id:
          interaction.client.user.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },

    ];


    for (
      const roleId of
      staffRoleIds
    ) {

      permissionOverwrites.push({

        id:
          roleId,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],

      });
    }


    const safeName =
      user.username
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ''
        )
        .slice(
          0,
          20
        )
      ||
      'user';


    const channelOptions = {

      name:
        `${category.id}-${safeName}`,

      type:
        ChannelType.GuildText,

      topic:
        `ticket|${user.id}|${categoryId}`,

      permissionOverwrites,

    };


    const requestedParentId =
      category.categoryId ||
      category.parentId ||
      config.ticketCategoryId;


    if (
      requestedParentId &&
      typeof requestedParentId === 'string' &&
      !requestedParentId.startsWith('PUT_')
    ) {

      const parent =
        await guild.channels
          .fetch(
            requestedParentId
          )
          .catch(
            () => null
          );


      if (
        parent &&
        parent.type ===
          ChannelType.GuildCategory
      ) {

        channelOptions.parent =
          requestedParentId;

      } else {

        console.warn(
          `[TICKET] Configured parent ${requestedParentId} is not a valid category; creating at server root.`
        );
      }
    }


    const channel =
      await guild.channels.create(
        channelOptions
      );


    const welcomeEmbed =
      new EmbedBuilder()
        .setTitle(
          `${category.emoji || '🎫'} ${category.label}`
        )
        .setDescription(
          `Hi ${user}, thanks for reaching out!\n\n` +
          `**Category:** ${category.label}\n\n` +
          'Please provide as much detail as possible. ' +
          'A member of our team will be with you shortly.'
        )
        .setColor(
          config.panel?.color ||
          '#5865F2'
        )
        .setTimestamp();


    /*
     * Put the claim answers in the SAME embed.
     */
    if (
      answers.length
    ) {

      welcomeEmbed.addFields(
        answers.map(
          (answer) => ({

            name:
              String(
                answer.question
              ).slice(
                0,
                256
              ),

            value:
              String(
                answer.answer ||
                'No answer'
              ).slice(
                0,
                1024
              ),

          })
        )
      );
    }


    /* =====================================================
       GIVEAWAY CLAIM VERIFICATION
    ===================================================== */

    let giveawayWinButtons = [];


    if (
      categoryId ===
      'giveaway_claim'
    ) {

      const wins =
        await findGiveawayWins(
          interaction.client,
          guild,
          user.id
        );


      if (
        wins.length > 0
      ) {

        welcomeEmbed.addFields({

          name:
            '🎉 Giveaway Result',

          value:
            `✅ **Yes, you won ${wins.length === 1 ? 'a giveaway' : `${wins.length} giveaways`}!**\n\n` +

            wins
              .slice(
                0,
                10
              )
              .map(
                (win) =>
                  `🎁 **${String(win.prize).slice(0, 100)}**`
              )
              .join('\n'),

        });


        giveawayWinButtons =
          wins
            .slice(
              0,
              5
            )
            .map(
              (win, index) =>

                new ButtonBuilder()

                  .setLabel(
                    wins.length === 1
                      ? 'Jump to Win'
                      : `Jump to Win ${index + 1}`
                  )

                  .setStyle(
                    ButtonStyle.Link
                  )

                  .setURL(
                    `https://discord.com/channels/${guild.id}/${win.channelId}/${win.messageId}`
                  )
            );


      } else {

        welcomeEmbed.addFields({

          name:
            '🎉 Giveaway Result',

          value:
            '❌ **No win found.**\n\n' +
            'We could not find a GiveawayBot win for you in the configured giveaway channels. Staff can still check manually if you believe this is incorrect.',

        });
      }
    }


    const mentions =
      staffRoleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
        )
        .join(' ');


    const ticketComponents = [

      buildTicketControlRow(),

    ];


    if (
      giveawayWinButtons.length > 0
    ) {

      ticketComponents.push(

        new ActionRowBuilder()
          .addComponents(
            giveawayWinButtons
          )

      );
    }


    /*
     * Everything is sent as ONE embed/message.
     */
    await channel.send({

      content:
        `${user} ${mentions}`.trim(),

      embeds: [
        welcomeEmbed,
      ],

      components:
        ticketComponents,

    });


    console.log(
      `[TICKET] Successfully created ticket ${channel.id}`
    );


    return channel;

  } catch (err) {

    console.error(
      '[TICKET] Failed to create ticket:',
      err
    );


    return null;
  }
}


/* =========================================================
   APPLICATION TICKET
========================================================= */

async function createApplicationTicket(
  interaction,
  appId,
  answers = []
) {

  try {

    const guild =
      interaction.guild;


    const user =
      interaction.user;


    if (!guild) {
      return null;
    }


    const applications =
      config.applications || [];


    const appConfig =
      applications.find(
        (application) =>
          application.id ===
          appId
      );


    if (!appConfig) {

      return null;
    }


    const member =
      interaction.member;


    const applicationRoleIds =
      getApplicationTicketRoleIds();


    const permissionOverwrites = [

      {
        id:
          guild.roles.everyone.id,

        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      },

      {
        id:
          user.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },

      {
        id:
          interaction.client.user.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },

    ];


    for (
      const roleId of
      applicationRoleIds
    ) {

      permissionOverwrites.push({

        id:
          roleId,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],

      });
    }


    const safeName =
      user.username
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ''
        )
        .slice(
          0,
          20
        )
      ||
      'user';


    const channelOptions = {

      name:
        `app-${safeName}`,

      type:
        ChannelType.GuildText,

      topic:
        `ticket|${user.id}|application_${appId}`,

      permissionOverwrites,

    };


    const candidateParentIds = [

      config.applicationTicketCategoryId,

      config.ticketCategoryId,

    ].filter(
      (id, index, arr) =>
        id &&
        typeof id === 'string' &&
        !id.startsWith('PUT_') &&
        arr.indexOf(id) === index
    );


    for (
      const candidateId of
      candidateParentIds
    ) {

      const candidate =
        await guild.channels
          .fetch(
            candidateId
          )
          .catch(
            () => null
          );


      if (
        candidate &&
        candidate.type ===
          ChannelType.GuildCategory
      ) {

        channelOptions.parent =
          candidateId;

        break;
      }
    }


    console.log(
      '[APPLICATION] Creating application ticket:',
      {

        userId:
          user.id,

        appId,

        parentId:
          channelOptions.parent ||
          'none',

        roles:
          applicationRoleIds,

      }
    );


    const channel =
      await guild.channels.create(
        channelOptions
      );


    const embed =
      buildApplicationEmbed(
        member,
        appConfig,
        answers
      );


    const decisionRow =
      buildDecisionRow(
        user.id,
        appId
      );


    const mentions =
      applicationRoleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
        )
        .join(' ');


    await channel.send({

      content:
        `${user} ${mentions}`.trim(),

      embeds: [
        embed,
      ],

      components: [
        decisionRow,
      ],

    });


    await channel.send({

      components: [
        buildTicketControlRow(),
      ],

    });


    console.log(
      `[APPLICATION] Successfully created application ticket ${channel.id}`
    );


    return channel;

  } catch (err) {

    console.error(
      '[APPLICATION] Failed to create application ticket:',
      err
    );


    return null;
  }
}


/* =========================================================
   CLAIM TICKET
========================================================= */

async function claimTicket(
  interaction
) {

  const meta =
    parseTopic(
      interaction.channel.topic
    );


  if (!meta) {

    return interaction.reply({

      content:
        'This does not look like a ticket channel.',

      ephemeral: true,

    });
  }


  const member =
    interaction.member;


  let roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  if (
    meta.categoryId.startsWith(
      'application_'
    )
  ) {

    roleIds =
      getApplicationTicketRoleIds();
  }


  const isTicketStaff =
    roleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId
        )
    );


  if (
    !isTicketStaff
  ) {

    return interaction.reply({

      content:
        '❌ You do not have permission to claim this ticket.',

      ephemeral: true,

    });
  }


  const messages =
    await interaction.channel.messages
      .fetch({
        limit: 50,
      })
      .catch(
        () => null
      );


  if (!messages) {

    return interaction.reply({

      content:
        '❌ I could not find the ticket messages.',

      ephemeral: true,

    });
  }


  const claimEmbed =
    new EmbedBuilder()

      .setTitle(
        '🙋 Ticket Claimed'
      )

      .setDescription(
        `${interaction.user} has claimed this ticket and will be helping you.`
      )

      .setColor(
        '#5865F2'
      )

      .setTimestamp();


  await interaction.channel.send({

    embeds: [
      claimEmbed,
    ],

  });


  const controlMessage =
    messages.find(
      (message) =>
        message.author.id ===
          interaction.client.user.id &&

        message.components.some(
          (row) =>
            row.components.some(
              (component) =>
                component.customId ===
                'ticket_claim'
            )
        )
    );


  if (
    controlMessage
  ) {

    await controlMessage.edit({

      components: [

        buildTicketControlRow(
          true
        ),

      ],

    }).catch(
      () => {}
    );
  }


  return interaction.reply({

    content:
      '✅ You claimed this ticket.',

    ephemeral: true,

  });
}


/* =========================================================
   CLOSE REQUESTS
========================================================= */

const pendingTicketClosures =
  new Map();


/* =========================================================
   CLOSE TICKET
========================================================= */

async function closeTicket(
  interaction
) {

  const meta =
    parseTopic(
      interaction.channel.topic
    );


  if (!meta) {

    return interaction.reply({

      content:
        'This does not look like a ticket channel.',

      ephemeral: true,

    });
  }


  const isOwner =
    meta.userId ===
    interaction.user.id;


  const roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  const isStaff =
    roleIds.some(
      (roleId) =>
        interaction.member.roles.cache.has(
          roleId
        )
    );


  const isAdmin =
    interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );


  if (
    !isOwner &&
    !isStaff &&
    !isAdmin
  ) {

    return interaction.reply({

      content:
        '❌ You do not have permission to close this ticket.',

      ephemeral: true,

    });
  }


  /*
   * Admins and staff can close immediately.
   */
  if (
    !isOwner &&
    !isStaff &&
    isAdmin
  ) {

    return finalizeCloseTicket(
      interaction,
      true
    );
  }


  if (
    isStaff
  ) {

    return finalizeCloseTicket(
      interaction,
      false
    );
  }


  pendingTicketClosures.set(

    interaction.channel.id,

    {

      userId:
        interaction.user.id,

      requestedBy:
        interaction.user.id,

      createdAt:
        Date.now(),

    }

  );


  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()

          .setCustomId(
            'ticket_close_confirm'
          )

          .setLabel(
            'Confirm Close'
          )

          .setStyle(
            ButtonStyle.Danger
          )

          .setEmoji(
            '🔒'
          ),

        new ButtonBuilder()

          .setCustomId(
            'ticket_close_cancel'
          )

          .setLabel(
            'Keep Open'
          )

          .setStyle(
            ButtonStyle.Secondary
          )

          .setEmoji(
            '↩️'
          )

      );


  const embed =
    new EmbedBuilder()

      .setTitle(
        '🔒 Ticket Closing'
      )

      .setDescription(
        `${interaction.user}, are you sure you want to close this ticket?\n\n` +
        'A transcript will be created when the ticket is closed.'
      )

      .setColor(
        '#FEE75C'
      )

      .setTimestamp();


  await interaction.reply({

    embeds: [
      embed,
    ],

    components: [
      row,
    ],

  });
}


/* =========================================================
   FINALIZE CLOSE
========================================================= */

async function finalizeCloseTicket(
  interaction,
  forced = false,
  options = {}
) {

  const meta =
    parseTopic(
      interaction.channel.topic
    );


  if (!meta) {

    return interaction.reply({

      content:
        'This does not look like a ticket channel.',

      ephemeral: true,

    });
  }


  let pending =
    pendingTicketClosures.get(
      interaction.channel.id
    );


  if (
    !forced &&
    !pending &&
    !options.reason
  ) {

    return interaction.reply({

      content:
        'There is no pending closure request for this ticket.',

      ephemeral: true,

    });
  }


  if (
    !forced &&
    pending
  ) {

    if (
      pending.userId !==
      interaction.user.id
    ) {

      return interaction.reply({

        content:
          'Only the person who opened this ticket can confirm the closure.',

        ephemeral: true,

      });
    }


    if (
      Date.now() -
      pending.createdAt >
      10 * 60 * 1000
    ) {

      pendingTicketClosures.delete(
        interaction.channel.id
      );


      return interaction.reply({

        content:
          'The close request expired. Please press Close again.',

        ephemeral: true,

      });
    }


    if (
      options.reason
    ) {

      pending.reason =
        options.reason;
    }

  } else {

    pending =
      pending || {

        reason:
          options.reason ||
          null,

        closerId:
          interaction.user.id,

      };
  }


  pendingTicketClosures.delete(
    interaction.channel.id
  );


  const closerId =
    pending.closerId ||
    interaction.user.id;


  const confirmedBy =
    forced
      ? null
      : interaction.user.id;


  const closeEmbed =
    new EmbedBuilder()

      .setTitle(
        forced
          ? '⚡ Ticket Force Closing'
          : '🔒 Ticket Closing'
      )

      .setDescription(
        forced
          ? `This ticket was force closed by ${interaction.user}.`
          : `The ticket owner confirmed that their issue has been solved.\n\nClosed by ${interaction.user}.`
      )

      .setColor(
        '#ED4245'
      )

      .setFooter({

        text:
          `This channel will be deleted in ${config.closeCountdownSeconds || 5} seconds.`,

      });


  if (
    pending.reason
  ) {

    closeEmbed.addFields({

      name:
        'Reason',

      value:
        String(
          pending.reason
        ).slice(
          0,
          1024
        ),

    });
  }


  try {

    if (
      interaction.replied ||
      interaction.deferred
    ) {

      await interaction.editReply({

        embeds: [
          closeEmbed,
        ],

        components: [],

      });

    } else {

      await interaction.reply({

        embeds: [
          closeEmbed,
        ],

        components: [],

      });
    }

  } catch (err) {

    console.error(
      'Failed to send ticket close embed:',
      err
    );


    if (
      !interaction.replied &&
      !interaction.deferred
    ) {

      try {

        await interaction.reply({

          content:
            '❌ Failed to close this ticket.',

          ephemeral: true,

        });

      } catch (_) {}

    }


    return;
  }


  /* =======================================================
     STAFF TRACKER
  ======================================================= */

  try {

    await incrementStat(

      interaction.guild,

      closerId,

      'ticketsClosed'

    );

  } catch (err) {

    console.error(
      'Failed to update staff tracker for ticket close:',
      err
    );
  }


  /* =======================================================
     PARTNER / GIVEAWAY STATISTICS
  ======================================================= */

  try {

    if (
      meta.categoryId ===
      'partner'
    ) {

      await incrementStat(

        interaction.guild,

        closerId,

        'partnersCompleted'

      );

    } else if (
      meta.categoryId ===
      'giveaway_sponsor'
    ) {

      await incrementStat(

        interaction.guild,

        closerId,

        'giveawaysSponsored'

      );
    }

  } catch (err) {

    console.error(
      'Failed to update additional ticket close stat:',
      err
    );
  }


  /* =======================================================
     CROSS-SERVER TICKET LOG
  ======================================================= */

  try {

    await logTicketClose(

      interaction.client,

      {

        channelName:
          interaction.channel.name,

        ownerId:
          meta.userId,

        closerId,

        confirmedBy,

        forced,

        categoryId:
          meta.categoryId,

        reason:
          pending.reason,

      }

    );

  } catch (err) {

    console.error(
      'Failed to log ticket close:',
      err
    );
  }


  /* =======================================================
     TRANSCRIPT SYSTEM
  ======================================================= */

  try {

    const attachment =
      await buildTranscript(
        interaction.channel
      );


    const logChannelId =
      config.transcriptLogChannelId;


    if (
      logChannelId &&
      !logChannelId.startsWith(
        'PUT_'
      )
    ) {

      const logChannel =
        await interaction.guild.channels
          .fetch(
            logChannelId
          )
          .catch(
            () => null
          );


      if (
        logChannel &&
        logChannel.isTextBased()
      ) {

        const logEmbed =
          new EmbedBuilder()

            .setTitle(
              'Ticket Closed'
            )

            .addFields(

              {

                name:
                  'Channel',

                value:
                  `#${interaction.channel.name}`,

                inline: true,

              },

              {

                name:
                  'Opened by',

                value:
                  `<@${meta.userId}>`,

                inline: true,

              },

              {

                name:
                  'Closed by',

                value:
                  `<@${closerId}>`,

                inline: true,

              },

              {

                name:
                  'Confirmed by',

                value:
                  confirmedBy
                    ? `<@${confirmedBy}>`
                    : 'Admin force close',

                inline: true,

              },

              {

                name:
                  'Category',

                value:
                  meta.categoryId,

                inline: true,

              }

            )

            .setColor(
              '#ED4245'
            )

            .setTimestamp();


        if (
          pending.reason
        ) {

          logEmbed.addFields({

            name:
              'Reason',

            value:
              String(
                pending.reason
              ).slice(
                0,
                1024
              ),

          });
        }


        await logChannel.send({

          embeds: [
            logEmbed,
          ],

          files: [
            attachment,
          ],

        });
      }
    }


    /* =====================================================
       DM TRANSCRIPT TO TICKET OWNER
    ===================================================== */

    const opener =
      await interaction.guild.members
        .fetch(
          meta.userId
        )
        .catch(
          () => null
        );


    if (
      opener
    ) {

      const dmAttachment =
        await buildTranscript(
          interaction.channel
        );


      await opener.send({

        content:
          'Here is a transcript of your closed ticket.',

        files: [
          dmAttachment,
        ],

      }).catch(
        (err) => {

          console.error(
            'Failed to DM ticket transcript:',
            err
          );

        }
      );
    }

  } catch (err) {

    console.error(
      'Failed to build/send transcript:',
      err
    );
  }


  /* =======================================================
     DELETE CHANNEL
  ======================================================= */

  setTimeout(

    () => {

      interaction.channel
        .delete()
        .catch(
          (err) => {

            console.error(
              'Failed to delete closed ticket channel:',
              err
            );

          }
        );

    },

    (
      config.closeCountdownSeconds ||
      5
    ) * 1000

  );
}


/* =========================================================
   CANCEL CLOSE
========================================================= */

async function cancelCloseTicket(
  interaction
) {

  const meta =
    parseTopic(
      interaction.channel.topic
    );


  if (!meta) {

    return interaction.reply({

      content:
        'This does not look like a ticket channel.',

      ephemeral: true,

    });
  }


  if (
    interaction.user.id !==
    meta.userId
  ) {

    return interaction.reply({

      content:
        'Only the person who opened this ticket can cancel the closure.',

      ephemeral: true,

    });
  }


  if (
    !pendingTicketClosures.has(
      interaction.channel.id
    )
  ) {

    return interaction.reply({

      content:
        'There is no pending closure request for this ticket.',

      ephemeral: true,

    });
  }


  pendingTicketClosures.delete(
    interaction.channel.id
  );


  await interaction.update({

    embeds: [

      new EmbedBuilder()

        .setTitle(
          '✅ Ticket Kept Open'
        )

        .setDescription(
          `No problem, ${interaction.user}. Your ticket will remain open and staff can continue helping you.`
        )

        .setColor(
          '#57F287'
        ),

    ],

    components: [

      buildTicketControlRow(
        false
      ),

    ],

  });
}


/* =========================================================
   FORCE CLOSE
========================================================= */

async function forceCloseTicket(
  interaction
) {

  const meta =
    parseTopic(
      interaction.channel.topic
    );


  if (!meta) {

    return interaction.reply({

      content:
        'This does not look like a ticket channel.',

      ephemeral: true,

    });
  }


  const roleIds =
    getRoleIdsForTicket(
      meta.categoryId
    );


  const isStaff =
    roleIds.some(
      (roleId) =>
        interaction.member.roles.cache.has(
          roleId
        )
    );


  const isAdmin =
    interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );


  if (
    !isStaff &&
    !isAdmin
  ) {

    return interaction.reply({

      content:
        '❌ You do not have permission to force close this ticket.',

      ephemeral: true,

    });
  }


  return finalizeCloseTicket(
    interaction,
    true
  );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createTicket,

  createApplicationTicket,

  claimTicket,

  closeTicket,

  finalizeCloseTicket,

  cancelCloseTicket,

  forceCloseTicket,

  parseTopic,

  buildTicketControlRow,

  findCategory,

  isServiceTicket,

};
