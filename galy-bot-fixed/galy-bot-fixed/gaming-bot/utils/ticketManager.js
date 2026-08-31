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
      String(application.id) ===
      String(categoryId)
  );
}


function isServiceTicket(
  categoryId
) {
  return (
    config.serviceCategories || []
  ).some(
    (category) =>
      String(category.id) ===
      String(categoryId)
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
        String(category.id) ===
        String(categoryId)
    ) ||

    (
      config.serviceCategories || []
    ).find(
      (category) =>
        String(category.id) ===
        String(categoryId)
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
 * IMPORTANT:
 * This is NOT Void's own giveaway system.
 */
const OFFICIAL_GIVEAWAY_BOT_ID =
  '294882584201003009';


function isGiveawayClaimTicket(
  categoryId
) {
  return (
    String(categoryId) ===
    'giveaway_claim'
  );
}

function getGiveawayChannelIds() {
  const ids =
    config.giveawayCheckChannelIds ||
    config.giveawayChannelIds ||
    config.giveawayChannels ||
    [];

  if (!Array.isArray(ids)) {
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

function normaliseWinnerText(
  value
) {
  return String(
    value || ''
  )
    .toLowerCase()
    .replace(
      /[`*_~]/g,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


function getWinnerText(
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

    if (
      embed.footer?.text
    ) {
      parts.push(
        embed.footer.text
      );
    }

    if (
      embed.author?.name
    ) {
      parts.push(
        embed.author.name
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

  return parts.join('\n');
}


function messageContainsWinner(
  message,
  user
) {

  if (
    !message ||
    !user
  ) {
    return false;
  }

  const text =
    getWinnerText(
      message
    );


  /*
   * First check Discord mentions
   * and the raw user ID.
   */
  if (
    text.includes(
      `<@${user.id}>`
    ) ||
    text.includes(
      `<@!${user.id}>`
    ) ||
    text.includes(
      user.id
    )
  ) {
    return true;
  }


  /*
   * GiveawayBot can sometimes display
   * usernames/display names.
   */
  const names = [
    user.username,
    user.globalName,
    user.displayName,
    user.tag,
  ]
    .filter(Boolean)
    .map(
      normaliseWinnerText
    );


  const normalised =
    normaliseWinnerText(
      text
    );


  return names.some(
    (name) => {

      if (!name) {
        return false;
      }

      const escaped =
        name.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        );

      return new RegExp(
        `(^|[^a-z0-9_])${escaped}(?![a-z0-9_])`,
        'i'
      ).test(
        normalised
      );
    }
  );
}


function isGiveawayWinnerMessage(
  message
) {

  if (!message) {
    return false;
  }

  const text =
    getWinnerText(
      message
    ).toLowerCase();

  return (
    /congratulations/.test(text) ||
    /winner/.test(text) ||
    /winners/.test(text) ||
    /you won/.test(text) ||
    /giveaway ended/.test(text) ||
    /ended/.test(text)
  );
}


function extractGiveawayPrize(
  message
) {

  for (
    const embed of
    message.embeds || []
  ) {

    for (
      const field of
      embed.fields || []
    ) {

      if (
        /prize|reward/i.test(
          field.name || ''
        )
      ) {

        return String(
          field.value ||
          'Unknown prize'
        )
          .split('\n')[0]
          .trim()
          .slice(
            0,
            256
          );
      }
    }


    if (
      embed.title
    ) {

      const title =
        String(
          embed.title
        )
          .replace(
            /^🎉\s*/,
            ''
          )
          .trim();

      if (
        title &&
        !/giveaway ended|ended/i.test(
          title
        )
      ) {
        return title.slice(
          0,
          256
        );
      }
    }


    if (
      embed.description
    ) {

      const match =
        String(
          embed.description
        ).match(
          /(?:prize|reward|giveaway)\s*[:\-]\s*([^\n]+)/i
        );

      if (
        match?.[1]
      ) {
        return match[1]
          .trim()
          .slice(
            0,
            256
          );
      }
    }
  }


  const content =
    String(
      message.content || ''
    );


  const match =
    content.match(
      /(?:prize|reward|giveaway(?:\s+for)?)\s*[:\-]?\s*([^\n]+)/i
    );


  return match?.[1]
    ? match[1]
        .trim()
        .slice(
          0,
          256
        )
    : 'Unknown prize';
}


async function scanGiveawayChannel(
  channel,
  user,
  maxMessages
) {

  const wins = [];

  let before;

  let scanned = 0;


  while (
    scanned <
    maxMessages
  ) {

    const limit =
      Math.min(
        100,
        maxMessages -
          scanned
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
       * ONLY official GiveawayBot.
       */
      if (
        message.author?.id !==
        OFFICIAL_GIVEAWAY_BOT_ID
      ) {
        continue;
      }


      if (
        !isGiveawayWinnerMessage(
          message
        )
      ) {
        continue;
      }


      if (
        !messageContainsWinner(
          message,
          user
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


async function findGiveawayWins(
  client,
  guild,
  userId
) {

  const user =
    await client.users
      .fetch(
        userId
      )
      .catch(
        () => null
      );


  if (!user) {
    return [];
  }


  const channelIds =
    getGiveawayChannelIds();


  if (
    !channelIds.length
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
          5000
        ),
        10000
      )
    );


  const wins = [];


  for (
    const channelId of
    channelIds
  ) {

    const channel =
      await client.channels
        .fetch(
          channelId
        )
        .catch(
          (error) => {

            console.error(
              `[GIVEAWAY CLAIM] Could not fetch channel ${channelId}:`,
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
        `[GIVEAWAY CLAIM] Ignoring #${channelId}; it is not in this server.`
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
        user,
        maxMessages
      );


    wins.push(
      ...channelWins
    );
  }


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
   CREATE NORMAL / SERVICE TICKET
========================================================= */

async function createTicket(
  interaction,
  categoryId,
  answers = []
) {

  const {
    guild,
    user,
  } = interaction;


  if (!guild) {

    return interaction.reply({
      content:
        '❌ Tickets can only be created inside the server.',
      ephemeral: true,
    });
  }


  const category =
    findCategory(
      categoryId
    );


  if (!category) {

    return interaction.reply({
      content:
        '❌ Unknown ticket category.',
      ephemeral: true,
    });
  }


  const existing =
    countOpenTicketsForUser(
      guild,
      user.id
    );


  if (
    existing >=
    (
      config.maxOpenTicketsPerUser ||
      2
    )
  ) {

    return interaction.reply({
      content:
        `You already have ${existing} open ticket(s). ` +
        'Please close one before opening another.',
      ephemeral: true,
    });
  }


  await interaction.deferReply({
    ephemeral: true,
  });


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
        PermissionsBitField.Flags.EmbedLinks,
      ],
    },
  ];


  if (
    interaction.client.user
  ) {

    permissionOverwrites.push({

      id:
        interaction.client.user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });
  }


  /*
   * Validate configured staff roles first.
   *
   * A deleted/incorrect role ID would otherwise make
   * Discord reject the whole channel creation request.
   */
  const configuredStaffRoleIds =
    getRoleIdsForTicket(
      categoryId
    );


  const staffRoleIds = [];


  for (
    const roleId of
    configuredStaffRoleIds
  ) {

    const role =
      await guild.roles
        .fetch(
          roleId
        )
        .catch(
          () => null
        );


    if (!role) {

      console.warn(
        `[TICKET] Ignoring invalid/missing staff role ${roleId} for category ${categoryId}.`
      );

      continue;
    }


    staffRoleIds.push(
      role.id
    );


    permissionOverwrites.push({

      id:
        role.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
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
      `ticket-${safeName}`,

    type:
      ChannelType.GuildText,

    topic:
      `ticket|${user.id}|${categoryId}`,

    permissionOverwrites,
  };


  const requestedParentId =
    isServiceTicket(
      categoryId
    )
      ? config.serviceTicketCategoryId
      : config.ticketCategoryId;


  if (
    requestedParentId &&
    typeof requestedParentId ===
      'string' &&
    !requestedParentId.startsWith(
      'PUT_'
    )
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


  try {

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


    /*
     * Giveaway claim verification.
     *
     * IMPORTANT:
     * The scan is protected by its own try/catch.
     * If GiveawayBot cannot be scanned, the ticket
     * STILL gets created.
     */
    let giveawayWinButtons = [];


    if (
      String(categoryId) ===
      'giveaway_claim'
    ) {

      let wins = [];


      try {

        wins =
          await findGiveawayWins(
            interaction.client,
            guild,
            user.id
          );

      } catch (error) {

        console.error(
          '[GIVEAWAY CLAIM] Win scan failed while creating ticket:',
          error
        );

        wins = [];
      }


      if (
        wins.length > 0
      ) {

        welcomeEmbed.addFields({

          name:
            '🎉 Giveaway Result',

          value:
            `✅ **Yes, you won ${
              wins.length === 1
                ? 'a giveaway'
                : `${wins.length} giveaways`
            }!**\n\n` +

            wins
              .slice(
                0,
                10
              )
              .map(
                (win) =>
                  `🎁 **${String(
                    win.prize
                  ).slice(
                    0,
                    100
                  )}**`
              )
              .join(
                '\n'
              ),
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

                  .setEmoji('🔗')
            );

      } else {

        welcomeEmbed.addFields({

          name:
            '🎉 Giveaway Result',

          value:
            '❌ **No, you did not win a giveaway found by the bot.**\n\n' +
            'Staff can still check your claim manually if you believe this is incorrect.',
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


    await channel.send({

      content:
        `${user} ${mentions}`.trim(),

      embeds: [
        welcomeEmbed,
      ],

      components:
        ticketComponents,

    });


    await interaction.editReply({

      content:
        `✅ Your ticket has been created: ${channel}`,

    });


    return channel;

  }

  catch (err) {

    console.error(
      'Failed to create ticket:',
      err
    );


    await interaction
      .editReply({

        content:
          '❌ Something went wrong creating your ticket. ' +
          'Please contact staff.',

      })
      .catch(
        () => {}
      );


    return null;
  }
}


/* =========================================================
   CREATE APPLICATION TICKET
========================================================= */

async function createApplicationTicket(
  guild,
  member,
  appId,
  appConfig,
  answers
) {

  try {

    if (!guild) {

      throw new Error(
        'Missing guild when creating application ticket.'
      );
    }


    if (!member) {

      throw new Error(
        'Missing member when creating application ticket.'
      );
    }


    if (!member.user) {

      throw new Error(
        'Missing member user when creating application ticket.'
      );
    }


    if (!appConfig) {

      throw new Error(
        'Missing application configuration.'
      );
    }


    const user =
      member.user;


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
          PermissionsBitField.Flags.EmbedLinks,
        ],
      },
    ];


    const botId =
      guild.members.me?.id ||
      guild.client.user?.id;


    if (!botId) {

      throw new Error(
        'Could not determine bot user ID.'
      );
    }


    permissionOverwrites.push({

      id:
        botId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });


    const applicationRoleIds =
      getApplicationTicketRoleIds();


    for (
      const roleId of
      applicationRoleIds
    ) {

      const role =
        await guild.roles
          .fetch(
            roleId
          )
          .catch(
            () => null
          );


      if (!role) {
        continue;
      }


      permissionOverwrites.push({

        id:
          role.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      });
    }


    const extraRoleIds = [

      ...(config.supportRoleIds || []),

      ...(config.adminRoleIds || []),

    ].filter(
      (roleId) =>
        roleId &&
        typeof roleId === 'string' &&
        !roleId.startsWith('PUT_') &&
        !applicationRoleIds.includes(
          roleId
        )
    );


    for (
      const roleId of
      extraRoleIds
    ) {

      const role =
        await guild.roles
          .fetch(
            roleId
          )
          .catch(
            () => null
          );


      if (!role) {
        continue;
      }


      permissionOverwrites.push({

        id:
          role.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
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

  }

  catch (err) {

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
    !isTicketStaff &&
    !member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {

    return interaction.reply({

      content:
        'Only ticket staff can claim tickets.',

      ephemeral: true,

    });
  }


  const claimButton =
    interaction.message.components
      .flatMap(
        (row) =>
          row.components
      )
      .find(
        (component) =>
          component.customId ===
          'ticket_claim'
      );


  if (
    claimButton?.disabled
  ) {

    return interaction.reply({

      content:
        'This ticket has already been claimed.',

      ephemeral: true,

    });
  }


  for (
    const roleId of
    roleIds
  ) {

    const role =
      await interaction.guild.roles
        .fetch(
          roleId
        )
        .catch(
          () => null
        );


    if (!role) {
      continue;
    }


    await interaction.channel
      .permissionOverwrites
      .edit(
        role,
        {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false,
        }
      )
      .catch(
        () => {}
      );
  }


  await interaction.channel
    .permissionOverwrites
    .edit(
      meta.userId,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      }
    )
    .catch(
      () => {}
    );


  await interaction.channel
    .permissionOverwrites
    .edit(
      interaction.user.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
        ManageMessages: true,
      }
    )
    .catch(
      () => {}
    );


  const embed =
    new EmbedBuilder()
      .setTitle(
        '🙋 Ticket Claimed'
      )
      .setDescription(
        `This ticket has been claimed by ${interaction.user}.\n\n` +
        'Other ticket staff can no longer see this ticket.'
      )
      .setColor(
        '#57F287'
      );


  await interaction.reply({
    embeds: [
      embed,
    ],
  });


  const disabledRow =
    buildTicketControlRow(
      true
    );


  await interaction.message
    .edit({
      components: [
        disabledRow,
      ],
    })
    .catch(
      () => {}
    );


  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsHandled'
  ).catch(
    (err) => {

      console.error(
        'Failed to update ticket stats:',
        err
      );
    }
  );
}


/* =========================================================
   CLOSE TICKET
========================================================= */

const pendingTicketClosures =
  new Map();


async function closeTicket(
  interaction,
  reason
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


  const isOwner =
    member.id ===
    meta.userId;


  if (
    !isTicketStaff &&
    !isOwner &&
    !member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {

    return interaction.reply({

      content:
        'You do not have permission to close this ticket.',

      ephemeral: true,

    });
  }


  if (
    pendingTicketClosures.has(
      interaction.channel.id
    )
  ) {

    return interaction.reply({

      content:
        'This ticket is already waiting for the ticket owner to confirm closure.',

      ephemeral: true,

    });
  }


  pendingTicketClosures.set(
    interaction.channel.id,
    {
      reason:
        reason || null,

      closerId:
        interaction.user.id,

      requestedAt:
        Date.now(),
    }
  );


  const confirmationEmbed =
    new EmbedBuilder()
      .setTitle(
        '🔒 Ticket Closure Requested'
      )
      .setDescription(
        `This ticket was marked for closure by ${interaction.user}.\n\n` +
        `<@${meta.userId}>, **has your issue been solved and would you like to close this ticket?**\n\n` +
        'Please choose **Yes, close it** or **No, keep it open** below.'
      )
      .setColor(
        '#FEE75C'
      )
      .setFooter({
        text:
          'Only the person who opened this ticket can confirm the closure.',
      });


  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            'ticket_close_confirm'
          )
          .setLabel(
            'Yes, close it'
          )
          .setEmoji('✅')
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            'ticket_close_cancel'
          )
          .setLabel(
            'No, keep it open'
          )
          .setEmoji('❌')
          .setStyle(
            ButtonStyle.Secondary
          )
      );


  if (
    interaction.deferred ||
    interaction.replied
  ) {

    await interaction.editReply({

      embeds: [
        confirmationEmbed,
      ],

      components: [
        row,
      ],

    });

  } else {

    await interaction.reply({

      embeds: [
        confirmationEmbed,
      ],

      components: [
        row,
      ],

    });
  }
}


/* =========================================================
   FINALIZE CLOSE TICKET
========================================================= */

async function finalizeCloseTicket(
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
        'Only the person who opened this ticket can confirm the closure.',

      ephemeral: true,

    });
  }


  const pending =
    pendingTicketClosures.get(
      interaction.channel.id
    );


  if (!pending) {

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
          '🔒 Ticket Closing'
        )

        .setDescription(
          `The ticket owner confirmed that the issue has been solved.\n\nClosed by ${interaction.user}.` +
          (
            pending.reason
              ? `\n**Reason:** ${pending.reason}`
              : ''
          )
        )

        .setColor(
          '#ED4245'
        )

        .setFooter({
          text:
            `This channel will be deleted in ${
              config.closeCountdownSeconds ||
              5
            } seconds.`,
        }),

    ],

    components: [],

  });


  const closerId =
    pending.closerId ||
    interaction.user.id;


  incrementStat(
    interaction.guild,
    closerId,
    'ticketsClosed'
  ).catch(
    (err) => {

      console.error(
        'Failed to update staff tracker for ticket close:',
        err
      );
    }
  );


  if (
    meta.categoryId ===
    'partner'
  ) {

    incrementStat(
      interaction.guild,
      closerId,
      'partnersCompleted'
    ).catch(
      () => {}
    );

  } else if (
    meta.categoryId ===
    'giveaway_sponsor'
  ) {

    incrementStat(
      interaction.guild,
      closerId,
      'giveawaysSponsored'
    ).catch(
      () => {}
    );
  }


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

                inline:
                  true,
              },

              {
                name:
                  'Opened by',

                value:
                  `<@${meta.userId}>`,

                inline:
                  true,
              },

              {
                name:
                  'Closed by',

                value:
                  `<@${closerId}>`,

                inline:
                  true,
              },

              {
                name:
                  'Confirmed by',

                value:
                  `${interaction.user}`,

                inline:
                  true,
              },

              {
                name:
                  'Category',

                value:
                  meta.categoryId,

                inline:
                  true,
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
              pending.reason.slice(
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


      await opener
        .send({

          content:
            'Here is a transcript of your closed ticket.',

          files: [
            dmAttachment,
          ],

        })
        .catch(
          () => {}
        );
    }

  } catch (err) {

    console.error(
      'Failed to build/send transcript:',
      err
    );
  }


  setTimeout(
    () => {

      interaction.channel
        .delete()
        .catch(
          () => {}
        );

    },

    (
      config.closeCountdownSeconds ||
      5
    ) * 1000
  );
}


/* =========================================================
   CANCEL CLOSE TICKET
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
   FORCE CLOSE TICKET
========================================================= */

async function forceCloseTicket(interaction) {
  const meta = parseTopic(interaction.channel.topic);

  if (!meta) {
    return interaction.reply({
      content: '❌ This does not look like a ticket channel.',
      ephemeral: true,
    });
  }

  // Check for the configured MOD role
  const isMod = (config.modRoleIds || []).some(
    (roleId) =>
      roleId &&
      interaction.member?.roles?.cache?.has(roleId)
  );

  if (!isMod) {
    return interaction.reply({
      content: '❌ You need the **Mod** role to use `/forceclose`.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🔒 Ticket Force Closed')
        .setDescription(
          `This ticket was force closed by ${interaction.user}.`
        )
        .setColor('#ED4245')
        .setTimestamp(),
    ],
    components: [],
  });

  try {
    const attachment =
      await buildTranscript(interaction.channel);

    const logChannelId =
      config.transcriptLogChannelId;

    if (
      logChannelId &&
      !logChannelId.startsWith('PUT_')
    ) {
      const logChannel =
        await interaction.guild.channels
          .fetch(logChannelId)
          .catch(() => null);

      if (
        logChannel &&
        logChannel.isTextBased()
      ) {
        const logEmbed =
          new EmbedBuilder()
            .setTitle('Ticket Force Closed')
            .addFields(
              {
                name: 'Channel',
                value: `#${interaction.channel.name}`,
                inline: true,
              },
              {
                name: 'Opened by',
                value: `<@${meta.userId}>`,
                inline: true,
              },
              {
                name: 'Force closed by',
                value: `${interaction.user}`,
                inline: true,
              },
              {
                name: 'Category',
                value: meta.categoryId,
                inline: true,
              }
            )
            .setColor('#ED4245')
            .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed],
          files: [attachment],
        });
      }
    }
  } catch (err) {
    console.error(
      'Failed to build/send force-close transcript:',
      err
    );
  }

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, (config.closeCountdownSeconds || 5) * 1000);
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
