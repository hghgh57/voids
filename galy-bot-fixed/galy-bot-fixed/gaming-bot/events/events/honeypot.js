const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(
  __dirname,
  '..',
  'data',
  'honeypots.json'
);

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {};
    }

    return JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );
  } catch (error) {
    console.error('[HONEYPOT] Failed to load data:', error);
    return {};
  }
}

function saveData(data) {
  try {
    const directory = path.dirname(DATA_FILE);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {
        recursive: true,
      });
    }

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error('[HONEYPOT] Failed to save data:', error);
  }
}

module.exports = {
  name: 'honeypot',

  register(client) {
    client.on('messageCreate', async (message) => {
      try {
        if (!message.guild) return;
        if (message.author?.bot) return;

        const data = loadData();
        const honeypot = data[message.channel.id];

        if (!honeypot) return;

        const member = message.member;

        if (!member) return;

        // Delete the message first.
        await message.delete().catch(() => {});

        // Kick the member.
        if (member.kickable) {
          await member.kick(
            'Honeypot triggered'
          );

          honeypot.kicks =
            Number(honeypot.kicks || 0) + 1;

          saveData(data);

          // Update the honeypot button.
          if (honeypot.messageId) {
            try {
              const channel =
                await client.channels.fetch(
                  honeypot.channelId
                );

              if (channel?.isTextBased()) {
                const honeypotMessage =
                  await channel.messages.fetch(
                    honeypot.messageId
                  );

                const button =
                  honeypotMessage.components?.[0]
                    ?.components?.[0];

                if (button) {
                  const {
                    ActionRowBuilder,
                    ButtonBuilder,
                  } = require('discord.js');

                  const updatedButton =
                    ButtonBuilder.from(button)
                      .setLabel(
                        `${honeypot.buttonName} • Kicks: ${honeypot.kicks}`
                      );

                  const row =
                    new ActionRowBuilder()
                      .addComponents(
                        updatedButton
                      );

                  await honeypotMessage.edit({
                    components: [row],
                  });
                }
              }
            } catch (error) {
              console.error(
                '[HONEYPOT] Failed to update kick count:',
                error
              );
            }
          }

          console.log(
            `[HONEYPOT] Kicked ${message.author.tag} (${message.author.id}) from ${message.guild.name}`
          );
        } else {
          console.warn(
            `[HONEYPOT] Could not kick ${message.author.tag} (${message.author.id}). Check bot role position and permissions.`
          );
        }
      } catch (error) {
        console.error(
          '[HONEYPOT] Message handling error:',
          error
        );
      }
    });
  },
};
