const { SlashCommandBuilder } = require('discord.js');
const { isMod, canModerate } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Who to kick')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('Reason')
        .setRequired(false)
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
          '❌ You cannot kick this member because their highest role is equal to or higher than your highest role.',
        ephemeral: true,
      });
    }

    // Bot hierarchy check
    if (!member.kickable) {
      return interaction.reply({
        content:
          '❌ I cannot kick this member because their highest role is higher than my bot role.',
        ephemeral: true,
      });
    }

    await target
      .send(
        `You have been kicked from **${interaction.guild.name}**.\n` +
        `Reason: ${reason || 'No reason provided'}`
      )
      .catch(() => {});

    try {
      await member.kick(reason || undefined);
    } catch (err) {
      console.error('Kick error:', err);

      return interaction.reply({
        content: "❌ Couldn't kick that member.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: `👢 ${target} has been kicked.`,
    });

    await logModAction(interaction.guild, {
      action: 'Kick',
      moderator: interaction.user,
      target,
      reason,
    });
  },
};
