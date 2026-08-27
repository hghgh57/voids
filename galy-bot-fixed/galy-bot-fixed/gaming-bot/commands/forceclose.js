const {
  SlashCommandBuilder,
  PermissionsBitField,
} = require('discord.js');

const {
  forceCloseTicket,
} = require('../utils/ticketManager');

const config =
  require('../config.json');


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


    const isAdminRole =
      (
        config.adminRoleIds ||
        []
      ).some(
        (roleId) =>
          roleId &&
          !roleId.startsWith(
            'PUT_'
          ) &&
          interaction.member.roles.cache.has(
            roleId
          )
      );


    const isAdministrator =
      interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      );


    if (
      !isAdminRole &&
      !isAdministrator
    ) {

      return interaction.reply({
        content:
          '❌ Only administrators can force close tickets.',
        ephemeral:
          true,
      });
    }


    await forceCloseTicket(
      interaction
    );
  },
};
