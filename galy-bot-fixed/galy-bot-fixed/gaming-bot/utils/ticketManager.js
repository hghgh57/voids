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

const {
  loadGiveaways,
} = require('./giveawayManager');


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
    ) ||
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

function isGiveawayClaimTicket(
  categoryId
) {
  return (
    categoryId ===
    'giveaway_claim'
  );
}


function findUserGiveawayWins(
  guildId,
  userId
) {

  const giveaways =
    loadGiveaways();

  const results = [];

  for (
    const [
      messageId,
      giveaway
    ] of Object.entries(
      giveaways || {}
    )
  ) {

    if (!giveaway) {
      continue;
    }

    /*
     * Only check ended giveaways.
     */
    if (
      !giveaway.ended
    ) {
      continue;
    }

    /*
     * Only check giveaways from
     * this Discord server.
     */
    if (
      giveaway.guildId &&
      giveaway.guildId !== guildId
    ) {
      continue;
    }

    const winners =
      Array.isArray(
        giveaway.winners
      )
        ? giveaway.winners
        : [];

    if (
      winners.includes(
        userId
      )
    ) {

      results.push({
        messageId,
        giveaway
      });

    }

  }

  return results;
}


async function buildGiveawayClaimResult(
  guild,
  userId
) {

  try {

    const wins =
      findUserGiveawayWins(
        guild.id,
        userId
      );

    if (
      !wins.length
    ) {

      return {
        embed:
          new EmbedBuilder()
            .setTitle(
              '🎊 Giveaway Claim'
            )
            .setDescription(
              '❌ **We could not find you as a winner of any ended giveaway.**\n\n' +
              'If you believe this is incorrect, please provide staff with the giveaway message.'
            )
            .setColor(
              '#ED4245'
            )
            .setTimestamp(),

        components: []
      };

    }

    const firstWin =
      wins[0];

    const giveaway =
      firstWin.giveaway;

    const channel =
      await guild.channels
        .fetch(
          giveaway.channelId
        )
        .catch(
          () => null
        );

    const prize =
      giveaway.prize ||
      'Unknown prize';

    let jumpUrl =
      null;

    if (
      channel
    ) {

      jumpUrl =
        `https://discord.com/channels/${guild.id}/${channel.id}/${firstWin.messageId}`;

    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          '🎉 Giveaway Winner Found!'
        )
        .setDescription(
          `✅ **Yes, you won a giveaway!**\n\n` +
          `🎁 **Prize:** ${prize}\n\n` +
          `You have been verified as a winner. Please wait for a staff member to process your claim.`
        )
        .setColor(
          '#57F287'
        )
        .setTimestamp();

    const components = [];

    if (
      jumpUrl
    ) {

      components.push(
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setLabel(
                'Jump to Win'
              )
              .setStyle(
                ButtonStyle.Link
              )
              .setURL(
                jumpUrl
              )
              .setEmoji('🔗')

          )
      );

    }

    return {
      embed,
      components
    };

  } catch (error) {

    console.error(
      'Giveaway claim verification failed:',
      error
    );

    return {
      embed:
        new EmbedBuilder()
          .setTitle(
            '🎊 Giveaway Claim'
          )
          .setDescription(
            '⚠️ I could not check the giveaway records right now.\n\n' +
            'Please ask a staff member to verify your giveaway win.'
          )
          .setColor(
            '#FEE75C'
          )
          .setTimestamp(),

      components: []
    };

  }

}


/* =========================================================
   CREATE TICKET
========================================================= */

async function createTicket(
  interaction,
  categoryId
) {

  try {

    if (
      !interaction.guild
    ) {

      return interaction.reply({
        content:
          '❌ Tickets can only be created inside the server.',
        ephemeral: true,
      });

    }

    const guild =
      interaction.guild;

    const user =
      interaction.user;

    const category =
      findCategory(
        categoryId
      );

    if (
      !category
    ) {

      return interaction.reply({
        content:
          '❌ Unknown ticket category.',
        ephemeral: true,
      });

    }


    const openCount =
      countOpenTicketsForUser(
        guild,
        user.id
      );

    const maxOpen =
      Number(
        config.maxOpenTicketsPerUser ||
        1
      );

    if (
      openCount >= maxOpen
    ) {

      return interaction.reply({
        content:
          `❌ You already have **${openCount}** open ticket${openCount === 1 ? '' : 's'}.\n\n` +
          `You can have a maximum of **${maxOpen}** open ticket${maxOpen === 1 ? '' : 's'}.`,
        ephemeral: true,
      });

    }


    const roleIds =
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
      const roleId of roleIds
    ) {

      const role =
        guild.roles.cache.get(
          roleId
        );

      if (
        !role
      ) {
        continue;
      }

      permissionOverwrites.push({

        id:
          role.id,

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
      category.parentId ||
      (
        isServiceTicket(
          categoryId
        )
          ? config.serviceTicketCategoryId
          : config.ticketCategoryId
      );


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
          parent.id;

      } else {

        console.warn(
          `[TICKET] Configured parent ${requestedParentId} is not a valid category; creating at server root.`
        );

      }

    }


    console.log(
      '[TICKET] Creating ticket:',
      {
        userId:
          user.id,

        categoryId,

        parentId:
          channelOptions.parent ||
          'none',

        roles:
          roleIds,
      }
    );


    await interaction.deferReply({
      ephemeral: true,
    });


    const channel =
      await guild.channels.create(
        channelOptions
      );


    const mentions =
      roleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
        )
        .join(' ');


    const embed =
      new EmbedBuilder()

        .setTitle(
          `${category.emoji || '🎫'} ${category.label}`
        )

        .setDescription(
          `Welcome ${user}!\n\n` +
          `**Category:** ${category.label}\n\n` +
          `${category.description || 'A member of the staff team will be with you shortly.'}\n\n` +
          `Please explain your issue in as much detail as possible.`
        )

        .setColor(
          '#5865F2'
        )

        .setTimestamp();


    await channel.send({

      content:
        `${user} ${mentions}`.trim(),

      embeds: [
        embed,
      ],

      components: [
        buildTicketControlRow(),
      ],

    });


    /*
     * GIVEAWAY CLAIM VERIFICATION
     *
     * This only runs for the Giveaway Claim
     * ticket category.
     */
    if (
      isGiveawayClaimTicket(
        categoryId
      )
    ) {

      const result =
        await buildGiveawayClaimResult(
          guild,
          user.id
        );

      await channel.send({

        embeds: [
          result.embed,
        ],

        components:
          result.components,

      });

    }


    await interaction.editReply({

      content:
        `✅ Your ticket has been created: ${channel}`,

    });


    return channel;

  } catch (err) {

    console.error(
      '[TICKET] Failed to create ticket:',
      err
    );

    if (
      interaction.deferred ||
      interaction.replied
    ) {

      return interaction.editReply({

        content:
          '❌ Failed to create your ticket.',

      }).catch(
        () => {}
      );

    }

    return interaction.reply({

      content:
        '❌ Failed to create your ticket.',

      ephemeral: true,

    }).catch(
      () => {}
    );

  }

}


/* =========================================================
   APPLICATION TICKET
========================================================= */

async function createApplicationTicket(
  interaction,
  appId,
  member,
  appConfig,
  answers
) {

  try {

    const guild =
      interaction.guild;

    const user =
      interaction.user;

    if (
      !guild
    ) {

      return null;

    }


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
      const roleId of applicationRoleIds
    ) {

      const role =
        guild.roles.cache.get(
          roleId
        );

      if (
        !role
      ) {
        continue;
      }

      permissionOverwrites.push({

        id:
          role.id,

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
      const candidateId of candidateParentIds
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


  /*
   * Disable the claim button.
   */
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
          .setEmoji('🔒'),

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
          .setEmoji('↩️')

      );


  const embed =
    new EmbedBuilder()

      .setTitle(
        '🔒 Ticket Closing'
      )

      .setDescription(
        `${interaction.user}, are you sure you want to close this ticket?\n\n` +
        `A transcript will be created when the ticket is closed.`
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
  force = false
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


  const channel =
    interaction.channel;


  let transcript =
    null;


  try {

    transcript =
      await buildTranscript(
        channel
      );

  } catch (error) {

    console.error(
      'Failed to build transcript:',
      error
    );

  }


  const category =
    findCategory(
      meta.categoryId
    );


  const ticketType =
    category?.label ||
    meta.categoryId;


  const closeEmbed =
    new EmbedBuilder()

      .setTitle(
        force
          ? '⚡ Ticket Force Closing'
          : '🔒 Ticket Closing'
      )

      .setDescription(
        force
          ? `This ticket was force closed by ${interaction.user}.`
          : `The ticket owner confirmed that their issue has been solved.\n\nClosed by ${interaction.user}.`
      )

      .setColor(
        '#ED4245'
      )

      .setTimestamp();


  await interaction.reply({

    embeds: [
      closeEmbed,
    ],

  }).catch(
    () => {}
  );


  /*
   * Send transcript to configured channel.
   */
  if (
    config.transcriptChannelId
  ) {

    const transcriptChannel =
      await interaction.guild.channels
        .fetch(
          config.transcriptChannelId
        )
        .catch(
          () => null
        );


    if (
      transcriptChannel &&
      transcriptChannel.isTextBased()
    ) {

      await transcriptChannel.send({

        embeds: [

          new EmbedBuilder()

            .setTitle(
              '📄 Ticket Transcript'
            )

            .setDescription(
              `**Ticket:** ${channel.name}\n` +
              `**Type:** ${ticketType}\n` +
              `**Opened by:** <@${meta.userId}>\n` +
              `**Closed by:** ${interaction.user}\n` +
              `**Force closed:** ${force ? 'Yes' : 'No'}`
            )

            .setColor(
              '#5865F2'
            )

            .setTimestamp(),

        ],

        files:
          transcript
            ? [transcript]
            : [],

      }).catch(
        (error) => {

          console.error(
            'Failed to send transcript:',
            error
          );

        }
      );

    }

  }


  /* =======================================================
     STAFF TRACKER
  ======================================================= */

  try {

    await incrementStat(

      interaction.guild.id,

      interaction.user.id,

      'ticketsClosed'

    );

  } catch (error) {

    console.error(
      'Failed to update staff tracker for ticket close:',
      error
    );

  }


  /* =======================================================
     PARTNER / GIVEAWAY STATISTICS
  ======================================================= */

  try {

    if (
      meta.categoryId ===
      'giveaway_sponsor'
    ) {

      await incrementStat(

        interaction.guild.id,

        interaction.user.id,

        'giveawaysSponsored'

      );

    }

  } catch (error) {

    console.error(
      'Failed to update additional ticket close stat:',
      error
    );

  }


  /* =======================================================
     CROSS-SERVER TICKET LOG
  ======================================================= */

  try {

    await logTicketClose(

      interaction.client,

      {

        guildName:
          interaction.guild.name,

        guildId:
          interaction.guild.id,

        userMention:
          `<@${meta.userId}>`,

        userId:
          meta.userId,

        closedByMention:
          `${interaction.user}`,

        closedById:
          interaction.user.id,

        channelName:
          channel.name,

        ticketType,

      },

      transcript

    );

  } catch (error) {

    console.error(
      'Failed to log ticket close:',
      error
    );

  }


  /*
   * DM TRANSCRIPT TO TICKET OWNER
   */

  try {

    const ticketOwner =
      await interaction.client.users
        .fetch(
          meta.userId
        )
        .catch(
          () => null
        );


    if (
      ticketOwner &&
      transcript
    ) {

      await ticketOwner.send({

        content:
          '📄 Here is a transcript of your closed ticket.',

        files: [
          transcript,
        ],

      }).catch(
        (error) => {

          console.error(
            'Failed to DM ticket transcript:',
            error
          );

        }
      );

    }

  } catch (error) {

    console.error(
      'Failed to send transcript DM:',
      error
    );

  }


  /*
   * Delete channel.
   */
  await channel
    .delete(
      'Ticket closed'
    )
    .catch(
      (error) => {

        console.error(
          'Failed to delete closed ticket channel:',
          error
        );

      }
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
    meta.userId !==
    interaction.user.id
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


  return interaction.reply({

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
        )

        .setTimestamp(),

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
