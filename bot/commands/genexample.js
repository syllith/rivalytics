import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeJson, fetchJsonDirect } from '../browser.js';
import { CURRENT_SEASON, VERBOSE } from '../config.js';

// * Resolve examples root directory relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXAMPLES_ROOT = path.resolve(__dirname, '../examples');

// * Mapping from command -> list of API endpoint descriptors
//   Overlap is intentional so each command's folder shows all payloads it depends on.
const commandEndpoints = {
  heroes: [
    { key: 'career_segments', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${u}/segments/career?mode=all&season=${CURRENT_SEASON}`, description: 'Career (season-filtered) hero segments used for hero statistics.' }
  ],
  matches: [
    { key: 'ranked_history', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${u}/stats/overview/ranked?season=${CURRENT_SEASON}`, description: 'Ranked ladder overview & history (provides ranked timeline).' },
    { key: 'recent_matches', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${u}?season=${CURRENT_SEASON}`, description: 'Recent matches list (used to derive competitive list).' }
  ],
  scrims: [
    { key: 'recent_matches', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${u}?season=${CURRENT_SEASON}`, description: 'Recent matches list (filtered for modeName == "Unknown").' }
  ],
  scrimheroes: [
    { key: 'recent_matches', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${u}?season=${CURRENT_SEASON}`, description: 'Recent matches list (to discover scrim heroes).' },
    { key: 'career_segments', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${u}/segments/career?mode=all&season=${CURRENT_SEASON}`, description: 'Career segments (season hero stats filtered to scrim-used heroes).' }
  ],
  tourn: [
    { key: 'recent_matches', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${u}?season=${CURRENT_SEASON}`, description: 'Recent matches list (filtered for Tournament mode).' }
  ],
  encounters: [
    { key: 'aggregated_encounters', buildUrl: u => `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${u}/aggregated?localOffset=300&filter=encounters&season=${CURRENT_SEASON}`, description: 'Aggregated encounters (teammates/enemies).' }
  ]
};

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

// * Try direct fetch first (faster, fewer resources); fallback to scrape
async function fetchEndpoint(url) {
  try {
    return await fetchJsonDirect(url);
  } catch (e) {
    if (VERBOSE) console.log(`ℹ️ Direct fetch failed for ${url}: ${e.message}; trying scrapeJson`);
    return await scrapeJson(url);
  }
}

function writeJsonPretty(filePath, obj) {
  const json = JSON.stringify(obj, null, 2);
  fs.writeFileSync(filePath, json, 'utf8');
}

// * Handle the !genexample command: fetch & persist raw JSON payloads used by other commands
export async function handleGenExampleCommand(message, args) {
  //. Require username
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!genexample <username>`');

  let username = args[1];
  // Accept forms like L<Name> (strip leading L)
  if (/^L[A-Za-z0-9_]{2,}$/i.test(username)) username = username.slice(1);

  const loadingMsg = await message.reply(`🧪 Gathering raw API JSON examples for **${username}** across all commands...`);

  try {
    ensureDir(EXAMPLES_ROOT);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Cache identical URLs so they are only fetched once even if multiple commands reference them
    const urlCache = new Map();
    const resultsSummary = [];
    let totalFetched = 0;

    for (const [commandName, endpoints] of Object.entries(commandEndpoints)) {
      const commandDir = path.join(EXAMPLES_ROOT, commandName);
      ensureDir(commandDir);

      for (const ep of endpoints) {
        const url = ep.buildUrl(username);
        let data;
        if (urlCache.has(url)) {
          data = urlCache.get(url); // * Reuse cached response
        } else {
          if (VERBOSE) console.log(`📡 [genexample] Fetching (${commandName}:${ep.key}) -> ${url}`);
          try {
            data = await fetchEndpoint(url);
          } catch (e) {
            resultsSummary.push(`${commandName}/${ep.key}: ❌ ${e.message}`); // ! Fetch failed
            continue; // Skip writing file
          }
          urlCache.set(url, data);
          totalFetched++;
        }

        const baseFileName = `${ep.key}_${username}_${timestamp}.json`;
        const filePath = path.join(commandDir, baseFileName);
        writeJsonPretty(filePath, data);
        const sizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
        resultsSummary.push(`${commandName}/${ep.key}: ✅ saved (${sizeKB} KB)`);
      }
    }

    const uniqueUrls = urlCache.size;
    const summaryMsg = `✅ Collected ${uniqueUrls} unique endpoint payload(s) (${totalFetched} network fetches).\n` +
      resultsSummary.slice(0, 15).join('\n') + (resultsSummary.length > 15 ? `\n… (${resultsSummary.length - 15} more)` : '');

    await loadingMsg.edit(summaryMsg); // * Success
  } catch (e) {
    console.error('❌ genexample command error:', e); // ! Unexpected failure
    await loadingMsg.edit('❌ Failed to generate example JSON payloads.');
  }
}

// * Optional metadata export for future dynamic help/registration
export const genExampleMeta = { command: '!genexample', description: 'Fetch & store raw JSON used by other commands for a given username.' };
