// * Central export hub for all command handlers & command->handler name mapping
export { handleHeroesCommand } from './heroes.js';
export { handleMatchesCommand } from './matches.js';
export { handleScrimsCommand } from './scrims.js';
export { handleScrimHeroesCommand } from './scrimHeroes.js';
export { handleTournCommand } from './tourn.js';
export { handleEncountersCommand } from './encounters.js';
export { handleHelpCommand } from './help.js';
export { handleGenExampleCommand } from './genexample.js';

// Command mapping including aliases
export const commandMap = {
  '!heroes': 'handleHeroesCommand',
  '!hero': 'handleHeroesCommand',
  '!matches': 'handleMatchesCommand',
  '!scrims': 'handleScrimsCommand',
  '!scrimheroes': 'handleScrimHeroesCommand',
  '!scrimhero': 'handleScrimHeroesCommand',
  '!tourn': 'handleTournCommand',
  '!tournament': 'handleTournCommand',
  '!encounters': 'handleEncountersCommand',
  '!encounter': 'handleEncountersCommand',
  '!help': 'handleHelpCommand',
  '!info': 'handleHelpCommand',
  '!genexample': 'handleGenExampleCommand'
};
