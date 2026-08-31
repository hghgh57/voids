const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  forceCloseTicket,
} = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forceclose')
    .setDescription('Force close the current ticket')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content:
          '❌ This command can only be used in a server.',
        ephemeral: true,
      });
    }

    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return interaction.reply({
        content:
          '❌ You need **Administrator** permission to use `/forceclose`.',
        ephemeral: true,
      });
    }

    await forceCloseTicket(interaction);
  },
};
