const { SlashCommandBuilder } = require('discord.js');

const {
  getConfig,
  getTrackInfo,
  addTrack,
  updatePanel,
} = require('../utils/musicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from a URL.')
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('YouTube or SoundCloud URL')
        .setRequired(true)
    ),

  async execute(interaction) {
    const config = getConfig(
      interaction.guild.id
    );

    if (
      !config?.voiceChannelId ||
      !config?.controlChannelId
    ) {
      await interaction.reply({
        content:
          '❌ Music has not been set up yet. Use `/musicsetup` first.',
        ephemeral: true,
      });

      return;
    }

    if (!interaction.member.voice.channel) {
      await interaction.reply({
        content:
          '❌ You need to be in a voice channel first.',
        ephemeral: true,
      });

      return;
    }

    if (
      interaction.member.voice.channel.id !==
      config.voiceChannelId
    ) {
      await interaction.reply({
        content:
          `❌ You need to be in <#${config.voiceChannelId}> to use the music player.`,
        ephemeral: true,
      });

      return;
    }

    const url =
      interaction.options
        .getString('url', true)
        .trim();

    await interaction.deferReply({
      ephemeral: true,
    });

    try {
      const track =
        await getTrackInfo(url);

      await addTrack(
        interaction.member,
        track
      );

      await updatePanel(
        interaction.guild.id
      );

      await interaction.editReply(
        `🎵 Added **${track.title}** to the music player.`
      );
    } catch (error) {
      console.error(
        '[MUSIC] /play error:',
        error
      );

      await interaction.editReply(
        `❌ ${
          error.message ||
          'I could not play that URL.'
        }`
      );
    }
  },
};
