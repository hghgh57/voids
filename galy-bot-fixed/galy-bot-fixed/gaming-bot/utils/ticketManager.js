const {
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config = require('../config.json');
const { buildTranscript } = require('./transcript');
const {
  buildApplicationEmbed,
  buildDecisionRow,
} = require('./applicationManager');
const { incrementStat } = require('./staffTracker');


/* =========================================================
   TICKET METADATA
========================================================= */

function parseTopic(topic) {
  if (!topic || !topic.startsWith('ticket|')) return null;

  const [, userId, categoryId] = topic.split('|');

  if (!userId || !categoryId) return null;

  return {
    userId,
    categoryId,
  };
}


function countOpenTicketsForUser(guild, userId) {
  return guild.channels.cache.filter((channel) => {
    const meta = parseTopic(channel.topic);

    return meta && meta.userId === userId;
  }).size;
}


/* =========================================================
   TICKET BUTTONS
========================================================= */

function buildTicketControlRow(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(claimed),

    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('ticket_close_reason')
      .setLabel('Close with Reason')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
  );
}


/* =========================================================
   ROLE HELPERS
========================================================= */

function getTicketRoleIds() {
  return (config.ticketRoleIds || []).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );
}


function getApplicationTicketRoleIds() {
  return (config.applicationTicketRoleIds || []).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );
}


function getServiceTicketRoleIds() {
  const ids = (config.serviceTicketRoleIds || []).filter(
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

function isApplicationTicket(categoryId) {
  return (config.applications || []).some(
    (application) =>
      application.id === categoryId
  );
}


function isServiceTicket(categoryId) {
  return (config.serviceCategories || []).some(
    (category) =>
      category.id === categoryId
  );
}


function findCategory(categoryId) {
  return (
    (config.categories || []).find(
      (category) =>
        category.id === categoryId
    )

    ||

    (config.serviceCategories || []).find(
      (category) =>
        category.id === categoryId
    )
  );
}


function getRoleIdsForTicket(categoryId) {
  const category = findCategory(categoryId);

  const categoryRoleIds = (
    category?.roleIds || []
  ).filter(
    (id) =>
      id &&
      typeof id === 'string' &&
      !id.startsWith('PUT_')
  );

  if (categoryRoleIds.length) {
    return categoryRoleIds;
  }


  if (isApplicationTicket(categoryId)) {
    return getApplicationTicketRoleIds();
  }


  if (isServiceTicket(categoryId)) {
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
  const { guild, user } = interaction;

  if (!guild) {
    return interaction.reply({
      content: '❌ Tickets can only be created inside the server.',
      ephemeral: true,
    });
  }


  const category = findCategory(categoryId);

  if (!category) {
    return interaction.reply({
      content: '❌ Unknown ticket category.',
      ephemeral: true,
    });
  }


  const existing = countOpenTicketsForUser(
    guild,
    user.id
  );


  if (
    existing >=
    (config.maxOpenTicketsPerUser || 2)
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
      id: guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },

    {
      id: user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    },
  ];


  if (interaction.client.user) {
    permissionOverwrites.push({
      id: interaction.client.user.id,

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
    getRoleIdsForTicket(categoryId);


  for (const roleId of staffRoleIds) {
    const role = await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      console.warn(
        `[TICKET] Could not fetch staff role ${roleId}`
      );
      continue;
    }

    permissionOverwrites.push({
      id: role.id,

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
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20)
    ||
    'user';


  const channelOptions = {
    name: `ticket-${safeName}`,

    type: ChannelType.GuildText,

    topic:
      `ticket|${user.id}|${categoryId}`,

    permissionOverwrites,
  };


  const requestedParentId = isServiceTicket(categoryId)
    ? config.serviceTicketCategoryId
    : config.ticketCategoryId;


  if (
    requestedParentId &&
    typeof requestedParentId === 'string' &&
    !requestedParentId.startsWith('PUT_')
  ) {
    const parent = await guild.channels
      .fetch(requestedParentId)
      .catch(() => null);

    if (
      parent &&
      parent.type === ChannelType.GuildCategory
    ) {
      channelOptions.parent = requestedParentId;
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


    if (answers.length) {
      welcomeEmbed.addFields(
        answers.map((answer) => ({
          name:
            String(
              answer.question
            ).slice(0, 256),

          value:
            String(
              answer.answer ||
              'No answer'
            ).slice(0, 1024),
        }))
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
      .catch(() => {});


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
        `Application config not found for ${appId}.`
      );
    }


    console.log(
      '[APPLICATION] Attempting to create application ticket:',
      {
        guildId: guild.id,
        userId: member.id,
        appId,
        application: appConfig.label,
      }
    );


    const parentId =
      config.applicationTicketCategoryId ||
      config.ticketCategoryId;


    const roleIds =
      (
        appConfig.roleIds ||
        appConfig.roles ||
        getApplicationTicketRoleIds()
      ).filter(
        (id) =>
          id &&
          typeof id === 'string' &&
          !id.startsWith('PUT_')
      );


    console.log(
      '[APPLICATION] Creating application ticket:',
      {
        userId: member.id,
        appId,
        parentId,
        roles: roleIds,
      }
    );


    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,

        deny: [
          PermissionsBitField.Flags.ViewChannel,
        ],
      },

      {
        id: member.id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      },
    ];


    if (guild.client.user) {
      permissionOverwrites.push({
        id: guild.client.user.id,

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
      IMPORTANT:
      Fetch every role before passing it to Discord.js.

      This prevents:
      "Supplied parameter is not a cached User or Role."
    */

    for (const roleId of roleIds) {
      const role = await guild.roles
        .fetch(roleId)
        .catch((error) => {
          console.error(
            `[APPLICATION] Failed to fetch role ${roleId}:`,
            error
          );

          return null;
        });


      if (!role) {
        console.warn(
          `[APPLICATION] Skipping invalid/missing role ${roleId}.`
        );

        continue;
      }


      permissionOverwrites.push({
        id: role.id,

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
      member.user.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20)
      ||
      'user';


    const channelOptions = {
      name:
        `application-${appId}-${safeName}`
          .slice(0, 100),

      type:
        ChannelType.GuildText,

      topic:
        `ticket|${member.id}|${appId}`,

      permissionOverwrites,
    };


    if (
      parentId &&
      typeof parentId === 'string' &&
      !parentId.startsWith('PUT_')
    ) {
      const parent =
        await guild.channels
          .fetch(parentId)
          .catch(() => null);


      if (
        parent &&
        parent.type === ChannelType.GuildCategory
      ) {
        channelOptions.parent = parent.id;
      } else {
        console.warn(
          `[APPLICATION] Parent ${parentId} is not a valid category.`
        );
      }
    }


    const channel =
      await guild.channels.create(
        channelOptions
      );


    const applicationEmbed =
      buildApplicationEmbed(
        member.user,
        appConfig,
        answers
      );


    await channel.send({
      content:
        `${member} ${roleIds
          .map((id) => `<@&${id}>`)
          .join(' ')}`.trim(),

      embeds: [
        applicationEmbed,
      ],

      components: [
        buildDecisionRow(),
        buildTicketControlRow(),
      ],
    });


    console.log(
      '[APPLICATION] Application ticket created:',
      {
        channelId: channel.id,
        userId: member.id,
        appId,
      }
    );


    return channel;
  }


  catch (error) {
    console.error(
      '[APPLICATION] Failed to create application ticket:',
      error
    );

    return null;
  }
}


/* =========================================================
   CLAIM TICKET
========================================================= */

async function claimTicket(interaction) {
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


  const member = interaction.member;


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
        member.roles.cache.has(roleId)
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


  if (claimButton?.disabled) {
    return interaction.reply({
      content:
        'This ticket has already been claimed.',
      ephemeral: true,
    });
  }


  /*
    Hide the ticket from all other staff roles.

    The ticket owner stays visible.
    The staff member who claimed it stays visible.

    Server Administrators can still see the ticket because
    Administrator bypasses channel permission denies.
  */

  for (const roleId of roleIds) {
    const role =
      await interaction.guild.roles
        .fetch(roleId)
        .catch(() => null);


    if (!role) {
      console.warn(
        `[TICKET] Could not fetch staff role ${roleId} while claiming.`
      );

      continue;
    }


    /*
      Do NOT hide the role from the claimer if the claimer
      is actually using that role.

      Instead, give the claimer an explicit member overwrite
      below, which overrides the role deny.
    */

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
        (err) => {
          console.error(
            `[TICKET] Failed to hide ticket from role ${roleId}:`,
            err
          );
        }
      );
  }


  /*
    Restore explicit access for ticket owner.
  */

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
    .catch(() => {});


  /*
    Restore explicit access for claimer.

    Member overwrites take precedence over role overwrites.
  */

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
    .catch(() => {});


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
    .catch(() => {});


  incrementStat(
    interaction.guild,
    interaction.user.id,
    'ticketsHandled'
  ).catch(
    (err) => {
      console.error(
        'Failed to update staff tracker for ticket claim:',
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
          .setEmoji(
            '✅'
          )
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
          .setEmoji(
            '❌'
          )
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
   FINALIZE CLOSE
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
            `This channel will be deleted in ${config.closeCountdownSeconds || 5} seconds.`,
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
  }

  else if (
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
          .fetch(logChannelId)
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
        () => {}
      );
    }
  }


  catch (err) {
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
  parseTopic,
  buildTicketControlRow,
  findCategory,
  isServiceTicket,
};
