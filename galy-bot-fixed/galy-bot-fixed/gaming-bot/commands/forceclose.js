const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forceclose')
    .setDescription('Force close the current ticket'),

  async execute(interaction) {
    try {
      const isMod = (config.modRoleIds || []).some(
        roleId =>
          roleId &&
          interaction.member?.roles?.cache?.has(roleId)
      );

      if (!isMod) {
        return interaction.reply({
          content: '❌ You need the **Mod** role to use this command.',
          ephemeral: true,
        });
      }

      if (!interaction.channel) {
        return interaction.reply({
          content: '❌ This command can only be used in a ticket.',
          ephemeral: true,
        });
      }

      await interaction.reply({
        content: '🔒 Force closing this ticket...',
        ephemeral: true,
      });

      await interaction.channel.delete().catch(err => {
        console.error('Failed to delete ticket:', err);
      });

    } catch (err) {
      console.error('Forceclose error:', err);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Something went wrong while force closing the ticket.',
          ephemeral: true,
        });
      }
    }
  },
};
