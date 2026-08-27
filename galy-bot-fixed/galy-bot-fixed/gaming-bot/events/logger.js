const {
  logMessageEdit,
  logMessageDelete,
  logMemberJoin,
  logMemberLeave,
  logNicknameChange,
  logTimeout,
  logBan,
  logUnban,
  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,
  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,
} = require('../utils/logger');


module.exports = {
  name: 'logger',

  register(client) {

    client.on(
      'messageUpdate',
      async (oldMessage, newMessage) => {
        await logMessageEdit(
          oldMessage,
          newMessage
        );
      }
    );


    client.on(
      'messageDelete',
      async (message) => {
        await logMessageDelete(
          message
        );
      }
    );


    client.on(
      'guildMemberAdd',
      async (member) => {
        await logMemberJoin(
          member
        );
      }
    );


    client.on(
      'guildMemberRemove',
      async (member) => {
        await logMemberLeave(
          member
        );
      }
    );


    client.on(
      'guildMemberUpdate',
      async (oldMember, newMember) => {

        await logNicknameChange(
          oldMember,
          newMember
        );

        await logTimeout(
          oldMember,
          newMember
        );
      }
    );


    client.on(
      'guildBanAdd',
      async (ban) => {
        await logBan(
          ban
        );
      }
    );


    client.on(
      'guildBanRemove',
      async (ban) => {
        await logUnban(
          ban
        );
      }
    );


    client.on(
      'roleCreate',
      async (role) => {
        await logRoleCreate(
          role
        );
      }
    );


    client.on(
      'roleDelete',
      async (role) => {
        await logRoleDelete(
          role
        );
      }
    );


    client.on(
      'roleUpdate',
      async (oldRole, newRole) => {
        await logRoleUpdate(
          oldRole,
          newRole
        );
      }
    );


    client.on(
      'channelCreate',
      async (channel) => {
        await logChannelCreate(
          channel
        );
      }
    );


    client.on(
      'channelDelete',
      async (channel) => {
        await logChannelDelete(
          channel
        );
      }
    );


    client.on(
      'channelUpdate',
      async (oldChannel, newChannel) => {
        await logChannelUpdate(
          oldChannel,
          newChannel
        );
      }
    );

  },
};
