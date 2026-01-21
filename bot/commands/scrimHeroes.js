import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { formatShortNumber, computeEffectiveness } from '../utils.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';
import { renderScrimHeroesCard } from '../renderers/scrimHeroesCard.js';

// Scrim mode names - tracker.gg now distinguishes between tournament customs ("Unknown") and regular customs ("Custom Game")
const SCRIM_MODE_NAMES = ['unknown', 'custom game'];

// * Compute hero stats directly from scrim match data (NOT from career segments which include all modes)
function computeHeroStatsFromMatches(scrimMatches) {
  const heroMap = {};
  
  for (const match of scrimMatches) {
    const overviewSeg = match.segments?.find(seg => seg.type === 'overview');
    if (!overviewSeg) continue;
    
    const heroesInMatch = overviewSeg.metadata?.heroes || [];
    const stats = overviewSeg.stats || {};
    const result = overviewSeg.metadata?.result?.toLowerCase();
    const isWin = result === 'win';
    
    // Match-level stats to distribute across heroes played
    const heroCount = heroesInMatch.length || 1;
    const matchTimeSec = (stats.timePlayed?.value || 0) / 1000; // API returns ms
    
    for (const hero of heroesInMatch) {
      const heroName = hero?.name;
      if (!heroName) continue;
      
      // Get role from hero imageUrl pattern or default to unknown
      // We'll try to infer role later from other data
      if (!heroMap[heroName]) {
        heroMap[heroName] = {
          Name: heroName,
          Role: 'Unknown', // Will be updated if we can determine it
          TimePlayed: 0, // in hours
          MatchesPlayed: 0,
          MatchesWon: 0,
          Kills: 0,
          Deaths: 0,
          Assists: 0,
          TotalHeroDamage: 0,
          TotalHeroHeal: 0,
          TotalHeroDamagePerMinute: 0,
          TotalHeroHealPerMinute: 0,
          TotalDamageTaken: 0,
          MainAttacks: 0,
          MainAttackHits: 0,
          HeadKills: 0,
          SoloKills: 0,
          SurvivalKills: 0,
          _timePlayedMin: 0, // internal for calculating per-min stats
        };
      }
      
      const h = heroMap[heroName];
      
      // Distribute match stats proportionally across heroes played in that match
      // This is an approximation since the API doesn't give per-hero per-match breakdowns for overview
      const fraction = 1 / heroCount;
      
      h.MatchesPlayed += fraction;
      if (isWin) h.MatchesWon += fraction;
      h.TimePlayed += (matchTimeSec / 3600) * fraction;
      h._timePlayedMin += (matchTimeSec / 60) * fraction;
      
      // Combat stats - distribute proportionally
      h.Kills += (stats.kills?.value || 0) * fraction;
      h.Deaths += (stats.deaths?.value || 0) * fraction;
      h.Assists += (stats.assists?.value || 0) * fraction;
      h.TotalHeroDamage += (stats.totalHeroDamage?.value || 0) * fraction;
      h.TotalHeroHeal += (stats.totalHeroHeal?.value || 0) * fraction;
      h.TotalDamageTaken += (stats.totalDamageTaken?.value || 0) * fraction;
      h.HeadKills += (stats.headKills?.value || 0) * fraction;
      h.SoloKills += (stats.soloKills?.value || 0) * fraction;
      h.SurvivalKills += (stats.maxSurvivalKills?.value || 0) * fraction;
    }
  }
  
  // Calculate per-minute stats and finalize
  const heroes = Object.values(heroMap).map(h => {
    const timeMin = h._timePlayedMin || 1;
    h.TotalHeroDamagePerMinute = h.TotalHeroDamage / timeMin;
    h.TotalHeroHealPerMinute = h.TotalHeroHeal / timeMin;
    delete h._timePlayedMin;
    h.Effectiveness = computeEffectiveness(h);
    return h;
  });
  
  return heroes;
}

// * Try to determine hero roles from career data if available
async function enrichHeroRoles(heroes, username) {
  try {
    const heroesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${encodeURIComponent(username)}/segments/career?mode=all&season=${CURRENT_SEASON}`;
    const heroesResp = await scrapeJson(heroesUrl);
    if (!heroesResp?.data) return;
    
    const roleMap = {};
    heroesResp.data.forEach(seg => {
      if (seg.type === 'hero' && seg.metadata?.name && seg.attributes?.role) {
        const role = seg.attributes.role[0].toUpperCase() + seg.attributes.role.slice(1);
        roleMap[seg.metadata.name] = role;
      }
    });
    
    heroes.forEach(h => {
      if (roleMap[h.Name]) {
        h.Role = roleMap[h.Name];
      }
    });
  } catch (e) {
    if (VERBOSE) console.log('⚠️ Could not enrich hero roles:', e.message);
  }
}

// * Handle the !scrimheroes command: list hero stats for heroes ONLY from scrim/custom matches
export async function handleScrimHeroesCommand(message, args) {
  //. Require username
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!scrimheroes <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Scrim Heroes command requested for username: ${username}`);

  // * Loading indicator while we gather match + hero data
  const loadingMsg = await message.reply(`🔍 Gathering scrim heroes for **${username}** (Season ${PUBLIC_SEASON})...`);

  try {
    // 1) Paginate recent matches to find scrim/custom matches only
    const MAX_SOURCE_PAGES = 10; // allow deeper scan for older scrims
    const TARGET_MATCHES = 50; // target number of scrim matches to gather
    let nextCursor = null;
    let scrimMatches = [];
    
    // Helper to fetch matches for a specific season
    async function fetchScrimMatchesForSeason(season, existingMatches) {
      let cursor = null;
      let matches = [...existingMatches];
      for (let page = 0; page < MAX_SOURCE_PAGES; page++) {
        const cursorParam = cursor ? `&next=${encodeURIComponent(cursor)}` : '';
        const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${encodeURIComponent(username)}?season=${season}${cursorParam}`;
        if (VERBOSE) console.log(`📡 (scrimHeroes) Fetching: ${matchesUrl}`);
        const matchesResp = await scrapeJson(matchesUrl);
        if (matchesResp.errors?.length) throw new Error(matchesResp.errors[0].message || 'User not found');
        const batch = (matchesResp.data?.matches || []).filter(m => {
          const modeName = (m.metadata?.modeName || '').trim().toLowerCase();
          return SCRIM_MODE_NAMES.includes(modeName);
        });
        if (batch.length) matches = matches.concat(batch);
        cursor = matchesResp.data?.metadata?.next || null;
        if (!cursor || matches.length >= TARGET_MATCHES) break;
      }
      return matches;
    }
    
    // Fetch from current season first
    try {
      scrimMatches = await fetchScrimMatchesForSeason(CURRENT_SEASON, []);
    } catch (e) {
      return loadingMsg.edit(`❌ ${e.message}`);
    }
    
    // If we still need more matches, try previous season
    const PREVIOUS_SEASON = CURRENT_SEASON - 1;
    if (scrimMatches.length < TARGET_MATCHES && PREVIOUS_SEASON >= 1) {
      if (VERBOSE) console.log(`📡 (scrimHeroes) Current season has ${scrimMatches.length}/${TARGET_MATCHES} matches, fetching from previous season ${PREVIOUS_SEASON}`);
      try {
        scrimMatches = await fetchScrimMatchesForSeason(PREVIOUS_SEASON, scrimMatches);
      } catch (e) {
        // Non-fatal: previous season data might not exist, continue with what we have
        if (VERBOSE) console.log(`⚠️ Could not fetch previous season scrim matches: ${e.message}`);
      }
    }
    
    if (!scrimMatches.length) return loadingMsg.edit(`❌ No scrim/custom matches found for this user after scanning up to ${MAX_SOURCE_PAGES} pages.`);

    // 2) Compute hero stats directly from scrim match data (NOT career segments)
    const scrimHeroes = computeHeroStatsFromMatches(scrimMatches);
    if (!scrimHeroes.length) return loadingMsg.edit('❌ No heroes recorded in scrim matches.');
    
    // 3) Try to enrich with role information from career data
    await enrichHeroRoles(scrimHeroes, username);
    
    const filteredSeason = scrimHeroes;

    // Order by time played (season totals) and take top 10
    filteredSeason.sort((a, b) => b.TimePlayed - a.TimePlayed);
    const top = filteredSeason.slice(0, 10);

    // Try canvas card first
    try {
      const png = renderScrimHeroesCard({ username, season: PUBLIC_SEASON, heroes: top, scrimMatchCount: scrimMatches.length });
      const attachment = new AttachmentBuilder(png, { name: `scrim_heroes_${username}.png` });
      await loadingMsg.edit({ content: '', files: [attachment] });
      return;
    } catch (cardErr) {
      if (VERBOSE) console.warn('⚠️ scrimHeroes card render failed, falling back to embed:', cardErr.message);
    }

    // Fallback embed
    const embed = new EmbedBuilder()
      .setTitle(`🦸 Scrim-Only Hero Stats (S${PUBLIC_SEASON}) for ${username}`)
      .setColor(0x8A2BE2)
      .setTimestamp();
    let description = `Stats computed from **${scrimMatches.length} scrim/custom matches only** (Season ${PUBLIC_SEASON}). Excludes competitive/ranked play.\n\n`;
    top.forEach((hero, idx) => {
      const winRate = hero.MatchesPlayed ? (hero.MatchesWon / hero.MatchesPlayed) * 100 : 0;
      const kda = hero.Deaths ? (hero.Kills + hero.Assists) / hero.Deaths : (hero.Kills + hero.Assists);
      const avgDmg = hero.MatchesPlayed ? hero.TotalHeroDamage / hero.MatchesPlayed : 0;
      const avgHeal = hero.MatchesPlayed ? hero.TotalHeroHeal / hero.MatchesPlayed : 0;
      const roleEmoji = hero.Role === 'Vanguard' ? '🛡️' : hero.Role === 'Duelist' ? '⚔️' : hero.Role === 'Strategist' ? '💚' : '🦸';
      description += `${roleEmoji} **${idx + 1}. ${hero.Name}** (${hero.Role})\n` +
        `🎮 ${hero.MatchesPlayed.toFixed(1)} matches | ⏱️ ${hero.TimePlayed.toFixed(1)}h\n` +
        `📈 ${winRate.toFixed(1)}% WR | 💀 ${Math.round(hero.Kills)}/${Math.round(hero.Deaths)} (${kda.toFixed(2)} KDA)\n` +
        `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal\n` +
        `Avg: ${formatShortNumber(avgDmg)} dmg • ${formatShortNumber(avgHeal)} heal\n\n`;
    });
    embed.setDescription(description).setFooter({ text: `Showing ${top.length} of ${filteredSeason.length} heroes (Scrim-only stats) • Fallback embed` });
    await loadingMsg.edit({ content: '', embeds: [embed] });
  } catch (e) {
    console.error('❌ Scrim Heroes command error:', e); // ! Unexpected failure
    await loadingMsg.edit('❌ Failed to fetch scrim hero stats. Please try again later.');
  }
}
