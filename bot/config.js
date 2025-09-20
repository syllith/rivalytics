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
export const SEASON_8_START_ISO = process.env.SEASON_8_START_ISO || '2025-08-20T00:00:00Z';
export const SEASON_START = new Date(SEASON_8_START_ISO);
export const RANKED_BOUNDARY_ENABLED = (process.env.RANKED_BOUNDARY_ENABLED || 'true').toLowerCase() === 'true';
export const RANKED_BOUNDARY_THRESHOLD = parseInt(process.env.RANKED_BOUNDARY_THRESHOLD || '400', 10);
export const COMPETITIVE_RELAX_THRESHOLD = parseInt(process.env.COMPETITIVE_RELAX_THRESHOLD || '5', 10);

// * Asset base paths
export const HERO_AVATAR_BASE = 'https://rivalytics.oblivonix.com/assets/images/avatars/';
