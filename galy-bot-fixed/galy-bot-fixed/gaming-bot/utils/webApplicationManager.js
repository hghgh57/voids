const http = require('http');
const crypto = require('crypto');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');


/* =========================================================
   HELPERS
========================================================= */

function safeString(value, max = 1000) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}


function makeApiKeyValid(providedKey) {
  const expectedKey =
    process.env.APPLICATIONS_API_KEY;

  if (!expectedKey || !providedKey) {
    return false;
  }

  const provided =
    Buffer.from(String(providedKey));

  const expected =
    Buffer.from(String(expectedKey));

  if (provided.length !== expected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      provided,
      expected
    );
  } catch {
    return false;
  }
}


/* =========================================================
   READ REQUEST BODY
========================================================= */

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(
          new Error(
            'Request body is too large.'
          )
        );

        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(
          new Error(
            'Invalid JSON body.'
          )
        );
      }
    });

    req.on('error', reject);
  });
}


/* =========================================================
   SEND JSON
========================================================= */

function sendJson(
  res,
  statusCode,
  data
) {
  const output =
    JSON.stringify(data);

  res.writeHead(
    statusCode,
    {
      'Content-Type':
        'application/json',
      'Content-Length':
        Buffer.byteLength(output),
    }
  );

  res.end(output);
}


/* =========================================================
   APPLICATION EMBED
========================================================= */

function createApplicationEmbed(
  application
) {
  const embed =
    new EmbedBuilder()
      .setTitle(
        `${application.emoji || '📋'} ${
          application.label ||
          'Application'
        }`
      )
      .setColor(
        application.color ||
        '#5865F2'
      )
      .setDescription(
        `**New ${
          application.label ||
          'Application'
        }**\n\n` +
        `**Applicant:** <@${application.userId}>\n` +
        `**Discord ID:** \`${application.userId}\`\n\n` +
        `**Submitted:** <t:${Math.floor(
          Date.now() / 1000
        )}:F>`
      )
      .setTimestamp();

  const answers =
    Array.isArray(
      application.answers
    )
      ? application.answers
      : [];

  answers
    .slice(0, 25)
    .forEach(
      (answer, index) => {
        const question =
          safeString(
            answer?.question ||
              `Question ${
                index + 1
              }`,
            200
          );

        const response =
          safeString(
            answer?.answer ||
              'No answer provided.',
            1000
          );

        embed.addFields({
          name:
            `${index + 1}. ${question}`,
          value:
            response ||
            'No answer provided.',
          inline: false,
        });
      }
    );

  return embed;
}


/* =========================================================
   APPLICATION BUTTONS
========================================================= */

function createApplicationButtons(
  userId,
  applicationId
) {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          `app_accept_${userId}_${applicationId}`
        )
        .setLabel('Accept')
        .setEmoji('✅')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `app_deny_${userId}_${applicationId}`
        )
        .setLabel('Deny')
        .setEmoji('❌')
        .setStyle(
          ButtonStyle.Danger
        )

    );
}


/* =========================================================
   FIND APPLICATION REVIEW CHANNEL
========================================================= */

async function getReviewChannel(
  client,
  config
) {
  const channelId =
    config.websiteApplicationChannelId;

  if (!channelId) {
    return null;
  }

  const channel =
    await client.channels
      .fetch(channelId)
      .catch(() => null);

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return null;
  }

  return channel;
}


/* =========================================================
   HANDLE APPLICATION
========================================================= */

async function handleApplication(
  client,
  config,
  body
) {
  const userId =
    safeString(
      body.userId,
      30
    );

  const applicationId =
    safeString(
      body.applicationId,
      100
    );

  if (!userId) {
    return {
      status: 400,
      data: {
        success: false,
        error:
          'Discord user ID is required.',
      },
    };
  }

  if (!applicationId) {
    return {
      status: 400,
      data: {
        success: false,
        error:
          'Application ID is required.',
      },
    };
  }


  /* =======================================================
     CHECK DISCORD USER ID
  ======================================================= */

  if (
    !/^\d{15,25}$/.test(
      userId
    )
  ) {
    return {
      status: 400,
      data: {
        success: false,
        error:
          'Invalid Discord user ID.',
      },
    };
  }


  /* =======================================================
     FIND APPLICATION CONFIG
  ======================================================= */

  const applicationConfig =
    (
      config.applications ||
      []
    ).find(
      (application) =>
        String(application.id) ===
        String(applicationId)
    );

  if (!applicationConfig) {
    return {
      status: 404,
      data: {
        success: false,
        error:
          'Application type not found.',
      },
    };
  }


  /* =======================================================
     REVIEW CHANNEL
  ======================================================= */

  const channel =
    await getReviewChannel(
      client,
      config
    );

  if (!channel) {
    return {
      status: 500,
      data: {
        success: false,
        error:
          'Application review channel could not be found.',
      },
    };
  }


  /* =======================================================
     ANSWERS
  ======================================================= */

  const answers =
    Array.isArray(body.answers)
      ? body.answers
      : [];


  /* =======================================================
     EMBED
  ======================================================= */

  const embed =
    createApplicationEmbed({
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


  /* =======================================================
     SEND APPLICATION
  ======================================================= */

  const message =
    await channel.send({
      embeds: [
        embed,
      ],

      components: [
        createApplicationButtons(
          userId,
          applicationId
        ),
      ],
    });


  console.log(
    `[WEB APPLICATION] ${
      applicationConfig.label ||
      applicationId
    } submitted by ${userId}. Message: ${message.id}`
  );


  return {
    status: 200,
    data: {
      success: true,
      messageId:
        message.id,
    },
  };
}


/* =========================================================
   START WEB APPLICATION SERVER
========================================================= */

function startWebApplicationServer(
  client,
  config
) {
  const port =
    Number(
      process.env.PORT
    ) || 3000;


  const server =
    http.createServer(
      async (req, res) => {

        try {

          /* =================================================
             HEALTH CHECK
          ================================================= */

          if (
            req.method === 'GET' &&
            req.url === '/'
          ) {

            return sendJson(
              res,
              200,
              {
                online: true,

                bot:
                  client.user
                    ? client.user.tag
                    : 'starting',

                service:
                  'Void’s Cove application API',
              }
            );
          }


          /* =================================================
             APPLICATION SUBMISSION
          ================================================= */

          if (
            req.method === 'POST' &&
            req.url ===
              '/api/applications'
          ) {

            const apiKey =
              req.headers[
                'x-application-key'
              ];


            /* ===============================================
               API KEY CHECK
            =============================================== */

            if (
              !makeApiKeyValid(
                apiKey
              )
            ) {

              return sendJson(
                res,
                401,
                {
                  success: false,
                  error:
                    'Invalid API key.',
                }
              );
            }


            /* ===============================================
               REQUEST BODY
            =============================================== */

            let body;

            try {

              body =
                await readRequestBody(
                  req
                );

            } catch (error) {

              return sendJson(
                res,
                400,
                {
                  success: false,
                  error:
                    error.message ||
                    'Invalid request body.',
                }
              );
            }


            /* ===============================================
               PROCESS APPLICATION
            =============================================== */

            const result =
              await handleApplication(
                client,
                config,
                body
              );


            return sendJson(
              res,
              result.status,
              result.data
            );
          }


          /* =================================================
             NOT FOUND
          ================================================= */

          return sendJson(
            res,
            404,
            {
              success: false,
              error:
                'Endpoint not found.',
            }
          );

        } catch (error) {

          console.error(
            '[WEB APPLICATION] Failed to handle request:',
            error
          );


          if (!res.headersSent) {

            return sendJson(
              res,
              500,
              {
                success: false,
                error:
                  'Failed to submit application.',
              }
            );
          }

          res.end();
        }
      }
    );


  /* =========================================================
     SERVER ERROR
  ========================================================= */

  server.on(
    'error',
    (error) => {

      console.error(
        '[WEB APPLICATION] Server error:',
        error
      );

    }
  );


  /* =========================================================
     LISTEN
  ========================================================= */

  server.listen(
    port,
    '0.0.0.0',
    () => {

      console.log(
        `[WEB APPLICATION] API listening on port ${port}`
      );

    }
  );


  return server;
}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  startWebApplicationServer,
};
