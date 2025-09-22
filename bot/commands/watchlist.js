import { addToWatchlist, removeFromWatchlist, listWatchlist } from '../watchlist.js';
import { VERBOSE } from '../config.js';

// * Handle !watch <username>
export async function handleWatchCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!watch <username>`');
  const username = args[1];
  const { added, reason } = addToWatchlist(username);
  if (!added) return message.reply(`❌ Could not add **${username}**: ${reason}.`);
  return message.reply(`👁️ Added **${username}** to the watchlist. Updates every configured interval.`);
}

// * Handle !unwatch <username>
export async function handleUnwatchCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!unwatch <username>`');
  const username = args[1];
  const { removed, reason } = removeFromWatchlist(username);
  if (!removed) return message.reply(`❌ Could not remove **${username}**: ${reason}.`);
  return message.reply(`✅ Removed **${username}** from the watchlist.`);
}

// * Handle !watchlist (list current entries)
export async function handleWatchlistCommand(message) {
  const list = listWatchlist();
  if (!list.length) return message.reply('ℹ️ Watchlist is currently empty. Add a user with `!watch <username>`.');
  const lines = list.map(w => {
    const last = w.lastRun ? new Date(w.lastRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'never';
    return `• **${w.username}** (last run: ${last})`;
  });
  return message.reply('👁️ Current watchlist:\n' + lines.join('\n'));
}

// ! Removed manual !watchrun command per requirement (manual trigger deprecated)
