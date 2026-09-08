const { startTikTokPolling } = require('../utils/tiktokLive');
const { rearmActiveGiveaways } = require('../utils/giveawayManager');
const { startDailyGiveawayLoop } = require('../utils/dailyGiveaway');
const { startDailyQuoteLoop } = require('../utils/dailyQuote');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    startTikTokPolling(client);

    if (typeof rearmActiveGiveaways === 'function') {
      rearmActiveGiveaways(client);
    } else {
      console.error(
        '[READY] rearmActiveGiveaways is not a function — check utils/giveawayManager.js exports. Skipping giveaway rearm so the bot can still start.'
      );
    }

    startDailyGiveawayLoop(client);
    startDailyQuoteLoop(client);

    const statuses = [
      { name: 'looking for staff so apply', type: 2 },
      { dynamic: 'memberCount', type: 3 },
    ];

    function buildStatusName(status) {
      if (status.dynamic === 'memberCount') {
        const memberCount = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
        return `${memberCount.toLocaleString()} members`;
      }
      return status.name;
    }

    let index = 0;
    client.user.setActivity(buildStatusName(statuses[index]), { type: statuses[index].type });

    setInterval(() => {
      index = (index + 1) % statuses.length;
      client.user.setActivity(buildStatusName(statuses[index]), { type: statuses[index].type });
    }, 10 * 1000);
  },
};
