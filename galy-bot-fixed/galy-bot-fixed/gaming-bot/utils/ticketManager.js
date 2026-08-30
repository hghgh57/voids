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
      const data =
        parseTopic(channel.topic);

      return (
        data &&
        data.userId === userId
      );
    }
  ).size;
}


/* =========================================================
   GIVEAWAY CONFIG
========================================================= */

const GIVEAWAY_BOT_ID =
  '294882584201003009';


function getGiveawayChannelIds() {
  const ids = [];

  if (
    Array.isArray(
      config.giveawayChannelIds
    )
  ) {
    ids.push(
      ...config.giveawayChannelIds
    );
  }

  if (
    Array.isArray(
      config.giveaway_channel_ids
    )
  ) {
    ids.push(
      ...config.giveaway_channel_ids
    );
  }

  if (
    config.giveawayChannelId
  ) {
    ids.push(
      config.giveawayChannelId
    );
  }

  if (
    config.giveaway_channel_id
  ) {
    ids.push(
      config.giveaway_channel_id
    );
  }

  return [
    ...new Set(
      ids
        .filter(Boolean)
        .map(String)
    ),
  ];
}


function normaliseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^@/, '')
    .trim();
}


function getUserNames(user) {
  return [
    user.username,
    user.globalName,
    user.displayName,
    user.tag,
  ]
    .filter(Boolean)
    .map(normaliseName);
}


function textContainsUsername(
  text,
  names
) {
  const value =
    normaliseName(text);

  if (!value) {
    return false;
  }

  return names.some(
    (name) => {
      if (!name) {
        return false;
      }

      return (
        value === name ||
        value.includes(name)
      );
    }
  );
}


function messageContainsUser(
  message,
  user
) {
  /*
   * ID check first.
   *
   * This is the safest way to identify
   * the winner when GiveawayBot mentions them.
   */
  if (
    message.mentions?.users?.has(
      user.id
    )
  ) {
    return true;
  }

  const names =
    getUserNames(user);

  /*
   * Check normal message content.
   */
  if (
    textContainsUsername(
      message.content,
      names
    )
  ) {
    return true;
  }

  /*
   * Check embeds.
   */
  for (
    const embed of
    message.embeds || []
  ) {
    if (
      textContainsUsername(
        embed.title,
        names
      ) ||
      textContainsUsername(
        embed.description,
        names
      ) ||
      textContainsUsername(
        embed.footer?.text,
        names
      ) ||
      textContainsUsername(
        embed.author?.name,
        names
      )
    ) {
      return true;
    }

    for (
      const field of
      embed.fields || []
    ) {
      if (
        textContainsUsername(
          field.name,
          names
        ) ||
        textContainsUsername(
          field.value,
          names
        )
      ) {
        return true;
      }
    }
  }

  return false;
}


function isGiveawayBotMessage(
  message
) {
  return (
    message?.author?.id ===
    GIVEAWAY_BOT_ID
  );
}


function isEndedGiveawayMessage(
  message
) {
  const content =
    String(
      message.content || ''
    ).toLowerCase();

  const embedText =
    (message.embeds || [])
      .map(
        (embed) =>
          [
            embed.title,
            embed.description,
            embed.footer?.text,
            ...(embed.fields || [])
              .flatMap(
                (field) => [
                  field.name,
                  field.value,
                ]
              ),
          ]
            .filter(Boolean)
            .join('\n')
      )
      .join('\n')
      .toLowerCase();

  const text =
    `${content}\n${embedText}`;

  return (
    text.includes(
      'giveaway ended'
    ) ||
    text.includes(
      'giveaway has ended'
    ) ||
    text.includes(
      'winner'
    ) ||
    text.includes(
      'winners'
    )
  );
}


function extractPrize(message) {
  for (
    const embed of
    message.embeds || []
  ) {
    if (
      embed.title
    ) {
      const title =
        String(embed.title);

      if (
        /giveaway/i.test(title) &&
        !/ended/i.test(title)
      ) {
        return title
          .replace(
            /giveaway/gi,
            ''
          )
          .trim();
      }
    }

    if (
      embed.description
    ) {
      const description =
        String(
          embed.description
        );

      const prizeMatch =
        description.match(
          /(?:prize|reward)\s*[:\-]\s*(.+)/i
        );

      if (prizeMatch) {
        return prizeMatch[1]
          .split('\n')[0]
          .trim();
      }
    }

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
          .trim();
      }
    }
  }

  const content =
    String(
      message.content || ''
    );

  const match =
    content.match(
      /(?:prize|reward)\s*[:\-]\s*(.+)/i
    );

  if (match) {
    return match[1]
      .split('\n')[0]
      .trim();
  }

  return 'Unknown prize';
}


function getGiveawayJumpUrl(
  message
) {
  return (
    `https://discord.com/channels/` +
    `${message.guildId}/` +
    `${message.channelId}/` +
    `${message.id}`
  );
}


/* =========================================================
   GIVEAWAY SCANNER
========================================================= */

async function findGiveawayWins(
  guild,
  user
) {
  const results = [];

  const channelIds =
    getGiveawayChannelIds();

  if (!channelIds.length) {
    return results;
  }

  for (
    const channelId of
    channelIds
  ) {
    try {
      const channel =
        await guild.channels
          .fetch(channelId)
          .catch(() => null);

      if (
        !channel ||
        !channel.isTextBased()
      ) {
        continue;
      }

      let before = undefined;

      /*
       * Search up to 1000 GiveawayBot
       * messages per configured channel.
       *
       * This prevents an enormous
       * history scan.
       */
      for (
        let page = 0;
        page < 10;
        page++
      ) {
        const messages =
          await channel.messages.fetch({
            limit: 100,
            ...(before
              ? { before }
              : {}),
          });

        if (
          !messages.size
        ) {
          break;
        }

        for (
          const message of
          messages.values()
        ) {
          /*
           * IMPORTANT:
           *
           * Only official GiveawayBot
           * messages are checked.
           *
           * This means Void's own
           * giveaway messages are ignored.
           */
          if (
            !isGiveawayBotMessage(
              message
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

          if (
            !messageContainsUser(
              message,
              user
            )
          ) {
            continue;
          }

          results.push({
            prize:
              extractPrize(
                message
              ),

            channelId:
              channel.id,

            channelName:
              channel.name,

            messageId:
              message.id,

            jumpUrl:
              getGiveawayJumpUrl(
                message
              ),
          });
        }

        const last =
          messages.last();

        if (!last) {
          break;
        }

        before =
          last.id;

        if (
          messages.size < 100
        ) {
          break;
        }
      }
    } catch (error) {
      /*
       * Giveaway scanning errors must
       * NEVER prevent ticket creation.
       */
      console.error(
        `Giveaway scan failed for channel ${channelId}:`,
        error
      );
    }
  }

  /*
   * Remove duplicate giveaway messages.
   */
  const seen =
    new Set();

  return results.filter(
    (result) => {
      const key =
        `${result.channelId}:${result.messageId}`;

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}


function buildGiveawayResultsText(
  wins
) {
  if (
    !wins.length
  ) {
    return (
      '❌ No GiveawayBot wins were found for this user.'
    );
  }

  return wins
    .map(
      (win, index) =>
        `🏆 **Win ${index + 1}:** ${win.prize}\n` +
        `📍 ${win.channelName}`
    )
    .join('\n\n');
}


function buildGiveawayJumpButtons(
  wins
) {
  const rows = [];

  for (
    let i = 0;
    i < wins.length;
    i += 5
  ) {
    const row =
      new ActionRowBuilder();

    wins
      .slice(i, i + 5)
      .forEach(
        (win, index) => {
          const number =
            i + index + 1;

          row.addComponents(
            new ButtonBuilder()
              .setLabel(
                `Jump to Win ${number}`
              )
              .setStyle(
                ButtonStyle.Link
              )
              .setURL(
                win.jumpUrl
              )
          );
        }
      );

    rows.push(row);
  }

  return rows;
}


/* =========================================================
   HELPERS
========================================================= */

function makeErrorEmbed(
  message
) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(
      `❌ ${message}`
    );
}


function makeSuccessEmbed(
  message
) {
  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `✅ ${message}`
    );
}


function buildTicketControlRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'ticket:close'
        )
        .setLabel(
          'Close Ticket'
        )
        .setEmoji('🔒')
        .setStyle(
          ButtonStyle.Danger
        )
    );
}


function buildClaimModal() {
  return new ModalBuilder()
    .setCustomId(
      'ticket:claim:questions'
    )
    .setTitle(
      'Giveaway Claim'
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              'amount'
            )
            .setLabel(
              'How much did you win?'
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
            .setMaxLength(
              200
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              'host'
            )
            .setLabel(
              'Who was the giveaway hosted by?'
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
            .setMaxLength(
              200
            )
        )
    );
}


function isGiveawayClaimTicket(
  channel
) {
  const data =
    parseTopic(
      channel.topic
    );

  if (!data) {
    return false;
  }

  return (
    String(
      data.categoryId
    ).toLowerCase() ===
    'giveaway_claim'
  );
}


/* =========================================================
   OPEN TICKET
========================================================= */

async function openTicket(
  interaction,
  categoryId
) {
  try {
    if (
      !interaction.guild
    ) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            'Tickets can only be opened inside a server.'
          ),
        ],
        ephemeral: true,
      });
    }

    const guild =
      interaction.guild;

    const existing =
      guild.channels.cache.find(
        (channel) => {
          const data =
            parseTopic(
              channel.topic
            );

          return (
            data &&
            data.userId ===
              interaction.user.id &&
            data.categoryId ===
              categoryId
          );
        }
      );

    /*
     * Do NOT lock the ticket button
     * permanently after it has been used.
     *
     * A closed ticket is deleted, so the
     * user can open another one.
     */
    if (existing) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            `You already have an open **${categoryId}** ticket: ${existing}`
          ),
        ],
        ephemeral: true,
      });
    }

    const count =
      countOpenTicketsForUser(
        guild,
        interaction.user.id
      );

    const maxTickets =
      Number(
        config.maxOpenTickets ||
        config.max_open_tickets ||
        1
      );

    if (
      count >= maxTickets
    ) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            `You already have the maximum of **${maxTickets}** open ticket${maxTickets === 1 ? '' : 's'}.`
          ),
        ],
        ephemeral: true,
      });
    }

    const botMember =
      guild.members.me ||
      await guild.members
        .fetch(
          interaction.client.user.id
        );

    const required =
      [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.AttachFiles,
      ];

    const missing =
      required.filter(
        permission =>
          !botMember.permissions.has(
            permission
          )
      );

    if (
      missing.length
    ) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            'I am missing the permissions required to create tickets.'
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    const category =
      await guild.channels
        .fetch(categoryId)
        .catch(() => null);

    if (
      !category ||
      category.type !==
        ChannelType.GuildCategory
    ) {
      return interaction.editReply({
        embeds: [
          makeErrorEmbed(
            'The configured ticket category could not be found.'
          ),
        ],
      });
    }

    const safeUsername =
      interaction.user.username
        .toLowerCase()
        .replace(
          /[^a-z0-9-]/g,
          '-'
        )
        .replace(
          /-+/g,
          '-'
        )
        .slice(0, 20) ||
      'user';

    const random =
      Math.floor(
        10000 +
        Math.random() *
          90000
      );

    const channel =
      await guild.channels.create({
        name:
          `ticket-${safeUsername}-${random}`,

        type:
          ChannelType.GuildText,

        parent:
          category.id,

        topic:
          `ticket|${interaction.user.id}|${categoryId}`,

        permissionOverwrites: [
          {
            id:
              guild.roles.everyone.id,

            deny: [
              PermissionsBitField.Flags.ViewChannel,
            ],
          },

          {
            id:
              interaction.user.id,

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
        ],
      });

    /*
     * Add configured staff role.
     */
    const staffRoleId =
      config.ticketStaffRoleId ||
      config.ticket_staff_role_id ||
      config.transcriptRoleId ||
      config.transcript_role_id;

    if (
      staffRoleId
    ) {
      await channel.permissionOverwrites
        .edit(
          staffRoleId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
          }
        )
        .catch(() => {});
    }

    const ticketEmbed =
      new EmbedBuilder()
        .setTitle(
          '🎫 Ticket'
        )
        .setDescription(
          `Welcome ${interaction.user}!\n\n` +
          `A member of the support team will help you shortly.\n\n` +
          `When you are finished, click **Close Ticket** below.`
        )
        .setTimestamp();

    /*
     * Giveaway claim check.
     *
     * This is deliberately wrapped in its own
     * try/catch so a GiveawayBot/API/history
     * problem cannot break ticket creation.
     */
    const isClaim =
      String(categoryId)
        .toLowerCase()
        .includes(
          'giveaway'
        ) &&
      String(categoryId)
        .toLowerCase()
        .includes(
          'claim'
        );

    let giveawayWins = [];

    if (
      isClaim
    ) {
      try {
        giveawayWins =
          await findGiveawayWins(
            guild,
            interaction.user
          );
      } catch (error) {
        console.error(
          'Giveaway lookup failed:',
          error
        );

        giveawayWins = [];
      }

      ticketEmbed.addFields({
        name:
          '🎁 Giveaway Check',

        value:
          buildGiveawayResultsText(
            giveawayWins
          ),
      });
    }

    const components = [
      buildTicketControlRow(),
    ];

    if (
      giveawayWins.length
    ) {
      components.push(
        ...buildGiveawayJumpButtons(
          giveawayWins
        )
      );
    }

    await channel.send({
      content:
        `${interaction.user}` +
        (
          staffRoleId
            ? ` <@&${staffRoleId}>`
            : ''
        ),

      embeds: [
        ticketEmbed,
      ],

      components,
    });

    await interaction.editReply({
      embeds: [
        makeSuccessEmbed(
          `Your ticket has been created: ${channel}`
        ),
      ],
    });

    return channel;
  } catch (error) {
    console.error(
      'TICKET CREATION ERROR:',
      error
    );

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      return interaction
        .editReply({
          embeds: [
            makeErrorEmbed(
              'Something went wrong while creating your ticket.'
            ),
          ],
        })
        .catch(() => {});
    }

    return interaction
      .reply({
        embeds: [
          makeErrorEmbed(
            'Something went wrong while creating your ticket.'
          ),
        ],
        ephemeral: true,
      })
      .catch(() => {});
  }
}


/* =========================================================
   CLOSE TICKET
========================================================= */

async function closeTicket(
  interaction,
  force = false
) {
  try {
    if (
      !interaction.guild
    ) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            'This can only be used inside a server.'
          ),
        ],
        ephemeral: true,
      });
    }

    const data =
      parseTopic(
        interaction.channel?.topic
      );

    if (!data) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            'This channel is not an open ticket.'
          ),
        ],
        ephemeral: true,
      });
    }

    const isOwner =
      data.userId ===
      interaction.user.id;

    const staffRoleId =
      config.ticketStaffRoleId ||
      config.ticket_staff_role_id ||
      config.transcriptRoleId ||
      config.transcript_role_id;

    const isStaff =
      Boolean(
        staffRoleId &&
        interaction.member?.roles?.cache?.has(
          staffRoleId
        )
      );

    const isAdmin =
      interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator
      );

    const canManage =
      interaction.memberPermissions?.has(
        PermissionsBitField.Flags.ManageChannels
      );

    if (
      !force &&
      !isOwner &&
      !isStaff &&
      !isAdmin &&
      !canManage
    ) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            'You do not have permission to close this ticket.'
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    /*
     * Build transcript before deleting
     * the channel.
     */
    let transcript = null;

    try {
      transcript =
        await buildTranscript(
          interaction.channel
        );
    } catch (error) {
      console.error(
        'Transcript generation failed:',
        error
      );
    }

    /*
     * Send transcript to configured channel.
     */
    const transcriptChannelId =
      config.transcriptChannelId ||
      config.transcript_channel_id;

    if (
      transcriptChannelId &&
      transcript
    ) {
      const transcriptChannel =
        await interaction.guild.channels
          .fetch(
            transcriptChannelId
          )
          .catch(() => null);

      if (
        transcriptChannel &&
        transcriptChannel.isTextBased()
      ) {
        await transcriptChannel
          .send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  '📄 Ticket Transcript'
                )
                .setDescription(
                  `Ticket: **${interaction.channel.name}**\n` +
                  `Opened by: <@${data.userId}>\n` +
                  `Closed by: ${interaction.user}`
                )
                .setTimestamp(),
            ],

            files: [
              transcript,
            ],
          })
          .catch(
            error =>
              console.error(
                'Failed to send transcript:',
                error
              )
          );
      }
    }

    /*
     * Staff statistics.
     */
    try {
      await incrementStat(
        interaction.guild.id,
        interaction.user.id,
        'ticketsClosed'
      );
    } catch (error) {
      console.error(
        'Failed to update ticket stats:',
        error
      );
    }

    /*
     * Central logging.
     */
    try {
      await logTicketClose(
        interaction.client,
        {
          guildName:
            interaction.guild.name,

          guildId:
            interaction.guild.id,

          userMention:
            `<@${data.userId}>`,

          userId:
            data.userId,

          closedByMention:
            `${interaction.user}`,

          closedById:
            interaction.user.id,

          channelName:
            interaction.channel.name,

          ticketType:
            data.categoryId,
        },
        transcript
      );
    } catch (error) {
      console.error(
        'Ticket close logging failed:',
        error
      );
    }

    await interaction.editReply({
      embeds: [
        makeSuccessEmbed(
          'Ticket closed. The transcript has been saved.'
        ),
      ],
    });

    await interaction.channel
      .delete(
        'Ticket closed'
      )
      .catch(
        error =>
          console.error(
            'Failed to delete ticket channel:',
            error
          )
      );
  } catch (error) {
    console.error(
      'TICKET CLOSE ERROR:',
      error
    );

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      return interaction
        .editReply({
          embeds: [
            makeErrorEmbed(
              'Something went wrong while closing the ticket.'
            ),
          ],
        })
        .catch(() => {});
    }

    return interaction
      .reply({
        embeds: [
          makeErrorEmbed(
            'Something went wrong while closing the ticket.'
          ),
        ],
        ephemeral: true,
      })
      .catch(() => {});
  }
}


/* =========================================================
   BUTTON / MODAL HANDLER
========================================================= */

async function handle(
  interaction
) {
  if (
    !interaction.guildId
  ) {
    return;
  }

  /*
   * CLOSE BUTTON
   */
  if (
    interaction.isButton() &&
    interaction.customId ===
      'ticket:close'
  ) {
    return closeTicket(
      interaction
    );
  }

  /*
   * FORCE CLOSE
   */
  if (
    interaction.isButton() &&
    interaction.customId ===
      'ticket:forceclose'
  ) {
    return closeTicket(
      interaction,
      true
    );
  }

  /*
   * TICKET OPEN BUTTON
   */
  if (
    interaction.isButton() &&
    interaction.customId.startsWith(
      'ticket:open:'
    )
  ) {
    const categoryId =
      interaction.customId
        .split(':')
        .slice(2)
        .join(':');

    return openTicket(
      interaction,
      categoryId
    );
  }

  /*
   * TICKET DROPDOWN
   */
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId ===
      'ticket:select'
  ) {
    const value =
      interaction.values[0];

    const categoryId =
      value.startsWith(
        'ticket:'
      )
        ? value.substring(
            'ticket:'.length
          )
        : value;

    return openTicket(
      interaction,
      categoryId
    );
  }

  /*
   * GIVEAWAY CLAIM QUESTIONS
   */
  if (
    interaction.isButton() &&
    interaction.customId ===
      'ticket:claim'
  ) {
    return interaction.showModal(
      buildClaimModal()
    );
  }

  /*
   * GIVEAWAY CLAIM MODAL
   */
  if (
    interaction.isModalSubmit() &&
    interaction.customId ===
      'ticket:claim:questions'
  ) {
    const amount =
      interaction.fields
        .getTextInputValue(
          'amount'
        )
        .trim();

    const host =
      interaction.fields
        .getTextInputValue(
          'host'
        )
        .trim();

    const data =
      parseTopic(
        interaction.channel?.topic
      );

    if (!data) {
      return interaction.reply({
        embeds: [
          makeErrorEmbed(
            'This is not a valid ticket.'
          ),
        ],
        ephemeral: true,
      });
    }

    const wins =
      await findGiveawayWins(
        interaction.guild,
        interaction.user
      ).catch(
        error => {
          console.error(
            'Giveaway check failed:',
            error
          );

          return [];
        }
      );

    const embed =
      new EmbedBuilder()
        .setTitle(
          '🎁 Giveaway Claim'
        )
        .setDescription(
          `${interaction.user} has submitted a giveaway claim.`
        )
        .addFields(
          {
            name:
              '💰 What did they win?',
            value:
              amount ||
              'Not provided',
            inline: true,
          },
          {
            name:
              '👤 Who hosted it?',
            value:
              host ||
              'Not provided',
            inline: true,
          },
          {
            name:
              '🔎 GiveawayBot Check',
            value:
              buildGiveawayResultsText(
                wins
              ),
          }
        )
        .setTimestamp();

    const components =
      buildGiveawayJumpButtons(
        wins
      );

    await interaction.channel.send({
      embeds: [
        embed,
      ],

      components,
    });

    return interaction.reply({
      embeds: [
        makeSuccessEmbed(
          'Your giveaway claim has been submitted.'
        ),
      ],
      ephemeral: true,
    });
  }
}


module.exports = {
  handle,
  openTicket,
  closeTicket,
  findGiveawayWins,
};
