const { SlashCommandBuilder } = require('discord.js');

const {
  forceCloseTicket,
} = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forceclose')
    .setDescription('Force close the current ticket'),

  async execute(interaction) {
    await forceCloseTicket(interaction);
  },
};
