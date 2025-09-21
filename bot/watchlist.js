// * Watchlist manager: persistence + scheduled execution of !matches and !scrims for users
//   Persists to bot/watchlist.json so restarts keep state.
//   Each entry: { username: string, addedAt: ISOString, lastRun: ISOString|null }

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WATCHLIST_INTERVAL_MINUTES, WATCHLIST_CHANNEL_NAME, VERBOSE } from './config.js';
import { handleMatchesCommand } from './commands/matches.js';
import { handleScrimsCommand } from './commands/scrims.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, 'watchlist.json');

let watchlist = [];
let intervalHandle = null;
let discordClient = null;

function loadWatchlist() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(DATA_PATH, '[]', 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch (e) {
    console.error('⚠️ Failed to load watchlist, starting empty:', e.message);
  }
  return [];
}

function saveWatchlist() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(watchlist, null, 2));
  } catch (e) {
    console.error('⚠️ Failed to save watchlist:', e.message);
  }
}

export function initWatchlist(client) {
  discordClient = client;
  watchlist = loadWatchlist();
  if (VERBOSE) console.log(`📝 Loaded watchlist (${watchlist.length} users)`);
  startScheduler();
}

export function addToWatchlist(username) {
  username = username.trim();
  if (!username) return { added: false, reason: 'Empty username' };
  if (watchlist.find(w => w.username.toLowerCase() === username.toLowerCase())) {
    return { added: false, reason: 'User already on watchlist' };
  }
  const entry = { username, addedAt: new Date().toISOString(), lastRun: null };
  watchlist.push(entry);
  saveWatchlist();
  if (VERBOSE) console.log(`➕ Added ${username} to watchlist`);
  return { added: true, entry };
}

export function removeFromWatchlist(username) {
  const before = watchlist.length;
  watchlist = watchlist.filter(w => w.username.toLowerCase() !== username.toLowerCase());
  if (watchlist.length !== before) {
    saveWatchlist();
    if (VERBOSE) console.log(`➖ Removed ${username} from watchlist`);
    return { removed: true };
  }
  return { removed: false, reason: 'User not found' };
}

export function listWatchlist() {
  return watchlist.map(w => ({ ...w }));
}

function startScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  const ms = Math.max(1, WATCHLIST_INTERVAL_MINUTES) * 60 * 1000;
  intervalHandle = setInterval(runDueEntries, ms);
  if (VERBOSE) console.log(`⏱️ Watchlist scheduler started (interval ${WATCHLIST_INTERVAL_MINUTES}m)`);
  // Kick off immediately once at startup
  setTimeout(runDueEntries, 5_000);
}

async function runDueEntries() {
  if (!discordClient) return;
  if (!watchlist.length) return; // nothing to do
  const channel = findWatchlistChannel();
  if (!channel) {
    if (VERBOSE) console.log('⚠️ Watchlist channel not found, skipping run');
    return;
  }
  const now = Date.now();
  const thresholdMs = Math.max(1, WATCHLIST_INTERVAL_MINUTES) * 60 * 1000;
  for (const entry of watchlist) {
    const last = entry.lastRun ? Date.parse(entry.lastRun) : 0;
    if (now - last < thresholdMs) continue; // not due yet
    try {
      await runReportsForUser(channel, entry.username);
      entry.lastRun = new Date().toISOString();
      if (VERBOSE) console.log(`📤 Posted watchlist reports for ${entry.username}`);
      // Persist after each success to keep lastRun up to date
      saveWatchlist();
    } catch (e) {
      console.error(`❌ Failed watchlist run for ${entry.username}:`, e);
    }
  }
}

function findWatchlistChannel() {
  if (!discordClient) return null;
  // Prefer by name; could be extended to accept ID env var later
  const guilds = discordClient.guilds?.cache;
  for (const guild of guilds.values()) {
    const channel = guild.channels.cache.find(ch => ch.name === WATCHLIST_CHANNEL_NAME && ch.isTextBased());
    if (channel) return channel;
  }
  return null;
}

// Create a pseudo message object to pass into existing command handlers.
function buildPseudoMessage(channel, username) {
  return {
    author: { bot: true, id: 'watchlist-system' },
    channel,
    content: '',
    reply: (content) => channel.send(content),
  };
}

async function runReportsForUser(channel, username) {
  // First matches, then scrims. We construct args arrays to mimic user input.
  const pseudoMatchesMsg = buildPseudoMessage(channel, username);
  await handleMatchesCommand(pseudoMatchesMsg, ['!matches', username]);

  const pseudoScrimsMsg = buildPseudoMessage(channel, username);
  await handleScrimsCommand(pseudoScrimsMsg, ['!scrims', username]);
}

// Optional manual trigger (could be used for !watchlist command later)
export async function manualRunAll(message) {
  await runDueEntries();
  return message.reply('✅ Watchlist run triggered manually.');
}
