import { EmbedBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { CURRENT_SEASON, VERBOSE, RANKED_BOUNDARY_ENABLED, RANKED_BOUNDARY_THRESHOLD, COMPETITIVE_RELAX_THRESHOLD } from '../config.js';
import { formatShortNumber, isCompetitiveMode } from '../utils.js';

export async function handleMatchesCommand(message, args) {
    if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!matches <username>`');
    const username = args[1];
    if (VERBOSE) console.log(`🔍 Matches (ranked) command requested for username: ${username}`);
    const loadingMsg = await message.reply(`🔍 Gathering ranked history and recent matches for **${username}**...`);
    try {
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/stats/overview/ranked?season=${CURRENT_SEASON}`;
        if (VERBOSE) console.log(`📡 Fetching ranked data (via !matches) from: ${url}`);
        const data = await scrapeJson(url);
        if (data.errors?.length) return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
        if (!data.data?.history?.data) return loadingMsg.edit('❌ No ranked data found for this user.');
        let historyData = data.data.history.data;
        if (!historyData.length) return loadingMsg.edit(`❌ No ranked history found for this user in this season.`);
        const mostRecent = historyData[0];
        const [, mostRecentInfo] = mostRecent;
        const currentRankData = mostRecentInfo.value || mostRecentInfo.Value || [];
        const currentRank = typeof currentRankData[0] === 'string' ? currentRankData[0] : String(currentRankData[0] || 'Unranked');
        const currentScore = String(currentRankData[1] || '0');
        let processedGamesFull = historyData.slice(0, 25).map(entry => {
            const [timestamp, info] = entry; const d = new Date(timestamp);
            const val = info.value || info.Value || [];
            const rank = typeof val[0] === 'string' ? val[0] : String(val[0] || 'Unknown');
            const score = String(val[1] || '0');
            return { date: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }), rank, score, numericScore: Number(String(score).replace(/,/g, '')) || 0, gain: '' };
        });
        for (let i = 0; i < processedGamesFull.length - 1; i++) {
            const curr = processedGamesFull[i].numericScore; const next = processedGamesFull[i + 1].numericScore; const gain = curr - next; if (gain !== 0) processedGamesFull[i].gain = gain > 0 ? `+${gain}` : `${gain}`;
        }
        if (RANKED_BOUNDARY_ENABLED) {
            const idx = processedGamesFull.findIndex(g => { if (!g.gain) return false; const val = parseInt(g.gain, 10); return !Number.isNaN(val) && val <= -RANKED_BOUNDARY_THRESHOLD; });
            if (idx !== -1) { if (VERBOSE) console.log(`🧭 Ranked boundary detected at index ${idx} (delta ${processedGamesFull[idx].gain})`); processedGamesFull = processedGamesFull.slice(0, idx + 1); }
            else if (VERBOSE) console.log('ℹ️ No ranked boundary detected');
        }
        const processedGames = processedGamesFull.slice(0, 10);
        let recentMatchLines = [];
        try {
            const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=${CURRENT_SEASON}`;
            if (VERBOSE) console.log(`📡 Fetching recent matches for merge: ${matchesUrl}`);
            const matchResp = await scrapeJson(matchesUrl);
            const allMatches = matchResp.data?.matches || [];
            let competitive = allMatches.filter(m => isCompetitiveMode(m.metadata));
            if (competitive.length < COMPETITIVE_RELAX_THRESHOLD) {
                const relaxed = allMatches.filter(m => { const mode = (m.metadata?.modeName || m.metadata?.mapModeName || '').toLowerCase(); if (!mode) return false; return !/(unknown|custom)/.test(mode); });
                if (VERBOSE) console.log(`⚠️ Relaxing competitive filter: strict=${competitive.length}, relaxed=${relaxed.length}`);
                competitive = relaxed;
            } else if (VERBOSE) console.log(`🎯 Competitive matches detected (strict): ${competitive.length} / ${allMatches.length}`);
            competitive.slice(0, 10).forEach((match, idx) => {
                const meta = match.metadata || {}; const overview = match.segments?.find(seg => seg.type === 'overview'); const stats = overview?.stats || {}; const overviewMeta = overview?.metadata || {};
                const resultRaw = (overviewMeta.result || 'unknown').toLowerCase(); const emoji = resultRaw === 'win' ? '🟢' : resultRaw === 'loss' ? '🔴' : '⚪';
                const kills = stats.kills?.value ?? 0; const deaths = stats.deaths?.value ?? 0; const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
                const dmgVal = stats.totalHeroDamage?.value || 0; const dmg = dmgVal ? formatShortNumber(dmgVal) : '0';
                const durationRaw = stats.timePlayed?.displayValue || ''; const duration = durationRaw ? durationRaw.replace(/(\d+)m (\d+)s/, '$1:$2').replace('s', '') : '?:??';
                const mapName = meta.mapName || 'Unknown'; const modeName = meta.modeName || meta.mapModeName || 'Mode';
                recentMatchLines.push(`${idx + 1}. ${emoji} ${mapName} • ${modeName} • ${kills}/${deaths} (K/D ${kd}) • ${dmg} dmg • ${duration}`);
            });
        } catch (e) { if (VERBOSE) console.log('⚠️ Failed to fetch recent matches for merged output:', e.message); }
        const embed = new EmbedBuilder().setTitle(`🏆 Ranked & Recent Matches for ${username}`).setColor(0xFFD700).setTimestamp();
        const formattedScore = Number(currentScore.replace(/,/g, ''))?.toLocaleString('en-US') || currentScore;
        const header = `**Current Rank:** ${currentRank} • **Current Score:** ${formattedScore}`;
        let lines = []; if (processedGames.length) {
            const rows = processedGames.map((g, i) => { const isGain = g.gain?.startsWith('+'); const isLoss = g.gain?.startsWith('-'); const emoji = isGain ? '🟢' : isLoss ? '🔴' : '⚪'; const direction = isGain ? 'Gain' : isLoss ? 'Loss' : 'No Change'; const gainDisplay = g.gain ? ` ${g.gain}` : ''; const scoreCol = g.numericScore.toLocaleString('en-US'); return { index: `${i + 1}.`, emoji, resultCol: `${direction}${gainDisplay}`, scoreCol, timeCol: `${g.date} ${g.time}` }; });
            const idxWidth = Math.max(...rows.map(r => r.index.length));
            const resultWidth = Math.max(...rows.map(r => r.resultCol.length));
            const scoreWidth = Math.max(...rows.map(r => r.scoreCol.length));
            lines = rows.map(r => `${r.index.padEnd(idxWidth, ' ')}  ${r.emoji}  ${r.resultCol.padEnd(resultWidth, ' ')}  🏆 ${r.scoreCol.padStart(scoreWidth, ' ')}  ⌚ ${r.timeCol}`);
        } else lines.push('*No recent ranked history available*');
        const rankedBlock = '```\n' + lines.join('\n') + '\n```';
        let desc = header + '\n\n' + rankedBlock;
        if (recentMatchLines.length) {
            desc += `\n**Recent Competitive Matches (Season ${CURRENT_SEASON}, last ${recentMatchLines.length})**\n` + recentMatchLines.map(l => '• ' + l).join('\n');
        }
        embed.setDescription(desc).setFooter({ text: `Season ${CURRENT_SEASON} • Ranked entries: ${processedGames.length} • Competitive matches: ${recentMatchLines.length}` });
        await loadingMsg.edit({ content: '', embeds: [embed] });
    } catch (e) {
        console.error('❌ Ranked (matches) command error:', e);
        await loadingMsg.edit('❌ Failed to fetch ranked history. Please check the username and try again.');
    }
}
