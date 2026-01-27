// * Watchlist manager: persistence + scheduled execution of !matches and !scrims for users
//   Persists to bot/watchlist.json so restarts keep state.
//   Each entry: { username: string, addedAt: ISOString, lastRun: ISOString|null, intervalMinutes: number|null }

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

export function addToWatchlist(username, intervalMinutes = null, guildId = null) {
    username = username.trim();
    if (!username) return { added: false, reason: 'Empty username' };
    // Check if this user is already on the watchlist for this specific guild
    if (watchlist.find(w => w.username.toLowerCase() === username.toLowerCase() && w.guildId === guildId)) {
        return { added: false, reason: 'User already on watchlist for this server' };
    }
    const entry = { 
        username, 
        addedAt: new Date().toISOString(), 
        lastRun: null,
        intervalMinutes: intervalMinutes, // custom interval per user (null = use global default)
        guildId: guildId // guild that added this user to watchlist
    };
    watchlist.push(entry);
    saveWatchlist();
    if (VERBOSE) console.log(`➕ Added ${username} to watchlist for guild ${guildId} (interval: ${intervalMinutes || WATCHLIST_INTERVAL_MINUTES}m)`);
    return { added: true, entry };
}

export function removeFromWatchlist(username, guildId = null) {
    const before = watchlist.length;
    watchlist = watchlist.filter(w => {
        const nameMatch = w.username.toLowerCase() === username.toLowerCase();
        // If guildId provided, only remove from that guild; otherwise remove all matches
        if (guildId) {
            return !(nameMatch && w.guildId === guildId);
        }
        return !nameMatch;
    });
    if (watchlist.length !== before) {
        saveWatchlist();
        if (VERBOSE) console.log(`➖ Removed ${username} from watchlist${guildId ? ` for guild ${guildId}` : ''}`);
        return { removed: true };
    }
    return { removed: false, reason: 'User not found on this server\'s watchlist' };
}

export function listWatchlist(guildId = null) {
    // If guildId provided, only return entries for that guild
    if (guildId) {
        return watchlist.filter(w => w.guildId === guildId).map(w => ({ ...w }));
    }
    return watchlist.map(w => ({ ...w }));
}

export function clearWatchlist(guildId = null) {
    if (!guildId) {
        return { cleared: false, reason: 'Guild ID is required' };
    }
    const before = watchlist.length;
    const removedCount = watchlist.filter(w => w.guildId === guildId).length;
    if (removedCount === 0) {
        return { cleared: false, reason: 'Watchlist is already empty for this server' };
    }
    watchlist = watchlist.filter(w => w.guildId !== guildId);
    saveWatchlist();
    if (VERBOSE) console.log(`🗑️ Cleared ${removedCount} entries from watchlist for guild ${guildId}`);
    return { cleared: true, count: removedCount };
}

function startScheduler() {
    if (intervalHandle) clearInterval(intervalHandle);
    // Check every minute to support per-user intervals
    const CHECK_INTERVAL_MS = 60 * 1000; // check every minute
    intervalHandle = setInterval(runDueEntries, CHECK_INTERVAL_MS);
    if (VERBOSE) console.log(`⏱️ Watchlist scheduler started (checking every minute, default interval ${WATCHLIST_INTERVAL_MINUTES}m)`);
    // Kick off immediately once at startup
    setTimeout(runDueEntries, 5_000);
}

async function runDueEntries() {
    if (!discordClient) return;
    if (!watchlist.length) return; // nothing to do
    const now = Date.now();
    for (const entry of watchlist) {
        // Skip orphan entries that don't have a guildId (legacy entries from before multi-server support)
        if (!entry.guildId) {
            if (VERBOSE) console.log(`⚠️ Skipping orphan entry ${entry.username} (no guildId) - please re-add with !watch`);
            continue;
        }
        
        // Use per-user interval if set, otherwise fall back to global default
        const entryIntervalMs = (entry.intervalMinutes || WATCHLIST_INTERVAL_MINUTES) * 60 * 1000;
        const last = entry.lastRun ? Date.parse(entry.lastRun) : 0;
        if (now - last < entryIntervalMs) continue; // not due yet
        
        // Find the watchlist channel for this entry's specific guild
        const channel = findWatchlistChannel(entry.guildId);
        if (!channel) {
            if (VERBOSE) console.log(`⚠️ Watchlist channel not found for guild ${entry.guildId}, skipping ${entry.username}`);
            continue;
        }
        
        try {
            await runReportsForUser(channel, entry.username);
            entry.lastRun = new Date().toISOString();
            if (VERBOSE) console.log(`📤 Posted watchlist reports for ${entry.username} to guild ${entry.guildId}`);
            // Persist after each success to keep lastRun up to date
            saveWatchlist();
        } catch (e) {
            console.error(`❌ Failed watchlist run for ${entry.username}:`, e);
        }
    }
}

function findWatchlistChannel(guildId = null) {
    if (!discordClient) return null;
    const guilds = discordClient.guilds?.cache;
    
    // If guildId is provided, only look in that specific guild
    if (guildId) {
        const guild = guilds.get(guildId);
        if (!guild) return null;
        return guild.channels.cache.find(ch => ch.name === WATCHLIST_CHANNEL_NAME && ch.isTextBased()) || null;
    }
    
    // Fallback: search all guilds (for backwards compatibility with old entries)
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
