import { addToWatchlist, removeFromWatchlist, listWatchlist, clearWatchlist } from '../watchlist.js';
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

// * Handle !watch <username1> [username2] ... [usernameN] [minutes]
// Supports adding multiple users at once. The last argument is treated as interval (minutes)
// only if it's a valid positive number. Otherwise, all arguments are treated as usernames.
export async function handleWatchCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide at least one username. Usage: `!watch <username1> [username2] ... [minutes]`\nExamples:\n• `!watch player123` (default 30 min)\n• `!watch player123 60` (60 min interval)\n• `!watch player1 player2 player3` (multiple users, default interval)\n• `!watch player1 player2 player3 60` (multiple users, 60 min interval)');
  
  // Get the guild ID from the message to associate this watchlist entry with this server
  const guildId = message.guild?.id || null;
  if (!guildId) {
    return message.reply('❌ This command can only be used in a server, not in DMs.');
  }
  
  // Parse arguments: all args after the command, check if last one is a number (interval)
  const inputArgs = args.slice(1); // Remove the command itself (!watch)
  let customMinutes = null;
  let usernames = [];
  
  // Check if the last argument is a valid positive number (interval in minutes)
  const lastArg = inputArgs[inputArgs.length - 1];
  const parsedMinutes = parseInt(lastArg, 10);
  
  if (inputArgs.length > 1 && !isNaN(parsedMinutes) && parsedMinutes > 0 && String(parsedMinutes) === lastArg) {
    // Last argument is a valid interval
    customMinutes = parsedMinutes;
    usernames = inputArgs.slice(0, -1); // All except the last (which is the interval)
  } else {
    // No interval specified, all arguments are usernames
    usernames = inputArgs;
  }
  
  if (usernames.length === 0) {
    return message.reply('❌ Please provide at least one username. Usage: `!watch <username1> [username2] ... [minutes]`');
  }
  
  // Add each user to the watchlist and collect results
  const results = {
    added: [],
    failed: []
  };
  
  for (const username of usernames) {
    const { added, reason, entry } = addToWatchlist(username, customMinutes, guildId);
    if (added) {
      results.added.push({ username, entry });
    } else {
      results.failed.push({ username, reason });
    }
  }
  
  // Build response message
  const mins = customMinutes || WATCHLIST_INTERVAL_MINUTES;
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
  
  let response = '';
  
  if (results.added.length > 0) {
    const addedNames = results.added.map(r => `**${r.username}**`).join(', ');
    if (results.added.length === 1) {
      response += `👁️ Added ${addedNames} to the watchlist. Updates ${human} in ${channelRef}.`;
    } else {
      response += `👁️ Added ${results.added.length} users to the watchlist: ${addedNames}. Updates ${human} in ${channelRef}.`;
    }
  }
  
  if (results.failed.length > 0) {
    const failedLines = results.failed.map(r => `• **${r.username}**: ${r.reason}`).join('\n');
    if (response) response += '\n\n';
    response += `❌ Could not add ${results.failed.length} user${results.failed.length > 1 ? 's' : ''}:\n${failedLines}`;
  }
  
  return message.reply(response);
}

// * Handle !unwatch <username>
export async function handleUnwatchCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!unwatch <username>`');
  const username = args[1];
  const guildId = message.guild?.id || null;
  if (!guildId) {
    return message.reply('❌ This command can only be used in a server, not in DMs.');
  }
  const { removed, reason } = removeFromWatchlist(username, guildId);
  if (!removed) return message.reply(`❌ Could not remove **${username}**: ${reason}.`);
  return message.reply(`✅ Removed **${username}** from the watchlist.`);
}

// * Handle !watchlist (list current entries)
export async function handleWatchlistCommand(message) {
  const guildId = message.guild?.id || null;
  const list = listWatchlist(guildId);
  if (!list.length) return message.reply('ℹ️ Watchlist is currently empty for this server. Add a user with `!watch <username> [minutes]`.');
  const lines = list.map(w => {
    const last = w.lastRun ? new Date(w.lastRun).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'never';
    const interval = w.intervalMinutes || WATCHLIST_INTERVAL_MINUTES;
    return `• **${w.username}** (${formatInterval(interval)}, last run: ${last})`;
  });
  return message.reply('👁️ Current watchlist for this server:\n' + lines.join('\n'));
}

// * Handle !clearwatchlist (clear all entries for this server)
export async function handleClearWatchlistCommand(message) {
  const guildId = message.guild?.id || null;
  if (!guildId) {
    return message.reply('❌ This command can only be used in a server, not in DMs.');
  }
  const { cleared, reason, count } = clearWatchlist(guildId);
  if (!cleared) return message.reply(`❌ ${reason}.`);
  return message.reply(`🗑️ Cleared **${count}** user${count !== 1 ? 's' : ''} from the watchlist.`);
}

// ! Removed manual !watchrun command per requirement (manual trigger deprecated)
