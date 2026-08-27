require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  Collection,
  Partials,
} = require('discord.js');


/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],

  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
});


/* =========================================================
   SLASH COMMANDS
========================================================= */

client.commands = new Collection();

const commandsPath =
  path.join(
    __dirname,
    'commands'
  );

for (
  const file of fs
    .readdirSync(commandsPath)
    .filter(
      (f) =>
        f.endsWith('.js')
    )
) {

  try {

    const command =
      require(
        path.join(
          commandsPath,
          file
        )
      );

    if (
      command?.data?.name &&
      typeof command.execute === 'function'
    ) {

      client.commands.set(
        command.data.name,
        command
      );

      console.log(
        `[COMMAND] Loaded /${command.data.name}`
      );

    } else {

      console.warn(
        `[COMMAND] Skipping invalid command file: ${file}`
      );
    }

  } catch (err) {

    console.error(
      `[COMMAND] Failed to load ${file}:`,
      err
    );
  }
}


/* =========================================================
   EVENTS
========================================================= */

const eventsPath =
  path.join(
    __dirname,
    'events'
  );

for (
  const file of fs
    .readdirSync(eventsPath)
    .filter(
      (f) =>
        f.endsWith('.js')
    )
) {

  try {

    const event =
      require(
        path.join(
          eventsPath,
          file
        )
      );


    /*
      Normal Discord events.

      Example:

      {
        name: 'messageCreate',
        execute(message) {}
      }
    */

    if (
      event.once
    ) {

      client.once(
        event.name,
        (...args) =>
          event.execute(
            ...args,
            client
          )
      );

    } else if (
      typeof event.execute === 'function'
    ) {

      client.on(
        event.name,
        (...args) =>
          event.execute(
            ...args,
            client
          )
      );
    }


    /*
      Special event modules can expose:

      register(client)

      This is used by the cross-server logger.
    */

    if (
      typeof event.register === 'function'
    ) {

      event.register(
        client
      );

      console.log(
        `[EVENT] Registered custom listeners from ${file}`
      );
    }


    if (
      event.name
    ) {

      console.log(
        `[EVENT] Loaded ${event.name} (${file})`
      );
    }

  } catch (err) {

    console.error(
      `[EVENT] Failed to load ${file}:`,
      err
    );
  }
}


/* =========================================================
   TOKEN CHECK
========================================================= */

if (
  !process.env.DISCORD_TOKEN
) {

  console.error(
    '❌ Missing DISCORD_TOKEN in .env — copy .env.example to .env and fill it in.'
  );

  process.exit(1);
}


/* =========================================================
   LOGIN
========================================================= */

client.login(
  process.env.DISCORD_TOKEN
);
