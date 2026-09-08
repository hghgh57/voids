const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const {
  loadGiveaways,
  saveGiveaways,
  parseDuration,
  buildGiveawayEmbed,
  buildJoinRow,
  scheduleGiveaway,
} = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gcreate')
    .setDescription('Start a giveaway')
    .addStringOption((opt) =>
      opt.setName('prize').setDescription('What are you giving away?').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('How long it runs, e.g. 30s, 10m, 1h, 1d, 1w')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners');

    const ms = parseDuration(durationStr);
    if (!ms) {
      return interaction.reply({
        content: 'Invalid duration format. Use something like `30s`, `10m`, `1h`, `1d`, or `1w`.',
        ephemeral: true,
      });
    }

    if (ms < 10 * 1000) {
      return interaction.reply({
        content: 'The giveaway must last at least 10 seconds.',
        ephemeral: true,
      });
    }

    if (ms > 30 * 24 * 60 * 60 * 1000) {
      return interaction.reply({
        content: 'The giveaway cannot last longer than 30 days.',
        ephemeral: true,
      });
    }

    const endTimestamp = Date.now() + ms;

    const giveaway = {
      prize,
      winnerCount,
      endTimestamp,
      channelId: interaction.channel.id,
      hostId: interaction.user.id,
      entrants: [],
      ended: false,
    };

    const embed = buildGiveawayEmbed(giveaway);

    await interaction.reply({ embeds: [embed], components: [buildJoinRow(0)] });
    const message = await interaction.fetchReply();

    const giveaways = loadGiveaways();
    giveaways[message.id] = giveaway;
    saveGiveaways(giveaways);

    scheduleGiveaway(interaction.client, message.id, ms);

    // DM the host their giveaway (message) ID — needed for /greroll later.
    try {
      await interaction.user.send({
        content:
          `🎉 Your giveaway for **${prize}** has started in **${interaction.guild.name}**!\n` +
          `**Giveaway ID:** \`${message.id}\`\n` +
          `Keep this ID — you'll need it to run \`/greroll message_id:${message.id}\` if you ever need to reroll a winner.`,
      });
    } catch (err) {
      console.error('Could not DM giveaway host (DMs may be closed):', err);
    }
  },
};
