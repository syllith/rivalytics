// Unified command registry & dynamic help text
import { CURRENT_SEASON } from './config.js';

// Re-export individual command handlers from their files
export { handleHeroesCommand } from './commands/heroes.js';
export { handleMatchesCommand } from './commands/matches.js';
export { handleScrimsCommand } from './commands/scrims.js';
export { handleScrimHeroesCommand } from './commands/scrimHeroes.js';
export { handleTournCommand } from './commands/tourn.js';
export { handleEncountersCommand } from './commands/encounters.js';
export { handleHelpCommand } from './commands/help.js';
export { handleGenExampleCommand } from './commands/genexample.js';

// Command metadata (single source of truth for help + mapping)
// Each entry: { triggers: ['!cmd','!alias'], handler: 'handleXCommand', title, usage, descriptionLines[] }
export const commandMeta = [
  {
    triggers: ['!heroes', '!hero'],
    handler: 'handleHeroesCommand',
    title: '🦸 Hero Stats',
    usage: '!heroes <user>',
    descriptionLines: [
      `Returns Season ${CURRENT_SEASON} hero performance aggregated per hero. Sorted by time played.`,
      'Includes: Time Played (hours), Matches Played/Won, Win Rate, Kills, Deaths, Assists, KDA, Total Hero Damage & per‑match avg, Total Hero Heal & per‑match avg, Damage Taken / Match, Survival Kills / Match, Role (Vanguard/Duelist/Strategist). Shows top 10 heroes.'
    ]
  },
  {
    triggers: ['!matches'],
    handler: 'handleMatchesCommand',
    title: '🏆 Ranked & Recent Matches',
    usage: '!matches <user>',
    descriptionLines: [
      `Combines Season ${CURRENT_SEASON} ranked ladder history (newest first) plus last 10 competitive matches.`,
      'Ranked: current rank & score + per-entry score delta (season-filtered by timestamp).',
      'Competitive: Result, Map, Mode, Kills/Deaths (K/D), Damage (short), Duration (m:s). Includes only modes containing ranked/competitive/tournament; excludes unknown/custom.'
    ]
  },
  {
    triggers: ['!scrims'],
    handler: 'handleScrimsCommand',
    title: '🎮 Scrims',
    usage: '!scrims <user>',
    descriptionLines: [
      'Filters Season 8 match list to entries whose modeName is exactly "Unknown" (interpreted as custom/scrim games).',
      'For each listed scrim: Result (Win/Loss/—), Map, Date & Time, Match Duration, Kills, Deaths, K/D, Total Hero Damage, Up to first 3 Heroes Played, Replay ID (if present). Also includes overall summary (wins, losses, win rate, avg damage, avg K/D).'
    ]
  },
  {
    triggers: ['!scrimheroes', '!scrimhero'],
    handler: 'handleScrimHeroesCommand',
    title: '🧪 Scrim Heroes',
    usage: '!scrimheroes <user>',
    descriptionLines: [
      'Shows Season 8 TOTAL hero stats but only for heroes that appear in your scrim (Unknown mode) matches.',
      'Provides same hero metrics as !heroes, restricted to this subset. Note: values are season totals, not isolated to scrims (API limitation).'
    ]
  },
  {
    triggers: ['!tourn', '!tournament'],
    handler: 'handleTournCommand',
    title: '🏟️ Tournament Matches',
    usage: '!tourn <user>',
    descriptionLines: [
      'Retrieves recent Season 8 matches where modeName is "Tournament".',
      'For each match: Result, Map, Date & Time, Duration, Kills/Deaths + K/D, Total Hero Damage, Up to first 3 Heroes Played, Replay ID. Includes summary aggregates (wins, losses, win rate, average damage, average K/D).'
    ]
  },
  {
    triggers: ['!encounters', '!encounter'],
    handler: 'handleEncountersCommand',
    title: '🤝 Encounters',
    usage: '!encounters <user> [count]',
    descriptionLines: [
      `Uses official aggregated encounters endpoint (Season ${CURRENT_SEASON} scoped) to list recent teammates and enemies.`,
      'Metrics per player: Together Matches, Together Win%, Together K/D, Last Encounter Date, Season Rank Score & Tier, Season Win%, Season K/D, Season Matches. Allies listed before enemies. Optional count (3-25, default 10).'
    ]
  },
  {
    triggers: ['!genexample'],
    handler: 'handleGenExampleCommand',
    title: '🧪 Generate JSON Examples',
    usage: '!genexample <user>',
    descriptionLines: [
      'Fetches & stores raw JSON payloads for all command endpoints into bot/examples/<command> for reference & development.',
      'Creates timestamped .json files per endpoint; deduplicates identical URLs across commands.'
    ]
  },
  {
    triggers: ['!help', '!info'],
    handler: 'handleHelpCommand',
    title: 'ℹ️ Help',
    usage: '!help',
    descriptionLines: [
      'Displays this help listing.'
    ]
  }
];

// Build commandMap (trigger -> handlerName)
export const commandMap = commandMeta.reduce((map, meta) => {
  meta.triggers.forEach(t => { map[t] = meta.handler; });
  return map;
}, {});

export function getHelpText(){
  const lines = [];
  lines.push('Rivalytics Bot Commands');
  lines.push('Usage: <command> <username>. Below describes the data each command retrieves.');
  lines.push('');
  for (const meta of commandMeta){
    if (meta.handler === 'handleHelpCommand') continue; // list help last
    lines.push(`${meta.title} \`${meta.usage}\`${meta.triggers.length>1? ` (aliases: ${meta.triggers.slice(1).join(', ')})`: ''}`);
    meta.descriptionLines.forEach(l => lines.push('  ' + l));
    lines.push('');
  }
  // Append help entry last
  const helpMeta = commandMeta.find(m => m.handler === 'handleHelpCommand');
  if (helpMeta){
    lines.push(`${helpMeta.title} \`${helpMeta.usage}\`${helpMeta.triggers.length>1? ` (aliases: ${helpMeta.triggers.slice(1).join(', ')})`: ''}`);
    helpMeta.descriptionLines.forEach(l => lines.push('  ' + l));
    lines.push('');
  }
  return lines.join('\n');
}
