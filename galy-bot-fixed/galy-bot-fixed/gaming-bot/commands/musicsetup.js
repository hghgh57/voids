const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const {
  setConfig,
  createGuildPlayer,
  setPanel,
} = require('../utils/musicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('musicsetup')
    .setDescription('Create the music category, voice channel and control panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;

    const existingCategory = guild.channels.cache.find(
      channel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === '🎵 Music'
    );

    const category =
      existingCategory ||
      await guild.channels.create({
        name: '🎵 Music',
        type: ChannelType.GuildCategory,
      });

    let voiceChannel = guild.channels.cache.find(
      channel =>
        channel.type === ChannelType.GuildVoice &&
        channel.name === "Void's Music" &&
        channel.parentId === category.id
    );

    if (!voiceChannel) {
      voiceChannel = await guild.channels.create({
        name: "Void's Music",
        type: ChannelType.GuildVoice,
        parent: category.id,
      });
    }

    let controlChannel = guild.channels.cache.find(
      channel =>
        channel.type === ChannelType.GuildText &&
        channel.name === 'music-controls' &&
        channel.parentId === category.id
    );

    if (!controlChannel) {
      controlChannel = await guild.channels.create({
        name: 'music-controls',
        type: ChannelType.GuildText,
        parent: category.id,
      });
    }

    const oldMessages = await controlChannel.messages.fetch({
      limit: 100,
    });

    for (const message of oldMessages.values()) {
      if (message.author.id === interaction.client.user.id) {
        await message.delete().catch(() => {});
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🎵 Void's Music")
      .setDescription(
        'Nothing is currently playing.\n\n' +
        'Use `/play` with a YouTube URL to start playing music.'
      )
      .addFields(
        {
          name: 'Queue',
          value: '0 song(s) waiting',
          inline: true,
        },
        {
          name: 'Status',
          value: '⏹️ Stopped',
          inline: true,
        }
      )
      .setFooter({
        text: 'Use the buttons below to control the music.',
      });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_pause')
        .setLabel('Pause')
        .setEmoji('⏸️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId('music_resume')
        .setLabel('Resume')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId('music_stop')
        .setLabel('Stop')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_loop')
        .setLabel('Loop: Off')
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('Queue')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
    );

    const panel = await controlChannel.send({
      embeds: [embed],
      components: [row1, row2],
    });

    setConfig(guild.id, {
      guildId: guild.id,
      categoryId: category.id,
      voiceChannelId: voiceChannel.id,
      controlChannelId: controlChannel.id,
      panelMessageId: panel.id,
    });

    const state = createGuildPlayer(guild.id);

    state.panelChannelId = controlChannel.id;
    state.panelMessageId = panel.id;

    await setPanel(
      guild.id,
      controlChannel.id,
      panel.id
    );

    await interaction.editReply(
      `✅ Music system created!\n\n` +
      `🎵 Category: <#${category.id}>\n` +
      `🔊 Voice: <#${voiceChannel.id}>\n` +
      `🎶 Controls: <#${controlChannel.id}>`
    );
  },
};
