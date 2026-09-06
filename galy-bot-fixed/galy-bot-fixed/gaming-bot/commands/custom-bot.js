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
    )
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role that can see and access tickets from this panel.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const description = interaction.options.getString('description');
    const title = interaction.options.getString('title');
    const role = interaction.options.getRole('role');

    if (!role) {
      return interaction.reply({
        content: '❌ Please choose a valid role.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor('#5865F2');

    if (title) {
      embed.setTitle(title);
    }

    const button = new ButtonBuilder()
      .setCustomId(`custom_ticket_create_${role.id}`)
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
      content: `✅ Custom ticket panel sent. ${role} can see and access the tickets created from it.`,
      ephemeral: true,
    });
  },
};
