const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scammer')
    .setDescription('Report a suspected scammer')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('report')
        .setDescription('Report someone for suspected scamming')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The Discord user you are reporting')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ This command can only be used inside a server.',
        ephemeral: true,
      });
    }

    if (interaction.options.getSubcommand() !== 'report') {
      return;
    }

    const reportedUser =
      interaction.options.getUser('user');

    if (!reportedUser) {
      return interaction.reply({
        content: '❌ You need to select a user to report.',
        ephemeral: true,
      });
    }

    if (reportedUser.bot) {
      return interaction.reply({
        content: '❌ You cannot report a bot.',
        ephemeral: true,
      });
    }

    const ModalBuilder = require('discord.js').ModalBuilder;
    const TextInputBuilder = require('discord.js').TextInputBuilder;
    const TextInputStyle = require('discord.js').TextInputStyle;
    const ActionRowBuilder = require('discord.js').ActionRowBuilder;

    const modal = new ModalBuilder()
      .setCustomId(`scammer_report_modal_${reportedUser.id}`)
      .setTitle('Scammer Report');

    const detailsInput = new TextInputBuilder()
      .setCustomId('scammer_details')
      .setLabel('What happened?')
      .setPlaceholder(
        'Explain what happened and why you believe they scammed you.'
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000);

    const proofInput = new TextInputBuilder()
      .setCustomId('scammer_proof')
      .setLabel('Proof link (optional)')
      .setPlaceholder(
        'Paste a Discord message link, image link, video link, etc.'
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(detailsInput),
      new ActionRowBuilder().addComponents(proofInput)
    );

    await interaction.showModal(modal);
  },
};
