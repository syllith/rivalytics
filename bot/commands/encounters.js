import { EmbedBuilder } from 'discord.js';
import { fetchJsonDirect } from '../browser.js';
import { CURRENT_SEASON, PUBLIC_SEASON, VERBOSE } from '../config.js';

// * Handle the !encounters command: shows top teammates and opponents with shared stats
export async function handleEncountersCommand(message, args) {
  //. Basic argument validation & usage hint
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!encounters <username> [count]`');

  // Username + optional display limit (bounded 3–25)
  const username = args[1];
  const limit = Math.min(Math.max(parseInt(args[2] || '10', 10) || 10, 3), 25);

  if (VERBOSE) console.log(`🔍 Encounters command for ${username} (limit ${limit})`);

  // * Immediate feedback while fetching
  const loadingMsg = await message.reply(`🔍 Gathering recent encounters for **${username}** (Season ${PUBLIC_SEASON})...`);

  try {
    // * Aggregated endpoint returns teammates / enemies arrays and per‑relation stats
    const encountersUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/aggregated?localOffset=300&filter=encounters&season=${CURRENT_SEASON}`;
    if (VERBOSE) console.log(`📡 Fetching aggregated encounters: ${encountersUrl}`);

    const resp = await fetchJsonDirect(encountersUrl);
    if (resp?.errors?.length) return loadingMsg.edit(`❌ ${resp.errors[0].message || 'API error fetching encounters.'}`); // ! API surfaced an error

    // Raw relation arrays (may be empty independently)
    const teammates = resp?.data?.teammates || [];
    const enemies = resp?.data?.enemies || [];
    if (!teammates.length && !enemies.length) return loadingMsg.edit('❌ No encounter data returned (teammates/enemies empty).'); // ! Nothing to show

    // Helper: normalize an API relation record into a compact object we control
    function mapRecord(r, type) {
      const handle = r.platformInfo?.platformUserHandle || r.platformInfo?.platformUserIdentifier || 'Unknown';

      // Last shared match timestamp -> ms epoch for sorting / display
      const tsRaw = r.metadata?.lastMatchTimestamp;
      const ts = tsRaw ? Date.parse(tsRaw) : 0;

      const stats = r.stats || {};
      const matchesPlayed = stats.matchesPlayed?.value || 0;
      const kd = stats.kdRatio?.value || stats.kdRatio?.metadata?.parsedValue || 0;

      // Win% can be primitive or object with parsedValue
      let winPctVal = stats.winPct?.value;
      if (typeof winPctVal === 'object' && winPctVal?.parsedValue != null) winPctVal = winPctVal.parsedValue;

      // Season rank packed with both tier metadata and numeric score
      const seasonRankObj = stats.seasonRank;
      const rankScore = seasonRankObj?.value?.parsedValue || 0;
      const rankTier = seasonRankObj?.metadata?.tierShortName || seasonRankObj?.metadata?.tierName || '';

      // Season performance metrics (again may be object wrappers)
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
        winPctTogether: winPctVal,
        seasonRankScore: rankScore,
        seasonRankTier: rankTier,
        seasonKD,
        seasonWinPct,
        seasonMatches
      };
    }

    // * Normalize then rank by (games together desc, then recency)
    const allyNormalized = teammates.map(r => mapRecord(r, 'ally'))
      .sort((a, b) => (b.matchesTogether - a.matchesTogether) || (b.lastTs - a.lastTs));
    const enemyNormalized = enemies.map(r => mapRecord(r, 'enemy'))
      .sort((a, b) => (b.matchesTogether - a.matchesTogether) || (b.lastTs - a.lastTs));

    // Slice to requested limit
    const allyTop = allyNormalized.slice(0, limit);
    const enemyTop = enemyNormalized.slice(0, limit);

    // Helper: produce a mini code‑block summary for each relation
    function formatBlock(e, idx, label) {
      const last = e.lastTs
        ? new Date(e.lastTs).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
        : '—';
      const winPctDisplay = typeof e.winPctTogether === 'number' ? `${e.winPctTogether.toFixed(1)}%` : '—';
      const seasonWinDisplay = typeof e.seasonWinPct === 'number' ? `${e.seasonWinPct.toFixed(1)}%` : '—';
      const tier = e.seasonRankTier ? e.seasonRankTier : '';
      const seasonKD = e.seasonKD ? e.seasonKD.toFixed(2) : '—';

      const headLine = `${idx + 1}. ${e.handle}${tier ? ` (${tier})` : ''} ${label}`.trim();
      const togetherLine = `Together: ${e.matchesTogether} games | Win%: ${winPctDisplay} | K/D: ${e.kdTogether?.toFixed ? e.kdTogether.toFixed(2) : e.kdTogether}`;
      const lastLine = `Last Seen: ${last}`;
      const seasonLine = `Season: ${e.seasonMatches}m • Win% ${seasonWinDisplay} • K/D ${seasonKD} • RS ${e.seasonRankScore || '—'}`;

      return '```\n' + headLine + '\n' + togetherLine + '\n' + lastLine + '\n' + seasonLine + '\n```';
    }

    const allyBlocks = allyTop.map((e, i) => formatBlock(e, i, '[With]'));
    const enemyBlocks = enemyTop.map((e, i) => formatBlock(e, i, '[Against]'));

    // * Build embed (ally section first then enemy section if present)
    const embed = new EmbedBuilder()
      .setTitle(`Encounters for ${username}`)
      .setColor(0x2E8B57)
      .setTimestamp();

    const allyHeader = allyBlocks.length ? '**🤝 Played With**\n' : '';
    const enemyHeader = enemyBlocks.length ? '\n**⚔️ Played Against**\n' : '';

    embed.setDescription(allyHeader + allyBlocks.join('\n') + enemyHeader + enemyBlocks.join('\n'));
    embed.setFooter({
      text: `Season ${PUBLIC_SEASON} • Teammates: ${teammates.length} • Enemies: ${enemies.length} • Showing up to ${limit} each`
    });

    await loadingMsg.edit({ content: '', embeds: [embed] }); // * Success: replace loading message
  } catch (e) {
    console.error('❌ Encounters command error:', e); // ! Unexpected failure path
    await loadingMsg.edit('❌ Failed to fetch encounter data. API may have changed.');
  }
}
