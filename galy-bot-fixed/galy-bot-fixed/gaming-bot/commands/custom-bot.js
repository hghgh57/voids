const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DEV_ROLE_ID = '1539513728972628058';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('custom-bot')
    .setDescription('Send a custom ticket panel.')
    .addStringOption((option) => option.setName('description').setDescription('The description shown on the ticket panel.').setRequired(true).setMaxLength(4096))
    .addStringOption((option) => option.setName('title').setDescription('The optional title shown on the ticket panel.').setRequired(false).setMaxLength(256)),

  async execute(interaction) {
    const description = interaction.options.getString('description');
    const title = interaction.options.getString('title');
    const role = await interaction.guild.roles.fetch(DEV_ROLE_ID).catch(() => null);

    if (!role) {
      return interaction.reply({ content: '❌ The Dev role could not be found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor('#5865F2');

    if (title) embed.setTitle(title);

    const button = new ButtonBuilder()
      .setCustomId(`custom_ticket_create:${DEV_ROLE_ID}`)
      .setLabel('Create a Ticket')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({
      content: `✅ Custom ticket panel sent. Only ${role} will have staff access to these tickets.`,
      ephemeral: true,
    });
  },
};
