import { EmbedBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { formatShortNumber } from '../utils.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';

// * Fetch matches for a specific season
async function fetchMatchesForSeason(username, season) {
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${encodeURIComponent(username)}?season=${season}`;
  if (VERBOSE) console.log(`📡 Fetching matches (tournament, Season ${season}) from: ${url}`);
  const data = await scrapeJson(url);
  if (data.errors?.length) throw new Error(data.errors[0].message || 'User not found');
  return data.data?.matches || [];
}

// * Handle the !tourn command: recent Tournament mode matches (public season display)
export async function handleTournCommand(message, args) {
  //. Username required
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!tourn <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Tournament command requested for username: ${username}`);

  // * Loading indicator
  const loadingMsg = await message.reply(`🔍 Looking up Season ${PUBLIC_SEASON} tournament matches for **${username}**...`);

  try {
    const TARGET_MATCHES = 10; // Target number of tournament matches to show
    let allMatches = [];
    
    // Fetch from current season first
    try {
      allMatches = await fetchMatchesForSeason(username, CURRENT_SEASON);
    } catch (e) {
      return loadingMsg.edit(`❌ ${e.message}`);
    }

    // Filter for tournament matches
    let tournMatches = allMatches.filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'tournament');
    
    // If we need more matches, try previous season
    const PREVIOUS_SEASON = CURRENT_SEASON - 1;
    if (tournMatches.length < TARGET_MATCHES && PREVIOUS_SEASON >= 1) {
      if (VERBOSE) console.log(`📡 (tourn) Current season has ${tournMatches.length}/${TARGET_MATCHES} matches, fetching from previous season ${PREVIOUS_SEASON}`);
      try {
        const prevMatches = await fetchMatchesForSeason(username, PREVIOUS_SEASON);
        const prevTourn = prevMatches.filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'tournament');
        tournMatches = tournMatches.concat(prevTourn);
      } catch (e) {
        // Non-fatal: previous season data might not exist
        if (VERBOSE) console.log(`⚠️ Could not fetch previous season tournament matches: ${e.message}`);
      }
    }
    
    if (!tournMatches.length) return loadingMsg.edit('❌ No recent Tournament matches found.');

    const slice = tournMatches.slice(0, TARGET_MATCHES);

    let wins = 0, losses = 0, totalDamage = 0, totalKills = 0, totalDeaths = 0;
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
      const duration = durationRaw.includes('m')
        ? durationRaw.replace(/(\d+)m (\d+)s/, '$1:$2')
        : (durationRaw || '?:??');

      const mapName = meta.mapName || 'Unknown';
      const heroObjs = overviewMeta.heroes?.slice(0, 3) || [];
      const heroesLine = heroObjs.length ? heroObjs.map(h => h.name).join(', ') : '—';

      const timeCol = ts ? ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '??:??';
      const dateCol = ts ? ts.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '--/--';
      const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);

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

    const embed = new EmbedBuilder()
      .setTitle(`🏟️ Tournament Matches (S${PUBLIC_SEASON}) for ${username}`)
      .setColor(0xC71585)
      .setTimestamp();

    embed.setDescription(`Wins: ${wins} • Losses: ${losses} • WinRate: ${(slice.length ? (wins / slice.length * 100).toFixed(1) : '0.0')}%\nAvg Damage: ${formatShortNumber(avgDamage)} • Avg K/D: ${avgKD.toFixed(2)}`);
    fields.slice(0, 25).forEach(f => embed.addFields(f));
    // * Footer omits explicit time; Discord will show timestamp separately via setTimestamp()
    embed.setFooter({ text: `Season ${PUBLIC_SEASON} • Showing last ${slice.length} Tournament matches` });

    await loadingMsg.edit({ content: '', embeds: [embed] }); // * Success path
  } catch (e) {
    console.error('❌ Tournament command error:', e); // ! Unexpected failure
    await loadingMsg.edit('❌ Failed to fetch tournament match data. Please check the username and try again.');
  }
}
