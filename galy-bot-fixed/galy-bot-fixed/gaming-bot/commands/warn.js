const { SlashCommandBuilder } = require('discord.js');
const { isMod, canModerate } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');
const { addWarning } = require('../utils/warnManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Who to warn')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    if (!member) {
      return interaction.reply({
        content: 'Could not find that member in this server.',
        ephemeral: true,
      });
    }

    // Mod role hierarchy check
    if (!canModerate(interaction.member, member)) {
      return interaction.reply({
        content:
          '❌ You cannot warn this member because their highest role is equal to or higher than your highest role.',
        ephemeral: true,
      });
    }

    const warningCount = addWarning(
      target.id,
      reason,
      interaction.user.id
    );

    await interaction.reply(
      `⚠️ ${target} has been warned. (Total warnings: ${warningCount})`
    );

    await target
      .send(
        `You have been warned in **${interaction.guild.name}**.\n` +
        `Reason: ${reason}`
      )
      .catch(() => {});

    await logModAction(interaction.guild, {
      action: 'Warn',
      moderator: interaction.user,
      target,
      reason,
      extra: [
        {
          name: 'Total Warnings',
          value: `${warningCount}`,
          inline: true,
        },
      ],
    });
  },
};
