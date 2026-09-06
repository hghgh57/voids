const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('custom-bot')
    .setDescription('Send a custom ticket panel.')
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('The description shown on the ticket panel.')
        .setRequired(true)
        .setMaxLength(4096)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('The optional title shown on the ticket panel.')
        .setRequired(false)
        .setMaxLength(256)
    ),

  async execute(interaction) {
    const description = interaction.options.getString('description');
    const title = interaction.options.getString('title');

    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor('#5865F2');

    if (title) {
      embed.setTitle(title);
    }

    const button = new ButtonBuilder()
      .setCustomId('custom_ticket_create')
      .setLabel('Create a Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
      .addComponents(button);

    await interaction.channel.send({
      embeds: [embed],
      components: [row],
    });

    await interaction.reply({
      content: '✅ Custom ticket panel sent.',
      ephemeral: true,
    });
  },
};
