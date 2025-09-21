// * Unified command registry & dynamic help text builder
import { CURRENT_SEASON, PUBLIC_SEASON } from './config.js';

// * Re-export individual command handlers (keeps bot.js lean)
export { handleHeroesCommand } from './commands/heroes.js';
export { handleMatchesCommand } from './commands/matches.js';
export { handleScrimsCommand } from './commands/scrims.js';
export { handleScrimHeroesCommand } from './commands/scrimHeroes.js';
export { handleTournCommand } from './commands/tourn.js';
export { handleEncountersCommand } from './commands/encounters.js';
export { handleHelpCommand } from './commands/help.js';
export { handleGenExampleCommand } from './commands/genexample.js';
export { handleWatchCommand, handleUnwatchCommand, handleWatchlistCommand, handleWatchRunCommand } from './commands/watchlist.js';

// * Command metadata (single source of truth for help + mapping)
//   Each entry: { triggers: ['!cmd','!alias'], handler, title, usage, descriptionLines[] }
export const commandMeta = [
  {
    triggers: ['!heroes', '!hero'],
    handler: 'handleHeroesCommand',
    title: '🦸 Hero Stats',
    usage: '!heroes <user>',
    descriptionLines: [
  `Season ${PUBLIC_SEASON} hero stats for a user. Shows top 10 heroes by time played.`,
      'Includes matches, win rate, KDA, damage, and role.'
    ]
  },
  {
    triggers: ['!matches'],
    handler: 'handleMatchesCommand',
    title: '🏆 Ranked & Recent Matches',
    usage: '!matches <user>',
    descriptionLines: [
  `Shows Season ${PUBLIC_SEASON} ranked history and last 10 competitive matches.`,
      'Includes rank, score, result, map, K/D, and damage.'
    ]
  },
  {
    triggers: ['!scrims'],
    handler: 'handleScrimsCommand',
    title: '🎮 Scrims',
    usage: '!scrims <user>',
    descriptionLines: [
  `Lists Season ${PUBLIC_SEASON} custom/scrim games for a user.`,
      'Shows result, map, K/D, damage, and summary stats.'
    ]
  },
  {
    triggers: ['!scrimheroes', '!scrimhero'],
    handler: 'handleScrimHeroesCommand',
    title: '🧪 Scrim Heroes',
    usage: '!scrimheroes <user>',
    descriptionLines: [
  `Season ${PUBLIC_SEASON} hero stats for heroes played in scrims.`,
      'Same metrics as !heroes, but only for scrim heroes.'
    ]
  },
  {
    triggers: ['!tourn', '!tournament'],
    handler: 'handleTournCommand',
    title: '🏟️ Tournament Matches',
    usage: '!tourn <user>',
    descriptionLines: [
  `Shows recent Season ${PUBLIC_SEASON} tournament matches for a user.`,
      'Includes result, map, K/D, damage, and summary.'
    ]
  },
  {
    triggers: ['!encounters', '!encounter'],
    handler: 'handleEncountersCommand',
    title: '🤝 Encounters',
    usage: '!encounters <user> [count]',
    descriptionLines: [
  `Lists recent teammates and enemies for Season ${PUBLIC_SEASON}.`,
      'Shows matches, win%, K/D, rank, and last encounter.'
    ]
  },
  {
    triggers: ['!genexample'],
    handler: 'handleGenExampleCommand',
    title: '🧪 Generate JSON Examples',
    usage: '!genexample <user>',
    descriptionLines: [
      'Fetches and saves raw JSON for all endpoints.',
      'Stores files in bot/examples/<command>.'
    ]
  },
  {
    triggers: ['!help', '!info'],
    handler: 'handleHelpCommand',
    title: 'ℹ️ Help',
    usage: '!help',
    descriptionLines: [
      'Shows this help listing.'
    ]
  }
  ,
  {
    triggers: ['!watch'],
    handler: 'handleWatchCommand',
    title: '👁️ Add to Watchlist',
    usage: '!watch <user>',
    descriptionLines: [
      'Adds a user to the automated watchlist (matches + scrims every interval).'
    ]
  },
  {
    triggers: ['!unwatch'],
    handler: 'handleUnwatchCommand',
    title: '🚫 Remove from Watchlist',
    usage: '!unwatch <user>',
    descriptionLines: [
      'Removes a user from the watchlist.'
    ]
  },
  {
    triggers: ['!watchlist'],
    handler: 'handleWatchlistCommand',
    title: '📋 List Watchlist',
    usage: '!watchlist',
    descriptionLines: [
      'Shows currently watched users and last run times.'
    ]
  },
  {
    triggers: ['!watchrun'],
    handler: 'handleWatchRunCommand',
    title: '⚡ Manual Watchlist Run',
    usage: '!watchrun',
    descriptionLines: [
      'Manually triggers an immediate run for due watchlist entries (admin/debug).'
    ]
  }
];

// * Build commandMap (trigger -> handlerName) for quick lookup
export const commandMap = commandMeta.reduce((map, meta) => {
  meta.triggers.forEach(t => { map[t] = meta.handler; });
  return map;
}, {});

// * Produce formatted multi-line help text for display in Discord
export function getHelpText() {
  const lines = [];
  lines.push('Rivalytics Bot Commands');
  lines.push('Usage: <command> <username>. Below describes the data each command retrieves.');
  lines.push('');

  for (const meta of commandMeta) {
    if (meta.handler === 'handleHelpCommand') continue; // list help section last
    lines.push(`${meta.title} \`${meta.usage}\`${meta.triggers.length > 1 ? ` (aliases: ${meta.triggers.slice(1).join(', ')})` : ''}`);
    meta.descriptionLines.forEach(l => lines.push('  ' + l));
    lines.push('');
  }

  // Append help entry last to avoid cluttering earlier sections
  const helpMeta = commandMeta.find(m => m.handler === 'handleHelpCommand');
  if (helpMeta) {
    lines.push(`${helpMeta.title} \`${helpMeta.usage}\`${helpMeta.triggers.length > 1 ? ` (aliases: ${helpMeta.triggers.slice(1).join(', ')})` : ''}`);
    helpMeta.descriptionLines.forEach(l => lines.push('  ' + l));
    lines.push('');
  }

  return lines.join('\n');
}
