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

    // ADMIN ONLY
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

    // Must be inside a server
    if (!interaction.inGuild()) {
      return interaction.reply({
        content:
          '❌ This command can only be used inside a server.',
        ephemeral: true,
      });
    }

    // Force close the ticket
    await forceCloseTicket(interaction);
  },
};
