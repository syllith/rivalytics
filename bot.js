// bot.js - Standalone Discord Bot for Rivalytics
import dotenv from 'dotenv'
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js'
import puppeteer from 'puppeteer'

dotenv.config()

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium'

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
            } else if (command === '!ranked') {
                await handleRankedCommand(message, args);
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
  console.log(`🔍 Starting scrape for: ${url}`);
  let browser;
  try {
    browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(bypassScript);
    
    console.log(`📡 Navigating to URL...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log(`📄 Extracting page content...`);
    const text = await page.evaluate(() => document.body.innerText || '');
    
    console.log(`📝 Raw text length: ${text.length}`);
    
    if (!text || text.length < 10) {
      throw new Error('Empty or very short response from page');
    }
    
    console.log(`🔄 Parsing JSON...`);
    const parsed = JSON.parse(text);
    console.log(`✅ Successfully parsed JSON with keys: ${Object.keys(parsed).join(', ')}`);
    
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

// Discord Command Handlers
async function handleHeroesCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!heroes <username>`');
    }
    
    const username = args[1];
    console.log(`🔍 Heroes command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Looking up heroes for **${username}**...`);
    
    try {
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all`;
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
        const heroes = getHeroesFromResponse(data);
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
            
            const roleEmoji = hero.Role === 'Vanguard' ? '🛡️' : 
                             hero.Role === 'Duelist' ? '⚔️' : 
                             hero.Role === 'Strategist' ? '💚' : '🦸';
            
            description += `${roleEmoji} **${index + 1}. ${hero.Name}** (${hero.Role})\n`;
            description += `⏱️ ${hero.TimePlayed.toFixed(1)}h | 🎮 ${formatShortNumber(hero.MatchesPlayed)} matches\n`;
            description += `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n`;
            description += `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal\n\n`;
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
    console.log(`🔍 Matches command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Looking up recent matches for **${username}**...`);
    
    try {
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=4`;
        console.log(`📡 Fetching matches from: ${url}`);
        
        const data = await scrapeJson(url);
        console.log(`📊 Matches response keys: ${Object.keys(data).join(', ')}`);
        
        if (data.errors && data.errors.length > 0) {
            console.log(`❌ Matches API returned errors:`, data.errors);
            return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        }
        
        if (!data.data || !data.data.matches) {
            console.log(`❌ No matches data found`);
            return loadingMsg.edit('❌ No match data found for this user.');
        }
        
        const matches = data.data.matches.slice(0, 5); // Show last 5 matches
        console.log(`🎮 Found ${matches.length} matches`);
        
        if (matches.length === 0) {
            return loadingMsg.edit('❌ No recent matches found for this user.');
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`🎮 Recent Matches for ${username}`)
            .setColor(0x7289DA)
            .setTimestamp();
        
        let description = '';
        
        matches.forEach((match, index) => {
            const meta = match.metadata || {};
            console.log(`Match ${index} metadata:`, meta);
            
            // Find the overview segment for player stats
            const overview = match.segments?.find(seg => seg.type === "overview");
            const stats = overview?.stats || {};
            
            // Extract match info from metadata
            const result = (overview?.metadata?.result || 'Unknown').replace(/^./, c => c.toUpperCase());
            const mode = meta.mapModeName || meta.mode || 'Unknown Mode';
            const map = meta.mapName || 'Unknown Map';
            const duration = stats.timePlayed?.displayValue?.replace("m ", ":").replace("s", "") || 'Unknown';
            const kills = stats.kills?.displayValue || 'N/A';
            const deaths = stats.deaths?.displayValue || 'N/A';
            const damage = stats.totalHeroDamage?.displayValue || 'N/A';
            
            const resultEmoji = result.toLowerCase() === 'win' ? '🟢' : 
                               result.toLowerCase() === 'loss' ? '🔴' : '⚪';
            
            description += `**${index + 1}. ${resultEmoji} ${result}** - ${mode}\n`;
            description += `🗺️ ${map} | ⏱️ ${duration}\n`;
            description += `💀 ${kills}/${deaths} | 💥 ${damage} dmg\n\n`;
        });
        
        embed.setDescription(description);
        embed.setFooter({ text: `Showing last ${matches.length} matches` });
        
        console.log(`✅ Successfully built matches embed`);
        await loadingMsg.edit({ content: '', embeds: [embed] });
        
    } catch (error) {
        console.error('❌ Matches command error:', error);
        await loadingMsg.edit('❌ Failed to fetch match data. Please check the username and try again.');
    }
}

async function handleRankedCommand(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Please provide a username. Usage: `!ranked <username>`');
    }
    
    const username = args[1];
    console.log(`🔍 Ranked command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Looking up ranked stats for **${username}**...`);
    
    try {
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/stats/overview/ranked`;
        console.log(`📡 Fetching ranked data from: ${url}`);
        
        const data = await scrapeJson(url);
        console.log(`📊 Ranked response keys: ${Object.keys(data).join(', ')}`);
        console.log(`📊 Sample history entries:`, data.data?.history?.data?.slice(0, 5).map(([ts, info]) => ({
            timestamp: ts,
            rank: info.value?.[0],
            score: info.value?.[1],
            display: info.displayValue
        })));
        
        if (data.errors && data.errors.length > 0) {
            console.log(`❌ Ranked API returned errors:`, data.errors);
            return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        }
        
        if (!data.data || !data.data.history || !data.data.history.data) {
            console.log(`❌ No ranked data found`);
            return loadingMsg.edit('❌ No ranked data found for this user.');
        }
        
        const historyData = data.data.history.data;
        if (!historyData || historyData.length === 0) {
            console.log(`❌ No ranked history found`);
            return loadingMsg.edit('❌ No ranked history found for this user.');
        }
        
        // Get current rank and score from the most recent entry
        const mostRecent = historyData[0];
        const [, mostRecentInfo] = mostRecent;
        const currentRankData = mostRecentInfo.value || mostRecentInfo.Value || [];
        const currentRank = typeof currentRankData[0] === 'string' ? currentRankData[0] : String(currentRankData[0] || 'Unranked');
        const currentScore = String(currentRankData[1] || '0');
        
        // Get recent ranked history
        let recentGames = [];
        if (historyData && Array.isArray(historyData)) {
            // Process exactly like the frontend does
            const processedGames = historyData.slice(0, 10).map((entry, index) => {
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
                    gain: '' // Will be calculated below
                };
            });
            
            // Calculate gains exactly like frontend: currScore - nextScore (data is newest first)
            for (let i = 0; i < processedGames.length - 1; i++) {
                const currScore = processedGames[i].numericScore;
                const nextScore = processedGames[i + 1].numericScore;
                const gainNum = currScore - nextScore;
                if (gainNum !== 0) {
                    processedGames[i].gain = gainNum > 0 ? `+${gainNum}` : `${gainNum}`;
                }
            }
            
            recentGames = processedGames;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`🏆 Ranked History for ${username}`)
            .setColor(0xFFD700)
            .setTimestamp();
        
        let description = `**Current Rank:** ${currentRank} | **Current Score:** ${currentScore}\n\n`;
        
        if (recentGames.length > 0) {
            recentGames.forEach((game, index) => {
                // Determine emoji based on gain/loss
                const gainNum = game.gain ? parseInt(game.gain.replace(/[+-]/g, '')) : 0;
                const isGain = game.gain && game.gain.startsWith('+');
                const isLoss = game.gain && game.gain.startsWith('-');
                
                const resultEmoji = isGain ? '🟢' : 
                                   isLoss ? '🔴' : '⚪';
                
                const gainText = game.gain || 'No change';
                const resultText = isGain ? 'Gain' : isLoss ? 'Loss' : 'No Change';
                
                description += `**${index + 1}. ${resultEmoji} ${resultText}** - ${game.rank}\n`;
                description += `📅 ${game.date} ${game.time} | 🏆 ${game.score}\n`;
                description += `📈 ${gainText}\n\n`;
            });
        } else {
            description += `*No recent ranked match history available*`;
        }
        
        embed.setDescription(description);
        embed.setFooter({ text: `Showing last ${recentGames.length} ranked matches` });
        
        console.log(`✅ Successfully built ranked embed`);
        await loadingMsg.edit({ content: '', embeds: [embed] });
        
    } catch (error) {
        console.error('❌ Ranked command error:', error);
        await loadingMsg.edit('❌ Failed to fetch ranked data. Please check the username and try again.');
    }
}

console.log('🤖 Rivalytics Discord Bot starting...');