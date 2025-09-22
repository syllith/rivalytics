import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { getHeroesFromResponse, formatShortNumber } from '../utils.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';
import { renderScrimHeroesCard } from '../renderers/scrimHeroesCard.js';

// * Handle the !scrimheroes command: list season hero stats for heroes actually used in scrim (Unknown mode) matches
export async function handleScrimHeroesCommand(message, args) {
  //. Require username
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!scrimheroes <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Scrim Heroes command requested for username: ${username}`);

  // * Loading indicator while we gather match + hero data
  const loadingMsg = await message.reply(`🔍 Gathering scrim heroes for **${username}** (Season ${PUBLIC_SEASON})...`);

  try {
    // 1) Paginate recent matches to discover which heroes appear in Unknown mode (scrims)
    const MAX_SOURCE_PAGES = 10; // allow deeper scan for older scrims
    let nextCursor = null;
    let scrimMatches = [];
    for (let page = 0; page < MAX_SOURCE_PAGES; page++) {
      const cursorParam = nextCursor ? `&next=${encodeURIComponent(nextCursor)}` : '';
      const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=${CURRENT_SEASON}${cursorParam}`;
      if (VERBOSE) console.log(`📡 (scrimHeroes) Fetching: ${matchesUrl}`);
      const matchesResp = await scrapeJson(matchesUrl);
      if (matchesResp.errors?.length) return loadingMsg.edit(`❌ ${matchesResp.errors[0].message || 'User not found'}`);
      const batch = (matchesResp.data?.matches || []).filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'unknown');
      if (batch.length) scrimMatches = scrimMatches.concat(batch);
      nextCursor = matchesResp.data?.metadata?.next || null;
      if (!nextCursor || scrimMatches.length >= 25) break; // enough sample or no more pages
    }
    if (!scrimMatches.length) return loadingMsg.edit(`❌ No scrim (Unknown mode) matches found for this user in Season ${PUBLIC_SEASON} after scanning up to ${MAX_SOURCE_PAGES} pages.`);

    // Collect unique hero names used in scrim matches (from overview metadata.heroes)
    const scrimHeroSet = new Set();
    scrimMatches.forEach(match => {
      const overviewSeg = match.segments?.find(seg => seg.type === 'overview');
      const heroesArr = overviewSeg?.metadata?.heroes || [];
      heroesArr.forEach(h => { if (h?.name) scrimHeroSet.add(h.name); });
    });
    if (!scrimHeroSet.size) return loadingMsg.edit('❌ No heroes recorded in scrim matches.'); // ! No hero metadata available

    // 2) Fetch season-wide career hero stats (will filter to just scrim heroes)
    const heroesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all&season=${CURRENT_SEASON}`;
    let seasonHeroes = [];
    try {
      const heroesResp = await scrapeJson(heroesUrl);
      let allHeroStats = getHeroesFromResponse(heroesResp);
      // Filter to internal CURRENT_SEASON segments if multi-season present
      if (heroesResp.data?.some(seg => seg.attributes?.season)) {
        const filteredSegments = { ...heroesResp, data: heroesResp.data.filter(seg => seg.attributes?.season === CURRENT_SEASON) };
        allHeroStats = getHeroesFromResponse(filteredSegments);
      }
      seasonHeroes = allHeroStats;
    } catch (e) {
      if (VERBOSE) console.log('⚠️ Failed to fetch season hero stats:', e.message); // ! Non-fatal; will error out below if empty
    }

    if (!seasonHeroes.length) return loadingMsg.edit('❌ Could not load season hero statistics.');

    // Intersection: only heroes used in scrims
    const filteredSeason = seasonHeroes.filter(h => scrimHeroSet.has(h.Name));
    if (!filteredSeason.length) return loadingMsg.edit('❌ No overlapping heroes between scrim usage and season stats.');

    // Order by time played (season totals) and take top 10
    filteredSeason.sort((a, b) => b.TimePlayed - a.TimePlayed);
    const top = filteredSeason.slice(0, 10);

    // Try canvas card first
    try {
      const png = renderScrimHeroesCard({ username, season: PUBLIC_SEASON, heroes: top });
      const attachment = new AttachmentBuilder(png, { name: `scrim_heroes_${username}.png` });
      await loadingMsg.edit({ content: '', files: [attachment] });
      return;
    } catch (cardErr) {
      if (VERBOSE) console.warn('⚠️ scrimHeroes card render failed, falling back to embed:', cardErr.message);
    }

    // Fallback embed
    const embed = new EmbedBuilder()
      .setTitle(`🦸 Scrim-Used Hero Season Stats (S${PUBLIC_SEASON}) for ${username}`)
      .setColor(0x8A2BE2)
      .setTimestamp();
    let description = `These are full Season ${PUBLIC_SEASON} totals ONLY for heroes used in scrim matches. Scrim-only per-hero stats are not exposed by the API.\n\n`;
    top.forEach((hero, idx) => {
      const winRate = hero.MatchesPlayed ? (hero.MatchesWon / hero.MatchesPlayed) * 100 : 0;
      const kda = hero.Deaths ? (hero.Kills + hero.Assists) / hero.Deaths : (hero.Kills + hero.Assists);
      const avgDmg = hero.MatchesPlayed ? hero.TotalHeroDamage / hero.MatchesPlayed : 0;
      const avgHeal = hero.MatchesPlayed ? hero.TotalHeroHeal / hero.MatchesPlayed : 0;
      const roleEmoji = hero.Role === 'Vanguard' ? '🛡️' : hero.Role === 'Duelist' ? '⚔️' : hero.Role === 'Strategist' ? '💚' : '🦸';
      description += `${roleEmoji} **${idx + 1}. ${hero.Name}** (${hero.Role})\n` +
        `🎮 ${formatShortNumber(hero.MatchesPlayed)} matches | ⏱️ ${hero.TimePlayed.toFixed(1)}h\n` +
        `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n` +
        `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal\n` +
        `Avg: ${formatShortNumber(avgDmg)} dmg • ${formatShortNumber(avgHeal)} heal\n\n`;
    });
    embed.setDescription(description).setFooter({ text: `Showing ${top.length} of ${filteredSeason.length} heroes (Season ${PUBLIC_SEASON} totals) • Fallback embed` });
    await loadingMsg.edit({ content: '', embeds: [embed] });
  } catch (e) {
    console.error('❌ Scrim Heroes command error:', e); // ! Unexpected failure
    await loadingMsg.edit('❌ Failed to fetch scrim hero stats. Please try again later.');
  }
}
