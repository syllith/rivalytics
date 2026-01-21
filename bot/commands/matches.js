import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { scrapeJson, screenshotMatchScoreboard } from '../browser.js';
import { CURRENT_SEASON, PUBLIC_SEASON, VERBOSE, RANKED_BOUNDARY_ENABLED, RANKED_BOUNDARY_THRESHOLD } from '../config.js';
import { formatShortNumber, isCompetitiveMode } from '../utils.js';
import { renderMatchesCard } from '../renderers/matchesCard.js';

// * Handle the !matches command: ranked ladder changes + recent competitive match snapshots
export async function handleMatchesCommand(message, args) {
    //. Validate args
    if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!matches <username>`');

    const username = args[1];
    if (VERBOSE) console.log(`🔍 Matches (ranked) command requested for username: ${username}`);

    // * Provide loading feedback
    const loadingMsg = await message.reply(`🔍 Gathering ranked history and recent matches for **${username}** (Season ${PUBLIC_SEASON})...`);

    try {
        // =============== Ranked Overview Fetch ===============
        const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${encodeURIComponent(username)}/stats/overview/ranked?season=${CURRENT_SEASON}`;
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
                gain: '',
                epoch: d.getTime(),
                iso: d.toISOString()
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
        let recentMatchObjs = [];
        const TARGET_COMPETITIVE_MATCHES = 10;
        try {
            // Fetch from current season
            const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${encodeURIComponent(username)}?season=${CURRENT_SEASON}`;
            if (VERBOSE) console.log(`📡 Fetching recent matches for merge: ${matchesUrl}`);
            const matchResp = await scrapeJson(matchesUrl);
            let allMatches = matchResp.data?.matches || [];

            // Strict filter: only modes categorized as competitive (utility decides)
            let competitive = allMatches.filter(m => isCompetitiveMode(m));
            if (VERBOSE) console.log(`🎯 Competitive matches (strict only): ${competitive.length} / ${allMatches.length}`);
            
            // If we need more matches, try previous season
            const PREVIOUS_SEASON = CURRENT_SEASON - 1;
            if (competitive.length < TARGET_COMPETITIVE_MATCHES && PREVIOUS_SEASON >= 1) {
                if (VERBOSE) console.log(`📡 (matches) Current season has ${competitive.length}/${TARGET_COMPETITIVE_MATCHES} matches, fetching from previous season ${PREVIOUS_SEASON}`);
                try {
                    const prevMatchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${encodeURIComponent(username)}?season=${PREVIOUS_SEASON}`;
                    const prevMatchResp = await scrapeJson(prevMatchesUrl);
                    const prevMatches = prevMatchResp.data?.matches || [];
                    const prevCompetitive = prevMatches.filter(m => isCompetitiveMode(m));
                    competitive = competitive.concat(prevCompetitive);
                } catch (e) {
                    // Non-fatal: previous season might not exist
                    if (VERBOSE) console.log(`⚠️ Could not fetch previous season matches: ${e.message}`);
                }
            }

            // Determine if all targeted matches share identical modeName (e.g., all 'Competitive') so we can suppress it for brevity
            const topCompetitive = competitive.slice(0, TARGET_COMPETITIVE_MATCHES);
            const uniqueModeNames = new Set(topCompetitive.map(m => (m.metadata?.modeName || m.metadata?.mapModeName || '').trim()));
            const suppressModeName = uniqueModeNames.size === 1; // only one distinct mode (likely 'Competitive')

            topCompetitive.forEach((match, idx) => {
                const meta = match.metadata || {};
                const overview = match.segments?.find(seg => seg.type === 'overview');
                const stats = overview?.stats || {};
                const overviewMeta = overview?.metadata || {};
                const matchId = match.attributes?.id || '';

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
                const replayId = meta.replayId || meta.replayID || meta.replayid || overviewMeta.replayId || 'n/a';

                // Conditionally include mode segment
                const modeSegment = suppressModeName ? '' : ` • ${modeName}`;
                // Append a short replay tag (use last 5 chars for compactness) for quick reference / copy
                const replayShort = replayId !== 'n/a' ? ` • 🔁 ${replayId}` : '';

                const line = `${idx + 1}. ${emoji} ${mapName}${modeSegment} • ${kills}/${deaths} (K/D ${kd}) • ${dmg} dmg • ${duration}${replayShort}`;
                recentMatchLines.push(line);
                const ts = meta.timestamp ? new Date(meta.timestamp) : null;
                recentMatchObjs.push({
                    index: idx + 1,
                    emoji,
                    mapName,
                    modeName: suppressModeName ? '' : modeName,
                    kills,
                    deaths,
                    kd,
                    damage: dmgVal,
                    duration,
                    replayShort: replayId !== 'n/a' ? replayId : '',
                    matchId,
                    timestamp: ts ? ts.toISOString() : null
                });
            });
        } catch (e) {
            if (VERBOSE) console.log('⚠️ Failed to fetch recent matches for merged output:', e.message); // ! Non‑fatal merge failure
        }

        // =============== Combined Paired Row Construction ===============
        // We expect the ranked history and the competitive match list to correspond sequentially (index 0 with 0, etc.).
        // Build up to 10 paired rows where each row merges ranked delta info with the same-index recent match stats.
        const pairedCount = Math.min(10, Math.min(processedGames.length, recentMatchObjs.length));
        const combinedRows = [];
        for (let i = 0; i < pairedCount; i++) {
            const r = processedGames[i];
            const m = recentMatchObjs[i];
            combinedRows.push({
                index: i + 1,
                // Ranked side
                rankScore: r.numericScore,
                delta: r.gain || '',
                // Match side
                mapName: m.mapName + (m.modeName ? ' • ' + m.modeName : ''),
                resultEmoji: m.emoji || '',
                kills: m.kills,
                deaths: m.deaths,
                kd: m.kd,
                damage: m.damage,
                duration: m.duration,
                replay: m.replayShort ? m.replayShort.slice(-6) : '',
                matchId: m.matchId || '',
                timestamp: m.timestamp || r.iso || null
            });
        }

        // =============== Embed Construction (legacy fallback) ===============
        const embed = new EmbedBuilder()
            .setTitle(`🏆 Ranked Matches for ${username}`)
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
            desc += `\n**Recent Competitive Matches (Season ${PUBLIC_SEASON}, last ${recentMatchLines.length})**\n` + recentMatchLines.map(l => '• ' + l).join('\n');
        }

        embed.setDescription(desc).setFooter({
            text: `Season ${PUBLIC_SEASON} • Ranked entries: ${processedGames.length} • Competitive matches: ${recentMatchLines.length}`
        });

        // Try image first
        try {
            const png = renderMatchesCard({
                username,
                season: PUBLIC_SEASON,
                currentRank,
                currentScore: formattedScore,
                combinedRows
            });
            const attachment = new AttachmentBuilder(png, { name: `matches_${username}.png` });
            // Build buttons for each match (1..n) returning replay id when clicked
            const buttons = [];
            combinedRows.forEach((row, idx) => {
                if (!row.replay) return; // skip if no replay id
                buttons.push(new ButtonBuilder()
                    .setCustomId(`matchreplay_${loadingMsg.id}_${idx}`)
                    .setLabel(String(idx + 1))
                    .setStyle(ButtonStyle.Secondary)
                );
            });
            const rowsComponents = [];
            if (buttons.length) {
                // Discord max 5 buttons per row, split accordingly
                for (let i = 0; i < buttons.length; i += 5) {
                    rowsComponents.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
                }
            }
            // Store a lightweight mapping on the message object via a symbol? Instead we export a lookup map.
            replayCache.set(loadingMsg.id, combinedRows.map(r => r.replay));
            matchIdCache.set(loadingMsg.id, combinedRows.map(r => r.matchId || ''));
            await loadingMsg.edit({ content: '', embeds: [], files: [attachment], components: rowsComponents });
        } catch (imgErr) {
            console.warn('⚠️ Matches image render failed, falling back to embed:', imgErr.message);
            await loadingMsg.edit({ content: '', embeds: [embed] });
        }
    } catch (e) {
        console.error('❌ Ranked (matches) command error:', e); // ! Unexpected failure
        await loadingMsg.edit('❌ Failed to fetch ranked history. Please check the username and try again.');
    }
}

// In‑memory replay id cache keyed by message id -> array of replay short ids aligned to buttons
const replayCache = new Map();
// Parallel cache to map message id -> array of tracker match ids for team comp links
const matchIdCache = new Map();

export async function handleMatchesInteraction(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith('matchreplay_')) return false;
    // CustomId format: matchreplay_<messageId>_<index>
    const parts = interaction.customId.split('_');
    const messageId = parts[1];
    const idx = parseInt(parts[2], 10);
    const list = replayCache.get(messageId);
    if (!list) {
        try { await interaction.reply({ content: '⏰ Replay buttons expired.', ephemeral: true }); } catch (_) { }
        return true;
    }
    const replayId = list[idx];
    const matchIds = matchIdCache.get(messageId) || [];
    const matchId = matchIds[idx] || '';
    if (!replayId) {
        try { await interaction.reply({ content: '❌ Replay unavailable.', ephemeral: true }); } catch (_) { }
        return true;
    }
    
    // Defer reply since screenshot may take a few seconds
    try {
        await interaction.deferReply({ ephemeral: false });
    } catch (e) {
        if (VERBOSE) console.log('⚠️ Could not defer reply:', e.message);
    }
    
    try {
        const link = matchId ? `https://tracker.gg/marvel-rivals/matches/${matchId}` : null;
        
        if (matchId) {
            // Take screenshot of the scoreboard
            if (VERBOSE) console.log(`📸 Taking scoreboard screenshot for match ${idx + 1}: ${matchId}`);
            
            try {
                const screenshotBuffer = await screenshotMatchScoreboard(matchId);
                const attachment = new AttachmentBuilder(screenshotBuffer, { name: `scoreboard_${matchId}.png` });
                
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`📊 Match ${idx + 1} Scoreboard`)
                    .setDescription(`🎬 Replay ID: \`${replayId}\`\n🔗 [View on Tracker.gg](${link})`)
                    .setImage(`attachment://scoreboard_${matchId}.png`)
                    .setFooter({ text: 'Scoreboard captured from tracker.gg' });
                
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            } catch (screenshotErr) {
                // Fallback to link if screenshot fails
                if (VERBOSE) console.log(`⚠️ Screenshot failed, falling back to link: ${screenshotErr.message}`);
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setDescription(`🎬 Replay ID (Match ${idx + 1}): \`${replayId}\`\n\n[📊 View Scoreboard](${link})\n\n_Screenshot unavailable - click link to view_`);
                await interaction.editReply({ embeds: [embed] });
            }
        } else {
            // No match ID, just show replay ID
            await interaction.editReply({ content: `🎬 Replay ID (Match ${idx + 1}): \`${replayId}\`` });
        }
    } catch (e) {
        console.error('Replay button error:', e);
        try {
            await interaction.editReply({ content: `🎬 Replay ID (Match ${idx + 1}): \`${replayId}\`\n_Could not capture scoreboard_` });
        } catch (_) { }
    }
    return true;
}
