import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getHeroesFromResponse, formatShortNumber, scoreToGrade } from '../utils.js';
import { scrapeJson } from '../browser.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';
import { renderHeroesCard } from '../renderers/heroesCard.js';

// * Fetch career segments for a specific season
async function fetchCareerSegments(username, season) {
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${encodeURIComponent(username)}/segments/career?mode=all&season=${season}`;
  if (VERBOSE) console.log(`📡 Fetching data from: ${url}`);
  const data = await scrapeJson(url);
  if (data.errors?.length) throw new Error(data.errors[0].message || 'User not found');
  if (!Array.isArray(data.data)) return [];
  
  let heroes = getHeroesFromResponse(data);
  // If multiple seasons included, filter to explicit requested season
  if (data.data.some(seg => seg.attributes?.season)) {
    const filteredSegments = { ...data, data: data.data.filter(seg => seg.attributes?.season === season) };
    heroes = getHeroesFromResponse(filteredSegments);
  }
  return heroes;
}

// * Handle the !heroes command: show top hero stats for a player
export async function handleHeroesCommand(message, args) {
  //. Require at least a username argument
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!heroes <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Heroes command requested for username: ${username}`);

  // * Provide immediate feedback while data is fetched
  const loadingMsg = await message.reply(`🔍 Looking up heroes for **${username}** (Season ${PUBLIC_SEASON})...`);

  try {
    // Fetch current season first
    let heroes = [];
    try {
      heroes = await fetchCareerSegments(username, CURRENT_SEASON);
    } catch (e) {
      return loadingMsg.edit(`❌ ${e.message}`);
    }

    // If no heroes found in current season, try previous season
    const PREVIOUS_SEASON = CURRENT_SEASON - 1;
    if (!heroes.length && PREVIOUS_SEASON >= 1) {
      if (VERBOSE) console.log(`📡 (heroes) No heroes found in current season, trying previous season ${PREVIOUS_SEASON}`);
      try {
        heroes = await fetchCareerSegments(username, PREVIOUS_SEASON);
      } catch (e) {
        // Non-fatal: previous season might not exist
        if (VERBOSE) console.log(`⚠️ Could not fetch previous season heroes: ${e.message}`);
      }
    }

    if (!heroes.length) return loadingMsg.edit('❌ No hero statistics found for this user.');

    // Sort by time played descending so most used heroes appear first
    heroes.sort((a, b) => b.TimePlayed - a.TimePlayed);

    // Try image card rendering first
    try {
      const png = renderHeroesCard({ username, season: PUBLIC_SEASON, heroes });
      const attachment = new AttachmentBuilder(png, { name: `heroes_${username}.png` });
      await loadingMsg.edit({ content: '', embeds: [], files: [attachment] });
    } catch (imageErr) {
      console.warn('⚠️ Heroes image render failed, falling back to embed:', imageErr.message);
      const embed = new EmbedBuilder()
        .setTitle(`🦸 Hero Stats (S${PUBLIC_SEASON}) for ${username}`)
        .setColor(0x00AE86)
        .setTimestamp();
      let description = '';
      heroes.slice(0, 10).forEach((hero, index) => {
        const winRate = hero.MatchesPlayed ? (hero.MatchesWon / hero.MatchesPlayed) * 100 : 0;
        const kda = hero.Deaths ? (hero.Kills + hero.Assists) / hero.Deaths : (hero.Kills + hero.Assists);
        const avgDmg = hero.MatchesPlayed ? hero.TotalHeroDamage / hero.MatchesPlayed : 0;
        const avgHeal = hero.MatchesPlayed ? hero.TotalHeroHeal / hero.MatchesPlayed : 0;
  const eff = hero.Effectiveness ?? 0;
  const grade = scoreToGrade(eff);
        const roleEmoji = hero.Role === 'Vanguard'
          ? '🛡️'
          : hero.Role === 'Duelist'
            ? '⚔️'
            : hero.Role === 'Strategist'
              ? '💚'
              : '🦸';
        description += `${roleEmoji} **${index + 1}. ${hero.Name}** (${hero.Role})\n` +
          `⏱️ ${hero.TimePlayed.toFixed(1)}h | 🎮 ${formatShortNumber(hero.MatchesPlayed)} matches | 📊 Eff: ${eff.toFixed(0)} (${grade})\n` +
          `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n` +
          `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal\n\n`;
      });
      embed.setDescription(description)
        .setFooter({ text: `Showing top ${Math.min(10, heroes.length)} of ${heroes.length} heroes` });
      await loadingMsg.edit({ content: '', embeds: [embed] });
    }
  } catch (e) {
    console.error('❌ Heroes command error:', e); // ! Unexpected failure
    await loadingMsg.edit('❌ Failed to fetch hero data. Please check the username and try again.');
  }
}
