import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// * Single env load for bot: prefer project root ../.env (the one actually containing secrets)
try {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const rootEnv = path.resolve(__dirname, '../.env');
	if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
} catch (_) {
	// Silent – bot.js will perform a runtime token presence check.
}

// * Environment-driven configuration exports
export const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
export const VERBOSE = (process.env.BOT_VERBOSE || 'false').toLowerCase() === 'true';
export const CURRENT_SEASON = parseInt(process.env.CURRENT_SEASON || '8', 10);
// Publicly displayed season (Marvel Rivals uses half steps internally). Example: internal 8 => public 4.
// Allow explicit override via PUBLIC_SEASON env; else derive by dividing CURRENT_SEASON by 2 and rounding up.
export const PUBLIC_SEASON = parseInt(process.env.PUBLIC_SEASON || `${Math.ceil(CURRENT_SEASON / 2)}`, 10);
export const SEASON_8_START_ISO = process.env.SEASON_8_START_ISO || '2025-08-20T00:00:00Z';
export const SEASON_START = new Date(SEASON_8_START_ISO);
export const RANKED_BOUNDARY_ENABLED = (process.env.RANKED_BOUNDARY_ENABLED || 'true').toLowerCase() === 'true';
export const RANKED_BOUNDARY_THRESHOLD = parseInt(process.env.RANKED_BOUNDARY_THRESHOLD || '400', 10);
export const COMPETITIVE_RELAX_THRESHOLD = parseInt(process.env.COMPETITIVE_RELAX_THRESHOLD || '5', 10);

// * Watchlist automation (interval in minutes; default small for testing) & channel name
//   WATCHLIST_INTERVAL_MINUTES: how often to post combined reports for each watched user
//   WATCHLIST_CHANNEL_NAME: name of the text channel to send automated updates to
// Provide flexible interval config. Prefer explicit minutes (primary), else hours (legacy / alternative).
// Default: 120 minutes (2 hours).
const _minutesRaw = process.env.WATCHLIST_INTERVAL_MINUTES;
const _hoursRaw = process.env.WATCHLIST_INTERVAL_HOURS;
let _resolvedMinutes;
if (_minutesRaw && /^\d+$/.test(_minutesRaw)) {
	_resolvedMinutes = parseInt(_minutesRaw, 10);
} else if (_hoursRaw && /^\d+$/.test(_hoursRaw)) {
	_resolvedMinutes = parseInt(_hoursRaw, 10) * 60;
} else {
	_resolvedMinutes = 120; // default 2 hours
}
export const WATCHLIST_INTERVAL_MINUTES = _resolvedMinutes;
export const WATCHLIST_CHANNEL_NAME = process.env.WATCHLIST_CHANNEL_NAME || 'watchlist';

// * Asset base paths
export const HERO_AVATAR_BASE = 'https://rivalytics.oblivonix.com/assets/images/avatars/';
