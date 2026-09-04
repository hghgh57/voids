const express = require('express');
const crypto = require('crypto');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

function safeString(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function makeApiKeyValid(providedKey) {
  const expectedKey = process.env.APPLICATIONS_API_KEY;

  if (!expectedKey || !providedKey) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(providedKey)),
      Buffer.from(String(expectedKey))
    );
  } catch {
    return false;
  }
}

function createApplicationEmbed(application) {
  const embed = new EmbedBuilder()
    .setTitle(
      `${application.emoji || '📋'} ${application.label || 'Application'}`
    )
    .setColor(application.color || '#5865F2')
    .setDescription(
      `**New ${application.label || 'Application'}**\n\n` +
      `**Applicant:** <@${application.userId}>\n` +
      `**Discord ID:** \`${application.userId}\`\n\n` +
      `**Submitted:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setTimestamp();

  const answers = application.answers || [];

  answers.slice(0, 25).forEach((answer, index) => {
    const question = safeString(
      answer.question || `Question ${index + 1}`,
      200
    );

    const response = safeString(
      answer.answer || 'No answer provided.',
      1000
    );

    embed.addFields({
      name: `${index + 1}. ${question}`,
      value: response || 'No answer provided.',
      inline: false,
    });
  });

  return embed;
}

function createApplicationButtons(userId, applicationId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `app_accept_${userId}_${applicationId}`
      )
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(
        `app_deny_${userId}_${applicationId}`
      )
      .setLabel('Deny')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );
}

function startWebApplicationServer(client, config) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  /*
   * Health check
   */
  app.get('/', (req, res) => {
    res.json({
      online: true,
      bot: client.user
        ? client.user.tag
        : 'starting',
      service: 'Void’s Cove application API',
    });
  });

  /*
   * Website application endpoint
   */
  app.post('/api/applications', async (req, res) => {
    try {
      const apiKey =
        req.headers['x-application-key'];

      if (!makeApiKeyValid(apiKey)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key.',
        });
      }

      const body = req.body || {};

      const userId = safeString(body.userId, 30);
      const applicationId = safeString(
        body.applicationId,
        100
      );

      if (!userId || !applicationId) {
        return res.status(400).json({
          success: false,
          error:
            'userId and applicationId are required.',
        });
      }

      const applicationConfig = (
        config.applications || []
      ).find(
        (application) =>
          String(application.id) ===
          String(applicationId)
      );

      if (!applicationConfig) {
        return res.status(404).json({
          success: false,
          error: 'Application type not found.',
        });
      }

      const reviewChannelId =
        config.websiteApplicationChannelId;

      if (!reviewChannelId) {
        return res.status(500).json({
          success: false,
          error:
            'websiteApplicationChannelId is not configured.',
        });
      }

      const channel =
        await client.channels
          .fetch(reviewChannelId)
          .catch(() => null);

      if (!channel || !channel.isTextBased()) {
        return res.status(500).json({
          success: false,
          error:
            'Application review channel could not be found.',
        });
      }

      const answers = Array.isArray(body.answers)
        ? body.answers
        : [];

      const embed = createApplicationEmbed({
        userId,
        applicationId,
        label:
          applicationConfig.label ||
          applicationId,
        emoji:
          applicationConfig.emoji ||
          '📋',
        color:
          applicationConfig.color ||
          '#5865F2',
        answers,
      });

      const message =
        await channel.send({
          embeds: [embed],
          components: [
            createApplicationButtons(
              userId,
              applicationId
            ),
          ],
        });

      /*
       * Save enough information for accept/deny.
       * The custom IDs contain the applicant and app ID,
       * so no database is required just to process the buttons.
       */

      console.log(
        `[WEB APPLICATION] ${applicationConfig.label || applicationId} submitted by ${userId}. Message: ${message.id}`
      );

      return res.json({
        success: true,
        messageId: message.id,
      });
    } catch (error) {
      console.error(
        '[WEB APPLICATION] Failed to receive application:',
        error
      );

      return res.status(500).json({
        success: false,
        error: 'Failed to submit application.',
      });
    }
  });

  const port =
    Number(process.env.PORT) || 3000;

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `[WEB APPLICATION] API listening on port ${port}`
    );
  });

  return app;
}

module.exports = {
  startWebApplicationServer,
};
