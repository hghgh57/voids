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


  const staffRoleIds =
    getRoleIdsForTicket(
      categoryId
    );


  for (
    const roleId of staffRoleIds
  ) {

    permissionOverwrites.push({
      id:
        roleId,

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


    const mentions =
      staffRoleIds
        .map(
          (roleId) =>
            `<@&${roleId}>`
        )
        .join(' ');


    await channel.send({
      content:
        `${user} ${mentions}`.trim(),

      embeds: [
        welcomeEmbed,
      ],

      components: [
        buildTicketControlRow(),
      ],
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
   APPLICATION TICKET
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
      const roleId of applicationRoleIds
    ) {

      permissionOverwrites.push({
        id:
          roleId,

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
      const roleId of extraRoleIds
    ) {

      permissionOverwrites.push({
        id:
          roleId,

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


  for (
    const roleId of roleIds
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


    await interaction.channel.permissionOverwrites
      .edit(
        role.id,
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


  await interaction.channel.permissionOverwrites
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


  await interaction.channel.permissionOverwrites
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
      .setDescription(
        `🙋 This ticket has been claimed by ${interaction.user}.\n\nOther ticket staff can no longer see this ticket.`
      )
      .setColor(
        '#57F287'
      );


  await interaction.reply({
    embeds: [
      embed,
    ],
  });


  await interaction.message
    .edit({
      components: [
        buildTicketControlRow(
          true
        ),
      ],
    })
    .catch(
      () => {}
    );


  /*
    FIX:
    Keep staff tracker errors completely isolated from
    the interaction itself.
  */

  try {

    await incrementStat(
      interaction.guild,
      interaction.user.id,
      'ticketsHandled'
    );

  } catch (err) {

    console.error(
      'Failed to update staff tracker for ticket claim:',
      err
    );
  }
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
    }
  );


  const confirmationEmbed =
    new EmbedBuilder()
      .setTitle(
        '🔒 Ticket Closure Requested'
      )
      .setDescription(
        `This ticket was marked for closure by ${interaction.user}.\n\n` +
        `<@${meta.userId}>, **has your issue been solved and would you like to close the ticket?**\n\n` +
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


  await interaction.reply({
    embeds: [
      confirmationEmbed,
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
  interaction
) {

  return performTicketClose(
    interaction,
    {
      forced: false,
    }
  );
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
        '❌ This does not look like a ticket channel.',
      ephemeral:
        true,
    });

  }


  // Admin OR Mod can force close
  const isAdminRole =
    (
      config.adminRoleIds ||
      []
    ).some(
      (roleId) =>
        roleId &&
        !roleId.startsWith(
          'PUT_'
        ) &&
        interaction.member.roles.cache.has(
          roleId
        )
    );


  const isModRole =
    (
      config.modRoleIds ||
      []
    ).some(
      (roleId) =>
        roleId &&
        !roleId.startsWith(
          'PUT_'
        ) &&
        interaction.member.roles.cache.has(
          roleId
        )
    );


  const isAdministrator =
    interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );


  if (
    !isAdminRole &&
    !isModRole &&
    !isAdministrator
  ) {

    return interaction.reply({
      content:
        '❌ You need the **Mod** role to force close tickets.',
      ephemeral:
        true,
    });

  }


  pendingTicketClosures.delete(
    interaction.channel.id
  );


  return performTicketClose(
    interaction,
    {
      forced:
        true,

      reason:
        'Force closed by moderator.',
    }
  );

}


/* =========================================================
   ACTUAL CLOSE PROCESS
========================================================= */

async function performTicketClose(
  interaction,
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


  const forced =
    options.forced === true;


  let pending =
    pendingTicketClosures.get(
      interaction.channel.id
    );


  if (!forced) {

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


    if (!pending) {
      return interaction.reply({
        content:
          'There is no pending closure request for this ticket.',
        ephemeral: true,
      });
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


  /*
    =========================================================
    SEND CLOSE EMBED FIRST
    =========================================================

    Once this succeeds, everything afterwards is isolated
    so a failure in stats/logging/transcripts cannot cause
    the global interaction error message to appear.
  */

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

    /*
      If the interaction has already been acknowledged,
      do not attempt another reply here.
    */

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


  /*
    =========================================================
    STAFF TRACKER
    =========================================================

    IMPORTANT FIX:
    This is now isolated with try/catch.

    If incrementStat() fails, the close interaction still
    succeeds and the user will NOT receive the generic
    "Something went wrong handling that action" message.
  */

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


  /*
    =========================================================
    PARTNER / GIVEAWAY STATISTICS
    =========================================================
  */

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


  /*
    =========================================================
    CROSS-SERVER TICKET LOG
    =========================================================
  */

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


  /*
    =========================================================
    TRANSCRIPT SYSTEM
    =========================================================
  */

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


    /*
      =======================================================
      DM TRANSCRIPT TO TICKET OWNER
      =======================================================
    */

    const opener =
      await interaction.guild.members
        .fetch(
          meta.userId
        )
        .catch(
          () => null
        );


    if (opener) {

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

    /*
      Transcript failures should NEVER break the close
      interaction because the close embed has already
      been sent successfully.
    */

    console.error(
      'Failed to build/send transcript:',
      err
    );
  }


  /*
    =========================================================
    DELETE CHANNEL
    =========================================================
  */

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
