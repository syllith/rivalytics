import { addToWatchlist, removeFromWatchlist, listWatchlist } from '../watchlist.js';
import { VERBOSE, WATCHLIST_INTERVAL_MINUTES, WATCHLIST_CHANNEL_NAME } from '../config.js';

// * Handle !watch <username>
export async function handleWatchCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!watch <username>`');
  const username = args[1];
  const { added, reason } = addToWatchlist(username);
  if (!added) return message.reply(`❌ Could not add **${username}**: ${reason}.`);

  // Derive a human-readable interval description
  const mins = WATCHLIST_INTERVAL_MINUTES;
  let human;
  if (mins % 60 === 0) {
    const hours = mins / 60;
    human = hours === 1 ? 'every 1 hour' : `every ${hours} hours`;
  } else if (mins > 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    human = `every ${hours}h ${rem}m`;
  } else {
    human = mins === 1 ? 'every 1 minute' : `every ${mins} minutes`;
  }
  // Resolve a proper channel mention if possible (so it links/clicks). Fallback to plaintext if not found.
  let channelRef = `#${WATCHLIST_CHANNEL_NAME}`;
  try {
    if (message.guild) {
      const channel = message.guild.channels.cache.find(ch => ch.name === WATCHLIST_CHANNEL_NAME && ch.isTextBased());
      if (channel) channelRef = `<#${channel.id}>`;
    }
  } catch (e) {
    // Silently ignore resolution failures; keep plaintext fallback.
  }
  return message.reply(`👁️ Added **${username}** to the watchlist. Updates ${human} in ${channelRef}.`);
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
