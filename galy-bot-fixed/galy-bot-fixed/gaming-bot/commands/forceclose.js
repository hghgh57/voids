const {
  SlashCommandBuilder,
} = require('discord.js');

const {
  forceCloseTicket,
} = require('../utils/ticketManager');

const {
  isAdmin,
  isMod,
} = require('../utils/permissions');


module.exports = {

  data:
    new SlashCommandBuilder()
      .setName(
        'forceclose'
      )
      .setDescription(
        'Force close the current ticket without owner confirmation.'
      ),


  async execute(
    interaction
  ) {

    if (
      !interaction.guild
    ) {

      return interaction.reply({
        content:
          '❌ This command can only be used in a server.',
        ephemeral:
          true,
      });

    }


    // Admin OR Mod can use /forceclose
    if (
      !isAdmin(interaction.member) &&
      !isMod(interaction.member)
    ) {

      return interaction.reply({
        content:
          '❌ You need the **Mod** role to use this command.',
        ephemeral:
          true,
      });

    }


    await forceCloseTicket(
      interaction
    );

  },

};
