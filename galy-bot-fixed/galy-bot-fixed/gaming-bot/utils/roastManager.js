// Roast lines + a simple per-user cooldown tracker for !roast.

const ROASTS = [
  'You have a face that would make onions cry.',
  'I look at you and think, "Two billion years of evolution, for this?"',
  'I am jealous of all the people who have never met you.',
  'I consider you my Sun. Now, please get 93 million miles away from here.',
  'If laughter is the best medicine, your face must be curing the world.',
  'You\u2019re not simply a drama queen/king. You\u2019re the whole royal family.',
  'I was thinking about you today. It reminded me to take out the trash.',
  'You are the human version of cramps.',
  'You haven\u2019t changed since the last time I saw you. You really should.',
  'If ignorance is bliss, you must be the happiest person on Earth.',
  'Oh, sorry, did the middle of my sentence interrupt the beginning of yours?',
  'Don\u2019t worry, the first 40 years of childhood are always the hardest.',
  'I love what you\u2019ve done with your hair. How\u2019d you get it to come out of your nose like that?',
  'I never forget a person\u2019s face, but I\u2019ll be happy to make an exception in your situation.',
  'Mirrors can\u2019t talk. Lucky for you, they can\u2019t laugh either.',
  'When you were born, the doctors probably threw you out of the window, but the window threw you back.',
  'Were you born this dumb, or did you have to take lessons?',
  'Have a nice day\u2026elsewhere.',
  'If you were any more inbred, you\u2019d be a sandwich.',
  'Every time I have a stick in my hand, you start to look more and more like a pi\u00f1ata.',
  'Everyone is allowed to act stupid once in a while, but you\u2019re really abusing the privilege.',
  'Let\u2019s play horse. I\u2019ll be the front, and you can be yourself.',
  'I didn\u2019t mean to offend you, but I\u2019ll take the additional perk.',
  'You\u2019re not pretty enough to have such an ugly personality.',
  'If you\u2019re going to be two-faced, at least make one of them pretty.',
];

const COOLDOWN_MS = 10 * 1000;
const cooldowns = new Map(); // userId -> timestamp when they can use !roast again

function getRandomRoast() {
  return ROASTS[Math.floor(Math.random() * ROASTS.length)];
}

function isOnCooldown(userId) {
  const expiresAt = cooldowns.get(userId);
  return !!expiresAt && Date.now() < expiresAt;
}

function getRemainingSeconds(userId) {
  const expiresAt = cooldowns.get(userId);
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

function startCooldown(userId) {
  cooldowns.set(userId, Date.now() + COOLDOWN_MS);
}

module.exports = {
  getRandomRoast,
  isOnCooldown,
  getRemainingSeconds,
  startCooldown,
};
