const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const ffmpegPath = require('ffmpeg-static');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');

const DATA_FILE = path.join(__dirname, '..', 'data', 'music.json');

const guildPlayers = new Map();
let youtubePromise = null;

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};

    const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
    if (!raw) return {};

    return JSON.parse(raw);
  } catch (error) {
    console.error('[MUSIC] Failed to load music data:', error);
    return {};
  }
}

function saveData(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[MUSIC] Failed to save music data:', error);
  }
}

function getConfig(guildId) {
  const data = loadData();
  return data[guildId] || null;
}

function setConfig(guildId, config) {
  const data = loadData();

  data[guildId] = {
    ...(data[guildId] || {}),
    ...config,
  };

  saveData(data);
}

function getPlayer(guildId) {
  return guildPlayers.get(guildId) || null;
}

function getVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }

    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }

      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || null;
      }

      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || null;
      }
    }
  } catch {}

  return null;
}

async function getYoutube() {
  if (!youtubePromise) {
    youtubePromise = import('youtubei.js')
      .then(({ Innertube, UniversalCache }) =>
        Innertube.create({
          cache: new UniversalCache(false),
          generate_session_locally: true,
        })
      )
      .catch(error => {
        youtubePromise = null;
        throw error;
      });
  }

  return youtubePromise;
}

async function ensureYtDlp() {
  const binDir = path.join(__dirname, '..', 'bin');
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const binaryPath = path.join(binDir, binaryName);

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  fs.mkdirSync(binDir, { recursive: true });

  const downloadUrl = process.platform === 'win32'
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  console.log(`[MUSIC] Downloading yt-dlp from ${downloadUrl}`);

  const response = await withTimeout(
    fetch(downloadUrl, { redirect: 'follow' }),
    30000,
    'yt-dlp download timed out.'
  );

  if (!response.ok || !response.body) {
    throw new Error(`Could not download yt-dlp (${response.status}).`);
  }

  const tempPath = `${binaryPath}.tmp`;
  const file = fs.createWriteStream(tempPath);

  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      file.write(chunk);
    }
  } finally {
    await new Promise(resolve => file.end(resolve));
  }

  fs.renameSync(tempPath, binaryPath);

  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log(`[MUSIC] yt-dlp ready: ${binaryPath}`);
  return binaryPath;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function createGuildPlayer(guildId) {
  const existing = guildPlayers.get(guildId);
  if (existing) return existing;

  const config = getConfig(guildId);

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play,
    },
  });

  const state = {
    player,
    connection: null,
    queue: [],
    current: null,
    paused: false,
    loop: 'off',
    playing: false,
    skipRequested: false,
    ffmpeg: null,
    ytdlp: null,
    panelMessageId: config?.panelMessageId || null,
    panelChannelId: config?.controlChannelId || null,
  };

  player.on(AudioPlayerStatus.Idle, async () => {
    try {
      if (state.ytdlp) {
        try { state.ytdlp.kill('SIGKILL'); } catch {}
        state.ytdlp = null;
      }

      if (state.ffmpeg) {
        try {
          state.ffmpeg.kill('SIGKILL');
        } catch {}
        state.ffmpeg = null;
      }

      const current = state.current;

      if (state.skipRequested) {
        state.skipRequested = false;
        state.current = null;
        state.playing = false;
        state.paused = false;
        await playNext(guildId);
        return;
      }

      if (current && state.loop === 'song') {
        await playTrack(guildId, current);
        return;
      }

      if (current && state.loop === 'queue') {
        state.queue.push(current);
      }

      state.current = null;
      state.playing = false;
      state.paused = false;

      await playNext(guildId);
    } catch (error) {
      console.error('[MUSIC] Idle handler error:', error);
    }
  });

  player.on('error', async error => {
    console.error(`[MUSIC] Player error in ${guildId}:`, error);

    if (state.ytdlp) {
      try { state.ytdlp.kill('SIGKILL'); } catch {}
      state.ytdlp = null;
    }

    if (state.ffmpeg) {
      try {
        state.ffmpeg.kill('SIGKILL');
      } catch {}
      state.ffmpeg = null;
    }

    state.current = null;
    state.playing = false;
    state.paused = false;

    await playNext(guildId);
  });

  guildPlayers.set(guildId, state);
  return state;
}

function getVoiceConnectionForGuild(guildId) {
  return getVoiceConnection(guildId) || null;
}

async function connectToVoice(member) {
  const channel = member.voice.channel;

  if (!channel) {
    throw new Error('You must be in a voice channel.');
  }

  if (!channel.joinable || !channel.speakable) {
    throw new Error('I cannot join or speak in that voice channel.');
  }

  const existing = getVoiceConnectionForGuild(channel.guild.id);

  if (existing) {
    try {
      if (existing.joinConfig.channelId === channel.id) {
        await entersState(existing, VoiceConnectionStatus.Ready, 10000);
        return existing;
      }

      existing.destroy();
    } catch {
      try {
        existing.destroy();
      } catch {}
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
  } catch {
    try {
      connection.destroy();
    } catch {}

    throw new Error('I could not connect to the voice channel.');
  }

  return connection;
}

async function getOrCreateConnection(member, state) {
  const channel = member.voice.channel;

  if (!channel) {
    throw new Error('You must be in a voice channel.');
  }

  const existing = getVoiceConnectionForGuild(member.guild.id);

  if (existing && existing.joinConfig.channelId) {
    if (existing.joinConfig.channelId !== channel.id) {
      throw new Error(
        `I am already in <#${existing.joinConfig.channelId}>.`
      );
    }

    state.connection = existing;
    existing.subscribe(state.player);
    return existing;
  }

  const connection = await connectToVoice(member);

  state.connection = connection;
  connection.subscribe(state.player);

  return connection;
}

async function getTrackInfo(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Please provide a YouTube URL.');
  }

  const videoId = getVideoId(url);

  if (!videoId) {
    throw new Error('Please provide a valid YouTube video URL.');
  }

  let title = 'YouTube video';
  let author = 'YouTube';
  let duration = 'Unknown';
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const youtube = await getYoutube();
    const info = await withTimeout(
      youtube.getBasicInfo(videoId),
      12000,
      'YouTube took too long to respond.'
    );

    title = info.basic_info?.title || title;
    author = info.basic_info?.author || author;

    const seconds = Number(info.basic_info?.duration || 0);
    if (Number.isFinite(seconds) && seconds > 0) {
      const minutes = Math.floor(seconds / 60);
      const secs = String(seconds % 60).padStart(2, '0');
      duration = `${minutes}:${secs}`;
    }
  } catch (error) {
    console.warn('[MUSIC] Metadata lookup failed, continuing anyway:', error.message);
  }

  return {
    url,
    videoId,
    title,
    duration,
    thumbnail,
    author,
  };
}

async function playTrack(guildId, track) {
  const state = guildPlayers.get(guildId);

  if (!state || !track) return false;

  try {
    console.log(`[MUSIC] Starting yt-dlp stream: ${track.title}`);

    if (!ffmpegPath) {
      throw new Error('FFmpeg is not available.');
    }

    const ytdlpPath = await ensureYtDlp();

    const ytdlp = spawn(
      ytdlpPath,
      [
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        '--no-progress',
        '-f',
        'bestaudio/best',
        '-o',
        '-',
        '--',
        track.url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    state.ytdlp = ytdlp;

    let ytdlpError = '';
    ytdlp.stderr.on('data', chunk => {
      ytdlpError += chunk.toString();
    });

    ytdlp.on('error', error => {
      console.error('[MUSIC] yt-dlp process error:', error);
    });

    const ffmpeg = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vn',
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    state.ffmpeg = ffmpeg;

    let ffmpegError = '';
    ffmpeg.stderr.on('data', chunk => {
      ffmpegError += chunk.toString();
    });

    ffmpeg.on('error', error => {
      console.error('[MUSIC] FFmpeg process error:', error);
    });

    ytdlp.stdout.pipe(ffmpeg.stdin);

    ffmpeg.stdin.on('error', error => {
      console.error('[MUSIC] FFmpeg stdin error:', error.message);
    });

    ytdlp.on('close', code => {
      state.ytdlp = null;

      if (code !== 0 && code !== null) {
        console.error(
          '[MUSIC] yt-dlp exited with code',
          code,
          ytdlpError.trim()
        );

        try {
          ffmpeg.stdin.destroy(
            new Error(
              ytdlpError.trim() || `yt-dlp exited with code ${code}`
            )
          );
        } catch {}
      }
    });

    ffmpeg.on('close', code => {
      state.ffmpeg = null;

      if (code !== 0 && code !== null) {
        console.error(
          '[MUSIC] FFmpeg exited with code',
          code,
          ffmpegError.trim()
        );
      }
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      metadata: track,
      inlineVolume: false,
    });

    // Set the state before play() so the panel immediately shows that a
    // resource exists instead of remaining on Stopped while buffering.
    state.current = track;
    state.playing = true;
    state.paused = false;
    state.skipRequested = false;

    state.player.play(resource);

    console.log(`[MUSIC] Player resource created: ${track.title}`);
    await updatePanel(guildId);

    return true;
  } catch (error) {
    console.error('[MUSIC] Failed to play track:', error);

    if (state.ytdlp) {
      try { state.ytdlp.kill('SIGKILL'); } catch {}
      state.ytdlp = null;
    }

    if (state.ffmpeg) {
      try { state.ffmpeg.kill('SIGKILL'); } catch {}
      state.ffmpeg = null;
    }

    state.current = null;
    state.playing = false;
    state.paused = false;

    await updatePanel(guildId);
    return false;
  }
}

async function playNext(guildId) {
  const state = guildPlayers.get(guildId);
  if (!state) return;

  const next = state.queue.shift();

  if (!next) {
    state.current = null;
    state.playing = false;
    state.paused = false;
    await updatePanel(guildId);
    return;
  }

  await playTrack(guildId, next);
}

async function addTrack(member, track) {
  const guildId = member.guild.id;
  const state = createGuildPlayer(guildId);

  await getOrCreateConnection(member, state);

  state.queue.push(track);

  if (
    !state.playing &&
    state.player.state.status === AudioPlayerStatus.Idle
  ) {
    await playNext(guildId);
  } else {
    await updatePanel(guildId);
  }

  return state;
}

async function pause(guildId) {
  const state = guildPlayers.get(guildId);
  if (!state || !state.current) return false;

  const changed = state.player.pause();

  if (changed) {
    state.paused = true;
    await updatePanel(guildId);
  }

  return changed;
}

async function resume(guildId) {
  const state = guildPlayers.get(guildId);
  if (!state || !state.current) return false;

  const changed = state.player.unpause();

  if (changed) {
    state.paused = false;
    await updatePanel(guildId);
  }

  return changed;
}

async function skip(guildId) {
  const state = guildPlayers.get(guildId);
  if (!state || !state.current) return false;

  state.skipRequested = true;
  state.player.stop(true);
  return true;
}

async function stop(guildId) {
  const state = guildPlayers.get(guildId);
  if (!state) return false;

  const hadMusic = !!state.current || state.queue.length > 0;

  state.queue = [];
  state.current = null;
  state.playing = false;
  state.paused = false;
  state.skipRequested = false;
  state.loop = 'off';

  if (state.ytdlp) {
    try { state.ytdlp.kill('SIGKILL'); } catch {}
    state.ytdlp = null;
  }

  if (state.ffmpeg) {
    try {
      state.ffmpeg.kill('SIGKILL');
    } catch {}
    state.ffmpeg = null;
  }

  try {
    state.player.stop(true);
  } catch {}

  const connection = getVoiceConnection(guildId);
  if (connection) {
    try {
      connection.destroy();
    } catch {}
  }

  state.connection = null;
  await updatePanel(guildId);

  return hadMusic;
}

async function toggleLoop(guildId) {
  const state = guildPlayers.get(guildId);
  if (!state) return 'off';

  if (state.loop === 'off') {
    state.loop = 'song';
  } else if (state.loop === 'song') {
    state.loop = 'queue';
  } else {
    state.loop = 'off';
  }

  await updatePanel(guildId);
  return state.loop;
}

async function getQueue(guildId) {
  const state = guildPlayers.get(guildId);
  return state?.queue || [];
}

async function setPanel(guildId, channelId, messageId) {
  const state = createGuildPlayer(guildId);

  state.panelChannelId = channelId;
  state.panelMessageId = messageId;

  setConfig(guildId, {
    controlChannelId: channelId,
    panelMessageId: messageId,
  });

  await updatePanel(guildId);
}

async function updatePanel(guildId) {
  const state = guildPlayers.get(guildId);

  if (
    !state?.panelChannelId ||
    !state?.panelMessageId ||
    !global.__voidMusicClient
  ) {
    return;
  }

  try {
    const channel = await global.__voidMusicClient.channels.fetch(
      state.panelChannelId
    );

    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(state.panelMessageId);

    const {
      EmbedBuilder,
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require('discord.js');

    let description =
      'Use `/play` with a YouTube URL to start playing music.';

    if (state.current) {
      description =
        `🎵 **${state.current.title}**\n` +
        `👤 ${state.current.author}\n` +
        `⏱️ ${state.current.duration}\n` +
        `🔗 ${state.current.url}`;
    }

    const loopText =
      state.loop === 'off'
        ? 'Loop: Off'
        : state.loop === 'song'
          ? 'Loop: Song'
          : 'Loop: Queue';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎵 Void's Music")
      .setDescription(description)
      .addFields(
        {
          name: 'Queue',
          value: `${state.queue.length} song(s) waiting`,
          inline: true,
        },
        {
          name: 'Status',
          value: state.paused
            ? '⏸️ Paused'
            : state.current
              ? '▶️ Playing'
              : '⏹️ Stopped',
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
        .setDisabled(!state.current || state.paused),

      new ButtonBuilder()
        .setCustomId('music_resume')
        .setLabel('Resume')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.current || !state.paused),

      new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!state.current),

      new ButtonBuilder()
        .setCustomId('music_stop')
        .setLabel('Stop')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.current && !state.queue.length)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_loop')
        .setLabel(loopText)
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('Queue')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
    );

    await message.edit({
      embeds: [embed],
      components: [row1, row2],
    });
  } catch (error) {
    console.error('[MUSIC] Failed to update panel:', error);
  }
}

function setClient(client) {
  global.__voidMusicClient = client;
}

module.exports = {
  loadData,
  saveData,
  getConfig,
  setConfig,
  getPlayer,
  createGuildPlayer,
  getTrackInfo,
  addTrack,
  pause,
  resume,
  skip,
  stop,
  toggleLoop,
  getQueue,
  setPanel,
  updatePanel,
  setClient,
};
