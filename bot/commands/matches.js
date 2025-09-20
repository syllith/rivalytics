import { EmbedBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { CURRENT_SEASON, VERBOSE, RANKED_BOUNDARY_ENABLED, RANKED_BOUNDARY_THRESHOLD } from '../config.js';
import { formatShortNumber, isCompetitiveMode } from '../utils.js';

// * Handle the !matches command: ranked ladder changes + recent competitive match snapshots
export async function handleMatchesCommand(message, args) {
    //. Validate args
    if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!matches <username>`');

    const username = args[1];
    if (VERBOSE) console.log(`🔍 Matches (ranked) command requested for username: ${username}`);

    // * Provide loading feedback
    const loadingMsg = await message.reply(`🔍 Gathering ranked history and recent matches for **${username}**...`);

    try {
        // =============== Ranked Overview Fetch ===============
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/stats/overview/ranked?season=${CURRENT_SEASON}`;
        if (VERBOSE) console.log(`📡 Fetching ranked data (via !matches) from: ${url}`);
        const data = await scrapeJson(url);
        if (data.errors?.length) return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`); // ! API provided error
        if (!data.data?.history?.data) return loadingMsg.edit('❌ No ranked data found for this user.'); // ! Missing expected structure

        let historyData = data.data.history.data;
        if (!historyData.length) return loadingMsg.edit(`❌ No ranked history found for this user in this season.`); // ! No entries at all

        // Current rank derived from most recent history row
        const mostRecent = historyData[0];
        const [, mostRecentInfo] = mostRecent;
        const currentRankData = mostRecentInfo.value || mostRecentInfo.Value || [];
        const currentRank = typeof currentRankData[0] === 'string' ? currentRankData[0] : String(currentRankData[0] || 'Unranked');
        const currentScore = String(currentRankData[1] || '0');

        // Normalize first (up to) 25 entries for potential trimming & diff calculation
        let processedGamesFull = historyData.slice(0, 25).map(entry => {
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

        // Compute deltas vs next (older) entry to label gains/losses
        for (let i = 0; i < processedGamesFull.length - 1; i++) {
            const curr = processedGamesFull[i].numericScore;
            const next = processedGamesFull[i + 1].numericScore;
            const gain = curr - next;
            if (gain !== 0) processedGamesFull[i].gain = gain > 0 ? `+${gain}` : `${gain}`;
        }

        // Optional ranked boundary trimming: cut once a large loss threshold encountered
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

        // Final subset for display (just latest 10 after trimming)
        const processedGames = processedGamesFull.slice(0, 10);

        // =============== Recent Competitive Matches ===============
        let recentMatchLines = [];
        try {
            const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=${CURRENT_SEASON}`;
            if (VERBOSE) console.log(`📡 Fetching recent matches for merge: ${matchesUrl}`);
            const matchResp = await scrapeJson(matchesUrl);
            const allMatches = matchResp.data?.matches || [];

            // Strict filter: only modes categorized as competitive (utility decides)
            const competitive = allMatches.filter(m => isCompetitiveMode(m));
            if (VERBOSE) console.log(`🎯 Competitive matches (strict only): ${competitive.length} / ${allMatches.length}`);

            // Determine if all targeted matches share identical modeName (e.g., all 'Competitive') so we can suppress it for brevity
            const topCompetitive = competitive.slice(0, 10);
            const uniqueModeNames = new Set(topCompetitive.map(m => (m.metadata?.modeName || m.metadata?.mapModeName || '').trim()));
            const suppressModeName = uniqueModeNames.size === 1; // only one distinct mode (likely 'Competitive')

            topCompetitive.forEach((match, idx) => {
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
                const replayId = meta.replayId || meta.replayID || meta.replayid || overviewMeta.replayId || match.attributes?.id || 'n/a';

                // Conditionally include mode segment
                const modeSegment = suppressModeName ? '' : ` • ${modeName}`;
                // Append a short replay tag (use last 5 chars for compactness) for quick reference / copy
                const replayShort = replayId !== 'n/a' ? ` • 🔁 ${replayId}` : '';

                recentMatchLines.push(`${idx + 1}. ${emoji} ${mapName}${modeSegment} • ${kills}/${deaths} (K/D ${kd}) • ${dmg} dmg • ${duration}${replayShort}`);
            });
        } catch (e) {
            if (VERBOSE) console.log('⚠️ Failed to fetch recent matches for merged output:', e.message); // ! Non‑fatal merge failure
        }

        // =============== Embed Construction ===============
        const embed = new EmbedBuilder()
            .setTitle(`🏆 Ranked & Recent Matches for ${username}`)
            .setColor(0xFFD700)
            .setTimestamp();

        const formattedScore = Number(currentScore.replace(/,/g, ''))?.toLocaleString('en-US') || currentScore;
        const header = `**Current Rank:** ${currentRank} • **Current Score:** ${formattedScore}`;

        // Build aligned history table (code block) or placeholder
        let lines = [];
        if (processedGames.length) {
            const rows = processedGames.map((g, i) => {
                const isGain = g.gain?.startsWith('+');
                const isLoss = g.gain?.startsWith('-');
                const emoji = isGain ? '🟢' : isLoss ? '🔴' : '⚪';
                const direction = isGain ? 'Gain' : isLoss ? 'Loss' : 'No Change';
                const gainDisplay = g.gain ? ` ${g.gain}` : '';
                const scoreCol = g.numericScore.toLocaleString('en-US');
                return {
                    index: `${i + 1}.`,
                    emoji,
                    resultCol: `${direction}${gainDisplay}`,
                    scoreCol,
                    timeCol: `${g.date} ${g.time}`
                };
            });
            const idxWidth = Math.max(...rows.map(r => r.index.length));
            const resultWidth = Math.max(...rows.map(r => r.resultCol.length));
            const scoreWidth = Math.max(...rows.map(r => r.scoreCol.length));
            lines = rows.map(r => `${r.index.padEnd(idxWidth, ' ')}  ${r.emoji}  ${r.resultCol.padEnd(resultWidth, ' ')}  🏆 ${r.scoreCol.padStart(scoreWidth, ' ')}  ⌚ ${r.timeCol}`);
        } else {
            lines.push('*No recent ranked history available*');
        }

        const rankedBlock = '```\n' + lines.join('\n') + '\n```';
        let desc = header + '\n\n' + rankedBlock;

        if (recentMatchLines.length) {
            desc += `\n**Recent Competitive Matches (Season ${CURRENT_SEASON}, last ${recentMatchLines.length})**\n` + recentMatchLines.map(l => '• ' + l).join('\n');
        }

        embed.setDescription(desc).setFooter({
            text: `Season ${CURRENT_SEASON} • Ranked entries: ${processedGames.length} • Competitive matches: ${recentMatchLines.length}`
        });

        await loadingMsg.edit({ content: '', embeds: [embed] }); // * Success path
    } catch (e) {
        console.error('❌ Ranked (matches) command error:', e); // ! Unexpected failure
        await loadingMsg.edit('❌ Failed to fetch ranked history. Please check the username and try again.');
    }
}
