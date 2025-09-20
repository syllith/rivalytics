// bot.js - Standalone Discord Bot for Rivalytics
import dotenv from 'dotenv'
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js'
import puppeteer from 'puppeteer'

dotenv.config()

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium'
const VERBOSE = (process.env.BOT_VERBOSE || 'false').toLowerCase() === 'true'

// Season configuration (override via env if needed)
const CURRENT_SEASON = parseInt(process.env.CURRENT_SEASON || '8', 10);
// Approximate Season 8 start (UTC). Override with SEASON_8_START_ISO env for precision.
const SEASON_8_START_ISO = process.env.SEASON_8_START_ISO || '2025-08-20T00:00:00Z';
const SEASON_START = new Date(SEASON_8_START_ISO); // used for client-side filtering when API does not honor season param
// Optional ranked boundary detection (season reset). If enabled and a large negative delta is found, older entries are trimmed.
const RANKED_BOUNDARY_ENABLED = (process.env.RANKED_BOUNDARY_ENABLED || 'true').toLowerCase() === 'true';
const RANKED_BOUNDARY_THRESHOLD = parseInt(process.env.RANKED_BOUNDARY_THRESHOLD || '400', 10); // treat drops >= this (absolute) as reset
// Competitive fallback: if strict competitive detection yields fewer than this number, relax filter.
const COMPETITIVE_RELAX_THRESHOLD = parseInt(process.env.COMPETITIVE_RELAX_THRESHOLD || '5', 10);

function isWithinCurrentSeason(ts) {
    if (!ts) return false;
    let t;
    if (typeof ts === 'number') {
        // If timestamp looks like seconds (10 digits) convert to ms
        if (ts < 1e12) t = ts * 1000; else t = ts;
    } else if (typeof ts === 'string') {
        // String could be ISO or numeric
        if (/^\d+$/.test(ts)) {
            const num = Number(ts);
            t = num < 1e12 ? num * 1000 : num;
        } else {
            t = Date.parse(ts);
        }
    } else {
        return false;
    }
    if (Number.isNaN(t)) return false;
    return t >= SEASON_START.getTime();
}

function isCompetitiveMode(meta) {
    const mode = (meta?.modeName || meta?.mapModeName || '').toLowerCase();
    if (!mode) return false;
    if (/unknown|custom/.test(mode)) return false; // explicitly exclude
    // Treat modes containing 'competitive' or 'ranked' or 'tournament' as competitive
    if (/(competitive|ranked|tournament)/.test(mode)) return true;
    return false;
}

// Discord Bot Setup
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

// Puppeteer options for scraping
const puppeteerOptions = {
    headless: 'new',
    executablePath: CHROMIUM_PATH,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: null,
};

// Bypass script to avoid detection
const bypassScript = `(function(w,n,wn){Object.defineProperty(n,'webdriver',{get:() => false});
Object.defineProperty(n,'plugins',{get:() =>[{name:"Chrome PDF Plugin"},{name:"Chrome PDF Viewer"},{name:"Native Client"}]});
Object.defineProperty(n,'languages',{get:() => ['en-US','en']});
Object.defineProperty(n,'vendor',{get:()=>'Google Inc.'});
delete wn.chrome;wn.chrome={runtime:{},loadTimes:function(){},csi:function(){},app:{}};
Object.defineProperty(n,'connection',{get:()=>({rtt:50,downlink:1.5,effectiveType:'4g'})});
Object.defineProperty(n,'permissions',{get:()=>({query:x=>Promise.resolve({state:'granted'})})});
const originalQuery = wn.DeviceOrientationEvent.requestPermission;
wn.DeviceOrientationEvent.requestPermission = originalQuery ? originalQuery.bind(wn.DeviceOrientationEvent) : (() => Promise.resolve('granted'));
Object.defineProperty(n,'hardwareConcurrency',{get:()=>4});
Object.defineProperty(n,'deviceMemory',{get:()=>8});})
(window,navigator,window)`;

// Initialize Discord bot
if (process.env.DISCORD_BOT_TOKEN) {
    discordClient.login(process.env.DISCORD_BOT_TOKEN);

    discordClient.once('clientReady', () => {
        console.log(`🤖 Discord bot logged in as ${discordClient.user.tag}!`);
    });

    // Discord command handler
    discordClient.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.trim().split(/ +/);
        const command = args[0].toLowerCase();

        try {
            if (command === '!heroes' || command === '!hero') {
                await handleHeroesCommand(message, args);
            } else if (command === '!matches') {
                await handleMatchesCommand(message, args);
            } else if (command === '!scrims') {
                await handleScrimsCommand(message, args);
            } else if (command === '!scrimheroes' || command === '!scrimhero') {
                await handleScrimHeroesCommand(message, args);
            } else if (command === '!tourn' || command === '!tournament') {
                await handleTournCommand(message, args);
            } else if (command === '!encounters' || command === '!encounter') {
                await handleEncountersCommand(message, args);
            } else if (command === '!help' || command === '!info') {
                await handleHelpCommand(message, args);
            }
        } catch (error) {
            console.error('Discord command error:', error);
            await message.reply('❌ An error occurred while processing your command.');
        }
    });
} else {
    console.log('❌ Discord bot token not provided. Please set DISCORD_BOT_TOKEN in .env file.');
    process.exit(1);
}

// Web scraping function
async function scrapeJson(url) {
    if (VERBOSE) console.log(`🔍 Starting scrape for: ${url}`);
    let browser;
    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        );
        await page.evaluateOnNewDocument(bypassScript);

        if (VERBOSE) console.log(`📡 Navigating to URL...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        if (VERBOSE) console.log(`📄 Extracting page content...`);
        const text = await page.evaluate(() => document.body.innerText || '');

        if (VERBOSE) console.log(`📝 Raw text length: ${text.length}`);

        if (!text || text.length < 10) {
            throw new Error('Empty or very short response from page');
        }

        if (VERBOSE) console.log(`🔄 Parsing JSON...`);
        const parsed = JSON.parse(text);
        if (VERBOSE) console.log(`✅ Successfully parsed JSON with keys: ${Object.keys(parsed).join(', ')}`);

        return parsed;
    } catch (error) {
        console.error(`❌ Scrape error for ${url}:`, error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Helper function to process hero data like the frontend does
function getHeroesFromResponse(resp) {
    if (!resp || !resp.data) return [];

    const heroMap = {};

    resp.data.forEach(seg => {
        if (seg.type !== 'hero') return;

        const role = seg.attributes.role[0].toUpperCase() + seg.attributes.role.slice(1);
        const key = `${seg.metadata.name} (${role})`;
        const s = seg.stats;

        if (!heroMap[key]) {
            heroMap[key] = {
                Name: seg.metadata.name,
                Role: role,
                TimePlayed: 0,
                MatchesPlayed: 0,
                MatchesWon: 0,
                Kills: 0,
                Deaths: 0,
                Assists: 0,
                TotalHeroDamage: 0,
                TotalHeroHeal: 0,
                TotalHeroDamagePerMinute: 0,
                TotalHeroHealPerMinute: 0,
                DamageTakenPerMatch: 0,
                SurvivalKillsPerMatch: 0
            };
        }

        const cur = heroMap[key];

        cur.TimePlayed += (s.timePlayed?.value || 0) / 3600;
        cur.MatchesPlayed += s.matchesPlayed?.value || 0;
        cur.MatchesWon += s.matchesWon?.value || 0;
        cur.Kills += s.kills?.value || 0;
        cur.Deaths += s.deaths?.value || 0;
        cur.Assists += s.assists?.value || 0;
        cur.TotalHeroDamage += s.totalHeroDamage?.value || 0;
        cur.TotalHeroHeal += s.totalHeroHeal?.value || 0;
        cur.TotalHeroDamagePerMinute += s.totalHeroDamagePerMinute?.value || 0;
        cur.TotalHeroHealPerMinute += s.totalHeroHealPerMinute?.value || 0;
        cur.DamageTakenPerMatch += s.damageTakenPerMatch?.value || 0;
        cur.SurvivalKillsPerMatch += s.survivalKillsPerMatch?.value || 0;
    });

    return Object.values(heroMap);
}

// Helper function to format numbers for display
function formatShortNumber(num) {
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'k';
    return Math.round(num).toLocaleString();
}

// Helper: try fetch JSON directly (without puppeteer) for simple public API endpoints; fallback to scrapeJson
async function fetchJsonDirect(url) {
    try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 RivalyticsBot/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        if (VERBOSE) console.log(`ℹ️ Direct fetch failed for ${url}: ${e.message}; falling back to headless scrape`);
        return await scrapeJson(url);
    }
}

// Helper: truncate string with ellipsis
function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
}

// Hero avatar filename mapping (normalized to lowercase, spaces -> dashes, apostrophes removed)
function heroNameToAvatarSlug(name) {
    return name
        .toLowerCase()
        .replace(/'|\.|!/g, '')
        .replace(/\s+/g, '-')
        + '_avatar.webp';
}

const HERO_AVATAR_BASE = 'https://rivalytics.oblivonix.com/assets/images/avatars/';


// Discord Command Handlers
async function handleHeroesCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!heroes <username>`');
    }

    const username = args[1];
    console.log(`🔍 Heroes command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Looking up heroes for **${username}**...`);

    try {
        // Append season=8 to restrict hero stats to Season 8 only (similar to scrims implementation)
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all&season=8`;
        console.log(`📡 Fetching data from: ${url}`);

        const data = await scrapeJson(url);

        // Check if there's an error in the response
        if (data.errors && data.errors.length > 0) {
            console.log(`❌ API returned errors:`, data.errors);
            return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        }

        if (!data.data || !Array.isArray(data.data)) {
            console.log(`❌ No data array in response`);
            return loadingMsg.edit('❌ No data returned from API.');
        }

        console.log(`📊 Found ${data.data.length} total segments`);

        // Process heroes exactly like the frontend
        let heroes = getHeroesFromResponse(data);

        // Safety: if API ignored season param, attempt manual filter if a season attribute exists on segments
        if (Array.isArray(data.data) && data.data.some(seg => seg.attributes?.season)) {
            const filteredSegments = { ...data, data: data.data.filter(seg => seg.attributes?.season === 8) };
            heroes = getHeroesFromResponse(filteredSegments);
        }
        console.log(`🦸 Processed ${heroes.length} heroes`);

        if (heroes.length === 0) {
            return loadingMsg.edit('❌ No hero statistics found for this user.');
        }

        // Sort by playtime (like frontend does)
        heroes.sort((a, b) => b.TimePlayed - a.TimePlayed);

        const embed = new EmbedBuilder()
            .setTitle(`🦸 Hero Stats for ${username}`)
            .setColor(0x00AE86)
            .setTimestamp();

        let description = '';

        // Show top 10 heroes
        const topHeroes = heroes.slice(0, 10);

        topHeroes.forEach((hero, index) => {
            const winRate = hero.MatchesPlayed > 0 ? ((hero.MatchesWon / hero.MatchesPlayed) * 100) : 0;
            const kda = hero.Deaths > 0 ? ((hero.Kills + hero.Assists) / hero.Deaths) : (hero.Kills + hero.Assists);
            const avgDmgPerMatch = hero.MatchesPlayed > 0 ? (hero.TotalHeroDamage / hero.MatchesPlayed) : 0;
            const avgHealPerMatch = hero.MatchesPlayed > 0 ? (hero.TotalHeroHeal / hero.MatchesPlayed) : 0;

            const roleEmoji = hero.Role === 'Vanguard' ? '🛡️' :
                hero.Role === 'Duelist' ? '⚔️' :
                    hero.Role === 'Strategist' ? '💚' : '🦸';

            description += `${roleEmoji} **${index + 1}. ${hero.Name}** (${hero.Role})\n`;
            description += `⏱️ ${hero.TimePlayed.toFixed(1)}h | 🎮 ${formatShortNumber(hero.MatchesPlayed)} matches\n`;
            description += `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n`;
            description += `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg (${formatShortNumber(avgDmgPerMatch)} avg) | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal (${formatShortNumber(avgHealPerMatch)} avg)\n\n`;
        });

        embed.setDescription(description);
        embed.setFooter({ text: `Showing top ${topHeroes.length} of ${heroes.length} heroes` });

        console.log(`✅ Successfully built embed for ${topHeroes.length} heroes`);
        await loadingMsg.edit({ content: '', embeds: [embed] });

    } catch (error) {
        console.error('❌ Heroes command error:', error);
        await loadingMsg.edit('❌ Failed to fetch hero data. Please check the username and try again.');
    }
}

async function handleMatchesCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!matches <username>`');
    }

    const username = args[1];
    if (VERBOSE) console.log(`🔍 Matches (ranked) command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Gathering ranked history and recent matches for **${username}**...`);

    try {
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/stats/overview/ranked?season=${CURRENT_SEASON}`;
        if (VERBOSE) console.log(`📡 Fetching ranked data (via !matches) from: ${url}`);

        const data = await scrapeJson(url);
        if (VERBOSE) {
            console.log(`📊 Ranked response keys: ${Object.keys(data).join(', ')}`);
            console.log(`📊 Sample history entries:`, data.data?.history?.data?.slice(0, 5).map(([ts, info]) => ({
                timestamp: ts,
                rank: info.value?.[0],
                score: info.value?.[1],
                display: info.displayValue
            })));
        }

        if (data.errors && data.errors.length > 0) {
            console.log(`❌ Ranked API returned errors:`, data.errors);
            return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        }

        if (!data.data || !data.data.history || !data.data.history.data) {
            if (VERBOSE) console.log(`❌ No ranked data found`);
            return loadingMsg.edit('❌ No ranked data found for this user.');
        }

        let historyData = data.data.history.data || [];
        // Rely on API season param; if empty after slice we'll still handle below.
        if (!historyData || historyData.length === 0) {
            if (VERBOSE) console.log(`❌ No ranked history found (API returned none for specified season)`);
            return loadingMsg.edit('❌ No ranked history found for this user in this season.');
        }

        // Most recent (API returns newest first)
        const mostRecent = historyData[0];
        const [, mostRecentInfo] = mostRecent;
        const currentRankData = mostRecentInfo.value || mostRecentInfo.Value || [];
        const currentRank = typeof currentRankData[0] === 'string' ? currentRankData[0] : String(currentRankData[0] || 'Unranked');
        const currentScore = String(currentRankData[1] || '0');

        // Take a larger window first for potential boundary detection
        let processedGamesFull = historyData.slice(0, 25).map((entry) => {
            const [timestamp, info] = entry;
            const d = new Date(timestamp);
            const val = info.value || info.Value || [];
            const rank = typeof val[0] === 'string' ? val[0] : String(val[0] || 'Unknown');
            const score = String(val[1] || '0');
            return {
                date: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
                time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                rank,
                score,
                numericScore: Number(String(score).replace(/,/g, '')) || 0,
                gain: ''
            };
        });

        for (let i = 0; i < processedGamesFull.length - 1; i++) {
            const currScore = processedGamesFull[i].numericScore;
            const nextScore = processedGamesFull[i + 1].numericScore;
            const gainNum = currScore - nextScore;
            if (gainNum !== 0) {
                processedGamesFull[i].gain = gainNum > 0 ? `+${gainNum}` : `${gainNum}`;
            }
        }

        if (RANKED_BOUNDARY_ENABLED) {
            const idx = processedGamesFull.findIndex(g => {
                if (!g.gain) return false;
                const val = parseInt(g.gain, 10);
                return !Number.isNaN(val) && val <= -RANKED_BOUNDARY_THRESHOLD;
            });
            if (idx !== -1) {
                if (VERBOSE) console.log(`🧭 Ranked boundary detected at index ${idx} (delta ${processedGamesFull[idx].gain})`);
                processedGamesFull = processedGamesFull.slice(0, idx + 1);
            } else if (VERBOSE) {
                console.log('ℹ️ No ranked boundary detected');
            }
        }

        const processedGames = processedGamesFull.slice(0, 10);

        // processedGames already limited to 10 by slice above

        // We'll also pull last 10 competitive matches (Season scoped)
        let recentMatchLines = [];
        try {
            const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=${CURRENT_SEASON}`; // season-scoped
            if (VERBOSE) console.log(`📡 Fetching recent matches for merge: ${matchesUrl}`);
            const matchResp = await scrapeJson(matchesUrl);
            const allMatches = matchResp.data?.matches || [];
            let competitive = allMatches.filter(m => isCompetitiveMode(m.metadata));
            if (competitive.length < COMPETITIVE_RELAX_THRESHOLD) {
                // Relax: include any mode that is NOT unknown/custom if we are missing data
                const relaxed = allMatches.filter(m => {
                    const mode = (m.metadata?.modeName || m.metadata?.mapModeName || '').toLowerCase();
                    if (!mode) return false;
                    return !/(unknown|custom)/.test(mode);
                });
                if (VERBOSE) console.log(`⚠️ Relaxing competitive filter: strict=${competitive.length}, relaxed=${relaxed.length}`);
                competitive = relaxed;
            } else if (VERBOSE) {
                console.log(`🎯 Competitive matches detected (strict) : ${competitive.length} / ${allMatches.length}`);
            }
            const recent = competitive.slice(0, 10);
            recent.forEach((match, idx) => {
                const meta = match.metadata || {};
                const overview = match.segments?.find(seg => seg.type === 'overview');
                const stats = overview?.stats || {};
                const overviewMeta = overview?.metadata || {};
                const resultRaw = (overviewMeta.result || 'unknown').toLowerCase();
                const emoji = resultRaw === 'win' ? '🟢' : resultRaw === 'loss' ? '🔴' : '⚪';
                const kills = stats.kills?.value ?? 0;
                const deaths = stats.deaths?.value ?? 0;
                const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
                const dmgVal = stats.totalHeroDamage?.value || 0;
                const dmg = dmgVal ? formatShortNumber(dmgVal) : '0';
                const durationRaw = stats.timePlayed?.displayValue || '';
                const duration = durationRaw ? durationRaw.replace(/(\d+)m (\d+)s/, '$1:$2').replace('s', '') : '?:??';
                const mapName = meta.mapName || 'Unknown';
                const modeName = meta.modeName || meta.mapModeName || 'Mode';
                recentMatchLines.push(`${idx + 1}. ${emoji} ${mapName} • ${modeName} • ${kills}/${deaths} (K/D ${kd}) • ${dmg} dmg • ${duration}`);
            });
        } catch (e) {
            if (VERBOSE) console.log('⚠️ Failed to fetch recent matches for merged output:', e.message);
        }

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Ranked & Recent Matches for ${username}`)
            .setColor(0xFFD700)
            .setTimestamp();

        // Build condensed single-line entries
        const formattedScore = Number(currentScore.replace(/,/g, ''))?.toLocaleString('en-US') || currentScore;
        let header = `**Current Rank:** ${currentRank} • **Current Score:** ${formattedScore}`;
        let lines = [];
        if (processedGames.length > 0) {
            // Precompute formatted components
            const rows = processedGames.map((game, index) => {
                const isGain = game.gain && game.gain.startsWith('+');
                const isLoss = game.gain && game.gain.startsWith('-');
                const emoji = isGain ? '🟢' : isLoss ? '🔴' : '⚪';
                const direction = isGain ? 'Gain' : isLoss ? 'Loss' : 'No Change';
                const gainDisplay = game.gain ? ` ${game.gain}` : '';
                const resultCol = `${direction}${gainDisplay}`;
                const scoreCol = game.numericScore.toLocaleString('en-US');
                const timeCol = `${game.date} ${game.time}`;
                return {
                    index: `${index + 1}.`,
                    emoji,
                    resultCol,
                    scoreCol,
                    timeCol
                };
            });

            // Determine column widths
            const idxWidth = Math.max(...rows.map(r => r.index.length));
            const emojiWidth = 2; // Emojis take 2 monospace columns typically; we'll just separate with space
            const resultWidth = Math.max(...rows.map(r => r.resultCol.length));
            const scoreWidth = Math.max(...rows.map(r => r.scoreCol.length));

            lines = rows.map(r => {
                const idx = r.index.padEnd(idxWidth, ' ');
                const emoji = r.emoji; // Keep single char emoji
                const result = r.resultCol.padEnd(resultWidth, ' ');
                const score = r.scoreCol.padStart(scoreWidth, ' '); // right-align numbers
                return `${idx}  ${emoji}  ${result}  🏆 ${score}  ⌚ ${r.timeCol}`;
            });
        } else {
            lines.push('*No recent ranked history available*');
        }

        // Wrap lines in a code block for monospaced alignment
        const rankedBlock = '```' + '\n' + lines.join('\n') + '\n' + '```';
        let desc = header + '\n\n' + rankedBlock;
        if (recentMatchLines.length) {
            desc += `\n**Recent Competitive Matches (Season ${CURRENT_SEASON}, last ${recentMatchLines.length})**\n`;
            desc += recentMatchLines.map(l => '• ' + l).join('\n');
        }
        embed.setDescription(desc);
        embed.setFooter({ text: `Season ${CURRENT_SEASON} • Ranked entries: ${processedGames.length} • Competitive matches: ${recentMatchLines.length}` });
        if (VERBOSE) console.log(`✅ Successfully built ranked history embed via !matches`);
        await loadingMsg.edit({ content: '', embeds: [embed] });
    } catch (error) {
        console.error('❌ Ranked (matches) command error:', error);
        await loadingMsg.edit('❌ Failed to fetch ranked history. Please check the username and try again.');
    }
}

// Scrims: show only matches that have unknown mode (custom/scrim assumption)
async function handleScrimsCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!scrims <username>`');
    }

    const username = args[1];
    if (VERBOSE) console.log(`🔍 Scrims command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Looking up scrim (unknown mode) matches for **${username}**...`);

    try {
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=8`;
        if (VERBOSE) console.log(`📡 Fetching matches from: ${url}`);

        const data = await scrapeJson(url);
        console.log(`📊 Matches response keys: ${Object.keys(data).join(', ')}`);

        if (data.errors && data.errors.length > 0) {
            if (VERBOSE) console.log(`❌ Matches API returned errors:`, data.errors);
            return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        }

        if (!data.data || !data.data.matches) {
            if (VERBOSE) console.log(`❌ No matches data found`);
            return loadingMsg.edit('❌ No match data found for this user.');
        }

        // Scrim filter: matches whose metadata.modeName is exactly 'Unknown' (case-insensitive)
        const unknownMatches = data.data.matches.filter(m => {
            const modeName = (m.metadata?.modeName || '').trim().toLowerCase();
            return modeName === 'unknown';
        });
        if (VERBOSE) console.log(`🔢 Total matches: ${data.data.matches.length}, Unknown mode matches: ${unknownMatches.length}`);

        const matches = unknownMatches.slice(0, 10); // show up to 10 like ranked
        if (VERBOSE) console.log(`🎮 Found ${matches.length} unknown mode matches (from ${data.data.matches.length} total)`);

        if (matches.length === 0) {
            return loadingMsg.edit('❌ No recent matches found where modeName is "Unknown".');
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎮 Scrim Matches for ${username}`)
            .setColor(0x4B7BEC)
            .setTimestamp();

        // Build single-line condensed rows similar to ranked formatting
        if (matches.length > 0) {
            // Collect stats for summary
            let wins = 0, losses = 0, totalDamage = 0, totalKills = 0, totalDeaths = 0;
            const fields = [];
            matches.forEach((match, index) => {
                const meta = match.metadata || {};
                const ts = meta.timestamp ? new Date(meta.timestamp) : null;
                const overview = match.segments?.find(seg => seg.type === 'overview');
                const stats = overview?.stats || {};
                const overviewMeta = overview?.metadata || {};
                const resultRaw = (overviewMeta.result || 'unknown').toLowerCase();
                if (resultRaw === 'win') wins++; else if (resultRaw === 'loss') losses++;
                const emoji = resultRaw === 'win' ? '🟢' : resultRaw === 'loss' ? '🔴' : '⚪';
                const kills = stats.kills?.value || 0;
                const deaths = stats.deaths?.value || 0;
                totalKills += kills; totalDeaths += deaths;
                const dmgVal = stats.totalHeroDamage?.value || 0;
                totalDamage += dmgVal;
                const durationRaw = stats.timePlayed?.displayValue || '';
                const duration = durationRaw.includes('m') ? durationRaw.replace(/(\d+)m (\d+)s/, '$1:$2') : (durationRaw || '?:??');
                const mapName = meta.mapName || 'Unknown';
                const heroObjs = overviewMeta.heroes?.slice(0, 3) || [];
                const heroesLine = heroObjs.length ? heroObjs.map(h => h.name).join(', ') : '—';
                const timeCol = ts ? ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '??:??';
                const dateCol = ts ? ts.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '--/--';
                const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : (kills).toFixed(2);

                const name = `${index + 1}. ${emoji} ${resultRaw === 'win' ? 'Win' : resultRaw === 'loss' ? 'Loss' : '—'} • ${mapName}`.slice(0, 256);
                const valueLines = [
                    `🕒 ${dateCol} ${timeCol} | ⏱ ${duration}`,
                    `💀 ${kills}/${deaths} (K/D ${kdRatio})`,
                    `💥 ${formatShortNumber(dmgVal)}`,
                    `🦸 ${heroesLine}`,
                    `🎬 Replay: ${meta.replayId || 'N/A'}`
                ];
                const value = valueLines.join('\n').slice(0, 1024);
                fields.push({ name, value, inline: true });
            });

            // Summary description
            const avgDamage = matches.length ? (totalDamage / matches.length) : 0;
            const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths) : totalKills;
            const summary = `Wins: ${wins} • Losses: ${losses} • WinRate: ${matches.length ? ((wins / matches.length) * 100).toFixed(1) : '0.0'}%\nAvg Damage: ${formatShortNumber(avgDamage)} • Avg K/D: ${avgKD.toFixed(2)}`;
            embed.setDescription(summary);
            // Discord allows up to 25 fields; ensure we don't exceed.
            fields.slice(0, 25).forEach(f => embed.addFields(f));
        } else {
            embed.setDescription('*No scrim matches with mode name unknown*');
        }
        const footerTimestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        embed.setFooter({ text: `Showing last ${matches.length} matches where mode name is unknown • ${footerTimestamp}` });

        if (VERBOSE) console.log(`✅ Successfully built scrims embed`);
        await loadingMsg.edit({ content: '', embeds: [embed] });
    } catch (error) {
        console.error('❌ Scrims command error:', error);
        await loadingMsg.edit('❌ Failed to fetch scrim match data. Please check the username and try again.');
    }
}


// !scrimheroes: show hero stats (season 8) only for heroes used in recent scrim (unknown mode) matches
async function handleScrimHeroesCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!scrimheroes <username>`');
    }

    const username = args[1];
    if (VERBOSE) console.log(`🔍 Scrim Heroes command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Gathering scrim heroes for **${username}** (Season 8)...`);

    try {
        // 1. Fetch matches (season 8) and filter to scrims (unknown mode)
        const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=8`;
        if (VERBOSE) console.log(`📡 Fetching matches for scrim heroes from: ${matchesUrl}`);
        const matchesResp = await scrapeJson(matchesUrl);
        if (matchesResp.errors && matchesResp.errors.length > 0) {
            return loadingMsg.edit(`❌ ${matchesResp.errors[0].message || 'User not found'}`);
        }
        const allMatches = matchesResp.data?.matches || [];
        const scrimMatches = allMatches.filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'unknown');
        if (scrimMatches.length === 0) {
            return loadingMsg.edit('❌ No scrim (Unknown mode) matches found for this user in Season 8.');
        }
        // 3. Collect hero names used in scrims (overview metadata.heroes)
        const scrimHeroSet = new Set();
        scrimMatches.forEach(match => {
            const overviewSeg = match.segments?.find(seg => seg.type === 'overview');
            const heroesArr = overviewSeg?.metadata?.heroes || [];
            heroesArr.forEach(h => { if (h?.name) scrimHeroSet.add(h.name); });
        });
        if (scrimHeroSet.size === 0) {
            return loadingMsg.edit('❌ No heroes recorded in scrim matches.');
        }

        // 4. Fetch season hero stats and filter to scrim-used heroes
        const heroesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all&season=8`;
        let seasonHeroes = [];
        try {
            const heroesResp = await scrapeJson(heroesUrl);
            let allHeroStats = getHeroesFromResponse(heroesResp);
            if (Array.isArray(heroesResp.data) && heroesResp.data.some(seg => seg.attributes?.season)) {
                const filteredSegments = { ...heroesResp, data: heroesResp.data.filter(seg => seg.attributes?.season === 8) };
                allHeroStats = getHeroesFromResponse(filteredSegments);
            }
            seasonHeroes = allHeroStats;
        } catch (e) {
            if (VERBOSE) console.log('⚠️ Failed to fetch season hero stats:', e.message);
        }

        if (seasonHeroes.length === 0) {
            return loadingMsg.edit('❌ Could not load season hero statistics.');
        }

        const filteredSeason = seasonHeroes.filter(h => scrimHeroSet.has(h.Name));
        if (filteredSeason.length === 0) {
            return loadingMsg.edit('❌ No overlapping heroes between scrim usage and season stats.');
        }

        filteredSeason.sort((a, b) => b.TimePlayed - a.TimePlayed);
        const top = filteredSeason.slice(0, 10);

        const embed = new EmbedBuilder()
            .setTitle(`🦸 Scrim-Used Hero Season Stats (S8) for ${username}`)
            .setColor(0x8A2BE2)
            .setTimestamp();

        let description = 'These are full Season 8 totals ONLY for heroes you have used in Unknown-mode matches (scrims). Scrim-only per-hero stats are not exposed by the API.\n\n';
        top.forEach((hero, idx) => {
            const winRate = hero.MatchesPlayed > 0 ? ((hero.MatchesWon / hero.MatchesPlayed) * 100) : 0;
            const kda = hero.Deaths > 0 ? ((hero.Kills + hero.Assists) / hero.Deaths) : (hero.Kills + hero.Assists);
            const avgDmgPerMatch = hero.MatchesPlayed > 0 ? (hero.TotalHeroDamage / hero.MatchesPlayed) : 0;
            const avgHealPerMatch = hero.MatchesPlayed > 0 ? (hero.TotalHeroHeal / hero.MatchesPlayed) : 0;
            const roleEmoji = hero.Role === 'Vanguard' ? '🛡️' : hero.Role === 'Duelist' ? '⚔️' : hero.Role === 'Strategist' ? '💚' : '🦸';
            description += `${roleEmoji} **${idx + 1}. ${hero.Name}** (${hero.Role})\n`;
            description += `🎮 ${formatShortNumber(hero.MatchesPlayed)} matches | ⏱️ ${hero.TimePlayed.toFixed(1)}h\n`;
            description += `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n`;
            description += `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg (${formatShortNumber(avgDmgPerMatch)} avg) | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal (${formatShortNumber(avgHealPerMatch)} avg)\n\n`;
        });

        embed.setDescription(description);
        embed.setFooter({ text: `Showing ${top.length} of ${filteredSeason.length} heroes (Season totals)` });
        await loadingMsg.edit({ content: '', embeds: [embed] });
    } catch (error) {
        console.error('❌ Scrim Heroes command error:', error);
        await loadingMsg.edit('❌ Failed to fetch scrim hero stats. Please try again later.');
    }
}

// Tournament matches: filter by modeName === 'Tournament'
async function handleTournCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!tourn <username>`');
    }

    const username = args[1];
    if (VERBOSE) console.log(`🔍 Tournament command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Looking up Season 8 tournament matches for **${username}**...`);

    try {
        // Season-specific: tournament command now targets Season 8
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=8`;
        if (VERBOSE) console.log(`📡 Fetching matches (tournament, Season 8) from: ${url}`);
        const data = await scrapeJson(url);
        if (data.errors && data.errors.length > 0) {
            return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        }
        const allMatches = data.data?.matches || [];
        // Filter to tournament mode (case-insensitive exact)
        const tournMatches = allMatches.filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'tournament');
        if (VERBOSE) console.log(`🎮 Total matches: ${allMatches.length}, Tournament matches: ${tournMatches.length}`);
        if (tournMatches.length === 0) {
            return loadingMsg.edit('❌ No recent Tournament matches found.');
        }

        const slice = tournMatches.slice(0, 10);
        let wins = 0, losses = 0, totalDamage = 0, totalKills = 0, totalDeaths = 0;
        const embed = new EmbedBuilder()
            .setTitle(`🏟️ Tournament Matches (S6) for ${username}`)
            .setColor(0xC71585)
            .setTimestamp();

        const fields = [];
        slice.forEach((match, index) => {
            const meta = match.metadata || {};
            const ts = meta.timestamp ? new Date(meta.timestamp) : null;
            const overview = match.segments?.find(seg => seg.type === 'overview');
            const stats = overview?.stats || {};
            const overviewMeta = overview?.metadata || {};
            const resultRaw = (overviewMeta.result || 'unknown').toLowerCase();
            if (resultRaw === 'win') wins++; else if (resultRaw === 'loss') losses++;
            const emoji = resultRaw === 'win' ? '🟢' : resultRaw === 'loss' ? '🔴' : '⚪';
            const kills = stats.kills?.value || 0;
            const deaths = stats.deaths?.value || 0;
            totalKills += kills; totalDeaths += deaths;
            const dmgVal = stats.totalHeroDamage?.value || 0;
            totalDamage += dmgVal;
            const durationRaw = stats.timePlayed?.displayValue || '';
            const duration = durationRaw.includes('m') ? durationRaw.replace(/(\d+)m (\d+)s/, '$1:$2') : (durationRaw || '?:??');
            const mapName = meta.mapName || 'Unknown';
            const heroObjs = overviewMeta.heroes?.slice(0, 3) || [];
            const heroesLine = heroObjs.length ? heroObjs.map(h => h.name).join(', ') : '—';
            const timeCol = ts ? ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '??:??';
            const dateCol = ts ? ts.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '--/--';
            const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : (kills).toFixed(2);

            const name = `${index + 1}. ${emoji} ${resultRaw === 'win' ? 'Win' : resultRaw === 'loss' ? 'Loss' : '—'} • ${mapName}`.slice(0, 256);
            const valueLines = [
                `🕒 ${dateCol} ${timeCol} | ⏱ ${duration}`,
                `💀 ${kills}/${deaths} (K/D ${kdRatio})`,
                `💥 ${formatShortNumber(dmgVal)}`,
                `🦸 ${heroesLine}`,
                `🎬 Replay: ${meta.replayId || 'N/A'}`
            ];
            fields.push({ name, value: valueLines.join('\n').slice(0, 1024), inline: true });
        });

        const avgDamage = slice.length ? (totalDamage / slice.length) : 0;
        const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths) : totalKills;
        const summary = `Wins: ${wins} • Losses: ${losses} • WinRate: ${slice.length ? ((wins / slice.length) * 100).toFixed(1) : '0.0'}%\nAvg Damage: ${formatShortNumber(avgDamage)} • Avg K/D: ${avgKD.toFixed(2)}`;
        embed.setDescription(summary);
        fields.slice(0, 25).forEach(f => embed.addFields(f));
        embed.setFooter({ text: `Season 8 • Showing last ${slice.length} Tournament matches • ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` });
        await loadingMsg.edit({ content: '', embeds: [embed] });
    } catch (error) {
        console.error('❌ Tournament command error:', error);
        await loadingMsg.edit('❌ Failed to fetch tournament match data. Please check the username and try again.');
    }
}

// Encounters: show recently encountered players (played with) - derived from profile career segment plus matches list.
// Command: !encounters <username> [limit]
// Strategy:
// 1. Fetch recent matches (season scoped). Iterate matches; collect teammate player handles from metadata/segments (overview teammates/heroes if provided by API) or generic players list when exposed.
// 2. Count occurrences and last seen timestamp; exclude the queried user; sort by most recent then frequency.
// 3. Display top N (default 10, max 25) encountered players with: timesPlayedTogether, that player's displayed rank if present in match roster metadata, lastEncounter date, optional their win rate in those shared matches (wins where both on same team).
// Note: Tracker API does not expose a dedicated "encounters" endpoint in provided HAR for Marvel Rivals; we emulate by parsing match rosters.
// If API later exposes /profile/<ign>/encounters we can attempt fetch and prefer it.
async function handleEncountersCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!encounters <username> [count]`');
    }
    const username = args[1];
    const limit = Math.min(Math.max(parseInt(args[2] || '10', 10) || 10, 3), 25);
    if (VERBOSE) console.log(`🔍 Encounters command for ${username} (limit ${limit})`);
    const loadingMsg = await message.reply(`🔍 Gathering recent encounters for **${username}**...`);

    try {
        const encountersUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/aggregated?localOffset=300&filter=encounters&season=${CURRENT_SEASON}`;
        if (VERBOSE) console.log(`📡 Fetching aggregated encounters: ${encountersUrl}`);
        const resp = await fetchJsonDirect(encountersUrl);
        if (resp?.errors?.length) {
            return loadingMsg.edit(`❌ ${resp.errors[0].message || 'API error fetching encounters.'}`);
        }
        const teammates = resp?.data?.teammates || [];
        const enemies = resp?.data?.enemies || [];
        if (!teammates.length && !enemies.length) {
            return loadingMsg.edit('❌ No encounter data returned (teammates/enemies empty).');
        }

        // Normalize records into unified objects
        function mapRecord(r, type) {
            const handle = r.platformInfo?.platformUserHandle || r.platformInfo?.platformUserIdentifier || 'Unknown';
            const tsRaw = r.metadata?.lastMatchTimestamp;
            const ts = tsRaw ? Date.parse(tsRaw) : 0;
            const stats = r.stats || {};
            const matchesPlayed = stats.matchesPlayed?.value || 0;
            const kd = stats.kdRatio?.value || stats.kdRatio?.metadata?.parsedValue || 0;
            let winPctVal = stats.winPct?.value;
            if (typeof winPctVal === 'object' && winPctVal?.parsedValue != null) winPctVal = winPctVal.parsedValue;
            if (typeof winPctVal === 'number' && winPctVal > 1 && winPctVal <= 100) {
                // leave as is
            }
            const winPct = winPctVal;
            const seasonRankObj = stats.seasonRank;
            const rankScore = seasonRankObj?.value?.parsedValue || 0;
            const rankTier = seasonRankObj?.metadata?.tierShortName || seasonRankObj?.metadata?.tierName || '';
            const rankIcon = seasonRankObj?.metadata?.iconUrl || '';
            const seasonWinPctRaw = stats.seasonWinPct?.value;
            let seasonWinPct = seasonWinPctRaw;
            if (typeof seasonWinPct === 'object' && seasonWinPct?.parsedValue != null) seasonWinPct = seasonWinPct.parsedValue;
            const seasonKD = stats.seasonKdRatio?.value || 0;
            const seasonMatches = stats.seasonMatchesPlayed?.value || 0;
            return {
                type,
                handle,
                lastTs: ts,
                matchesTogether: matchesPlayed,
                kdTogether: kd,
                winPctTogether: winPct,
                seasonRankScore: rankScore,
                seasonRankTier: rankTier,
                seasonKD,
                seasonWinPct,
                seasonMatches,
                rankIcon,
            };
        }

        // Prepare separate lists
        const allyNormalized = teammates.map(r => mapRecord(r, 'ally'))
            .sort((a, b) => (b.matchesTogether - a.matchesTogether) || (b.lastTs - a.lastTs));
        const enemyNormalized = enemies.map(r => mapRecord(r, 'enemy'))
            .sort((a, b) => (b.matchesTogether - a.matchesTogether) || (b.lastTs - a.lastTs));

        const allyTop = allyNormalized.slice(0, limit);
        const enemyTop = enemyNormalized.slice(0, limit);

        function formatBlock(e, idx, label) {
            const last = e.lastTs ? new Date(e.lastTs).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—';
            const winPctDisplay = (typeof e.winPctTogether === 'number') ? `${e.winPctTogether.toFixed(1)}%` : '—';
            const seasonWinDisplay = (typeof e.seasonWinPct === 'number') ? `${e.seasonWinPct.toFixed(1)}%` : '—';
            const tier = e.seasonRankTier ? e.seasonRankTier : '';
            const seasonKD = e.seasonKD ? e.seasonKD.toFixed(2) : '—';
            const headLine = `${idx + 1}. ${e.handle}${tier ? ` (${tier})` : ''} ${label}`.trim();
            const togetherLine = `Together: ${e.matchesTogether} games | Win%: ${winPctDisplay} | K/D: ${e.kdTogether?.toFixed ? e.kdTogether.toFixed(2) : e.kdTogether}`;
            const lastLine = `Last Seen: ${last}`;
            const seasonLine = `Season: ${e.seasonMatches}m • Win% ${seasonWinDisplay} • K/D ${seasonKD} • RS ${e.seasonRankScore || '—'}`;
            return '```\n' + headLine + '\n' + togetherLine + '\n' + lastLine + '\n' + seasonLine + '\n' + '```';
        }

        const allyBlocks = allyTop.map((e, i) => formatBlock(e, i, '[With]'));
        const enemyBlocks = enemyTop.map((e, i) => formatBlock(e, i, '[Against]'));

        const embed = new EmbedBuilder()
            .setTitle(`Encounters for ${username}`)
            .setColor(0x2E8B57)
            .setTimestamp();

    const allyHeader = allyBlocks.length ? '**🤝 Played With**\n' : '';
    const enemyHeader = enemyBlocks.length ? '\n**⚔️ Played Against**\n' : '';
        embed.setDescription(allyHeader + allyBlocks.join('\n') + enemyHeader + enemyBlocks.join('\n'));
        embed.setFooter({ text: `Season ${CURRENT_SEASON} • Teammates: ${teammates.length} • Enemies: ${enemies.length} • Showing up to ${limit} each` });
        await loadingMsg.edit({ content: '', embeds: [embed] });
    } catch (e) {
        console.error('❌ Encounters command error:', e);
        await loadingMsg.edit('❌ Failed to fetch encounter data. API may have changed.');
    }
}


// Help / Info Command
async function handleHelpCommand(message, args) {
    const lines = [];
    lines.push('Rivalytics Bot Commands');
    lines.push('Usage: <command> <username>. Below describes the data each command retrieves.');
    lines.push('');
    lines.push('🦸 `!heroes <user>` (alias: `!hero`)');
    lines.push('  Returns Season 8 hero performance aggregated per hero. Sorted by time played.');
    lines.push('  Includes: Time Played (hours), Matches Played/Won, Win Rate, Kills, Deaths, Assists, KDA, Total Hero Damage & per‑match avg, Total Hero Heal & per‑match avg, Damage Taken / Match, Survival Kills / Match, Role (Vanguard/Duelist/Strategist). Shows top 10 heroes.');
    lines.push('');
    lines.push('🏆 `!matches <user>`');
    lines.push(`  Combines Season ${CURRENT_SEASON} ranked ladder history (newest first) plus last 10 competitive matches.`);
    lines.push('  Ranked: current rank & score + per-entry score delta (season-filtered by timestamp).');
    lines.push('  Competitive: Result, Map, Mode, Kills/Deaths (K/D), Damage (short), Duration (m:s). Includes only modes containing ranked/competitive/tournament; excludes unknown/custom.');
    lines.push('');
    lines.push('🎮 `!scrims <user>`');
    lines.push('  Filters Season 8 match list to entries whose modeName is exactly "Unknown" (interpreted as custom/scrim games).');
    lines.push('  For each listed scrim: Result (Win/Loss/—), Map, Date & Time, Match Duration, Kills, Deaths, K/D, Total Hero Damage, Up to first 3 Heroes Played, Replay ID (if present). Also includes overall summary (wins, losses, win rate, avg damage, avg K/D).');
    lines.push('');
    lines.push('🧪 `!scrimheroes <user>` (alias: `!scrimhero`)');
    lines.push('  Shows Season 8 TOTAL hero stats but only for heroes that appear in your scrim (Unknown mode) matches.');
    lines.push('  Provides same hero metrics as `!heroes`, restricted to this subset. Note: values are season totals, not isolated to scrims (API limitation).');
    lines.push('');
    lines.push('🏟️ `!tourn <user>` (alias: `!tournament`)');
    lines.push('  Retrieves recent Season 8 matches where modeName is "Tournament".');
    lines.push('  For each match: Result, Map, Date & Time, Duration, Kills/Deaths + K/D, Total Hero Damage, Up to first 3 Heroes Played, Replay ID. Includes summary aggregates (wins, losses, win rate, average damage, average K/D).');
    lines.push('');
    lines.push('🤝 `!encounters <user> [count]` (alias: `!encounter`)');
    lines.push('  Uses official aggregated encounters endpoint (Season scoped) to list recent teammates and enemies.');
    lines.push('  Metrics per player: Together Matches, Together Win%, Together K/D, Last Encounter Date, Season Rank Score & Tier, Season Win%, Season K/D, Season Matches. Allies listed before enemies. Optional count (3-25, default 10).');
    lines.push('');
    const text = lines.join('\n');
    // Ensure under Discord 2000 char limit
    await message.reply(text.length > 1900 ? text.slice(0, 1990) + '…' : text);
}


console.log('🤖 Rivalytics Discord Bot starting...');