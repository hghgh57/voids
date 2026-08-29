const {
  SlashCommandBuilder,
} = require('discord.js');

const {
  forceCloseTicket,
} = require('../utils/ticketManager');

const {
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


    // Require the Mod role
    if (
      !isMod(
        interaction.member
      )
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
