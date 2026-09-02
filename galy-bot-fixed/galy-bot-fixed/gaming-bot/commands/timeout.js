const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  isMod,
  canModerate,
} = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to timeout')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('time')
        .setDescription('How long to timeout them')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000)
    )
    .addStringOption(option =>
      option
        .setName('unit')
        .setDescription('The time unit')
        .setRequired(true)
        .addChoices(
          { name: 'Seconds', value: 'seconds' },
          { name: 'Minutes', value: 'minutes' },
          { name: 'Hours', value: 'hours' },
          { name: 'Days', value: 'days' },
          { name: 'Weeks', value: 'weeks' },
          { name: 'Months', value: 'months' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false)
        .setMaxLength(500)
    ),

  async execute(interaction) {

    if (!isMod(interaction.member)) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('time');
    const unit = interaction.options.getString('unit');
    const reason =
      interaction.options.getString('reason') ||
      'No reason provided.';

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (!member) {
      return interaction.reply({
        content: '❌ Could not find that member in this server.',
        ephemeral: true,
      });
    }

    if (!canModerate(interaction.member, member)) {
      return interaction.reply({
        content:
          '❌ You cannot timeout this member because their highest role is equal to or higher than your highest role.',
        ephemeral: true,
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        content:
          '❌ I cannot timeout this member. Make sure my bot role is above their highest role.',
        ephemeral: true,
      });
    }

    const multipliers = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
    };

    const duration = amount * multipliers[unit];

    // Discord's maximum timeout is 28 days.
    const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000;

    if (duration > MAX_TIMEOUT) {
      return interaction.reply({
        content:
          '❌ Discord only allows timeouts of up to **28 days**.',
        ephemeral: true,
      });
    }

    await member.timeout(duration, reason);

    return interaction.reply({
      content:
        `✅ ${user} has been timed out for **${amount} ${unit}**.\n> **Reason:** ${reason}`,
    });
  },
};
