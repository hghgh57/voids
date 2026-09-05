const {
  EmbedBuilder,
} = require('discord.js');

const {
  setClient,
  getConfig,
  getPlayer,
  pause,
  resume,
  skip,
  stop,
  toggleLoop,
  getQueue,
  updatePanel,
} = require('../utils/musicManager');

module.exports = {
  name: 'music',

  register(client) {
    setClient(client);

    client.on(
      'interactionCreate',
      async interaction => {
        try {
          if (!interaction.isButton()) {
            return;
          }

          const musicButtons = [
            'music_pause',
            'music_resume',
            'music_skip',
            'music_stop',
            'music_loop',
            'music_queue',
          ];

          if (
            !musicButtons.includes(
              interaction.customId
            )
          ) {
            return;
          }

          const config =
            getConfig(
              interaction.guild.id
            );

          if (!config) {
            await interaction.reply({
              content:
                '❌ Music has not been set up.',
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.channelId !==
            config.controlChannelId
          ) {
            await interaction.reply({
              content:
                '❌ Music controls can only be used in the music controls channel.',
              ephemeral: true,
            });

            return;
          }

          const state =
            getPlayer(
              interaction.guild.id
            );

          if (!state) {
            await interaction.reply({
              content:
                '❌ The music player is not active yet.',
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.customId !==
            'music_queue'
          ) {
            if (
              !interaction.member.voice.channel
            ) {
              await interaction.reply({
                content:
                  '❌ You need to be in the music voice channel to use these controls.',
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
                  `❌ You need to be in <#${config.voiceChannelId}> to use these controls.`,
                ephemeral: true,
              });

              return;
            }
          }

          if (
            interaction.customId ===
            'music_pause'
          ) {
            const changed =
              await pause(
                interaction.guild.id
              );

            await interaction.reply({
              content: changed
                ? '⏸️ Music paused.'
                : '❌ Nothing is playing.',
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.customId ===
            'music_resume'
          ) {
            const changed =
              await resume(
                interaction.guild.id
              );

            await interaction.reply({
              content: changed
                ? '▶️ Music resumed.'
                : '❌ Nothing is paused.',
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.customId ===
            'music_skip'
          ) {
            const changed =
              await skip(
                interaction.guild.id
              );

            await interaction.reply({
              content: changed
                ? '⏭️ Skipped.'
                : '❌ Nothing is playing.',
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.customId ===
            'music_stop'
          ) {
            const changed =
              await stop(
                interaction.guild.id
              );

            await interaction.reply({
              content: changed
                ? '⏹️ Music stopped.'
                : '❌ Nothing is playing.',
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.customId ===
            'music_loop'
          ) {
            const mode =
              await toggleLoop(
                interaction.guild.id
              );

            const text =
              mode === 'song'
                ? '🔂 Looping the current song.'
                : mode === 'queue'
                  ? '🔁 Looping the queue.'
                  : '➡️ Loop turned off.';

            await interaction.reply({
              content: text,
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.customId ===
            'music_queue'
          ) {
            const queue =
              await getQueue(
                interaction.guild.id
              );

            if (!queue.length) {
              await interaction.reply({
                content:
                  '📜 The queue is empty.',
                ephemeral: true,
              });

              return;
            }

            const lines =
              queue
                .slice(0, 15)
                .map(
                  (track, index) =>
                    `**${index + 1}.** ${track.title}`
                );

            const embed =
              new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(
                  '📜 Music Queue'
                )
                .setDescription(
                  lines.join('\n')
                )
                .setFooter({
                  text:
                    queue.length > 15
                      ? `Showing 15 of ${queue.length} queued songs.`
                      : `${queue.length} song(s) queued.`,
                });

            await interaction.reply({
              embeds: [embed],
              ephemeral: true,
            });

            return;
          }

          await updatePanel(
            interaction.guild.id
          );
        } catch (error) {
          console.error(
            '[MUSIC] Button error:',
            error
          );

          if (
            !interaction.replied &&
            !interaction.deferred
          ) {
            await interaction
              .reply({
                content:
                  '❌ Something went wrong with the music control.',
                ephemeral: true,
              })
              .catch(() => {});
          }
        }
      }
    );
  },
};
