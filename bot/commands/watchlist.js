import { addToWatchlist, removeFromWatchlist, listWatchlist } from '../watchlist.js';
import { VERBOSE, WATCHLIST_INTERVAL_MINUTES, WATCHLIST_CHANNEL_NAME } from '../config.js';

// * Helper to format minutes into human-readable string
function formatInterval(mins) {
  if (mins % 60 === 0) {
    const hours = mins / 60;
    return hours === 1 ? 'every 1 hour' : `every ${hours} hours`;
  } else if (mins > 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `every ${hours}h ${rem}m`;
  } else {
    return mins === 1 ? 'every 1 minute' : `every ${mins} minutes`;
  }
}

// * Handle !watch <username> [minutes]
export async function handleWatchCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!watch <username> [minutes]`\nExample: `!watch player123` (default 30 min) or `!watch player123 60` (60 min)');
  
  const username = args[1];
  let customMinutes = null;
  
  // Check if a custom interval was specified
  if (args.length >= 3) {
    const parsedMinutes = parseInt(args[2], 10);
    if (!isNaN(parsedMinutes) && parsedMinutes > 0) {
      customMinutes = parsedMinutes;
    } else {
      return message.reply('❌ Invalid interval. Please provide a positive number of minutes. Usage: `!watch <username> [minutes]`');
    }
  }
  
  const { added, reason, entry } = addToWatchlist(username, customMinutes);
  if (!added) return message.reply(`❌ Could not add **${username}**: ${reason}.`);

  // Derive a human-readable interval description
  const mins = entry?.intervalMinutes || WATCHLIST_INTERVAL_MINUTES;
  const human = formatInterval(mins);
  
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
  if (!list.length) return message.reply('ℹ️ Watchlist is currently empty. Add a user with `!watch <username> [minutes]`.');
  const lines = list.map(w => {
    const last = w.lastRun ? new Date(w.lastRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'never';
    const interval = w.intervalMinutes || WATCHLIST_INTERVAL_MINUTES;
    return `• **${w.username}** (${formatInterval(interval)}, last run: ${last})`;
  });
  return message.reply('👁️ Current watchlist:\n' + lines.join('\n'));
}

// ! Removed manual !watchrun command per requirement (manual trigger deprecated)
