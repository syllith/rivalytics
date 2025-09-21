import { EmbedBuilder } from 'discord.js';
import { getHeroesFromResponse, formatShortNumber } from '../utils.js';
import { scrapeJson } from '../browser.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';

// * Handle the !heroes command: show top hero stats for a player
export async function handleHeroesCommand(message, args) {
  //. Require at least a username argument
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!heroes <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Heroes command requested for username: ${username}`);

  // * Provide immediate feedback while data is fetched
  const loadingMsg = await message.reply(`🔍 Looking up heroes for **${username}** (Season ${PUBLIC_SEASON})...`);

  try {
    // Career segments (season aware). Currently season hard‑coded (mirrors original logic)
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all&season=${CURRENT_SEASON}`;
    if (VERBOSE) console.log(`📡 Fetching data from: ${url}`);

    const data = await scrapeJson(url);
    if (data.errors?.length) return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`); // ! API error / user missing
    if (!Array.isArray(data.data)) return loadingMsg.edit('❌ No data returned from API.'); // ! Unexpected payload shape

    // Extract hero stat objects (utility consolidates differences in structure)
    let heroes = getHeroesFromResponse(data);

  // If multiple seasons included, filter to explicit internal CURRENT_SEASON (behavior preserved)
    if (data.data.some(seg => seg.attributes?.season)) {
      const filteredSegments = { ...data, data: data.data.filter(seg => seg.attributes?.season === CURRENT_SEASON) };
      heroes = getHeroesFromResponse(filteredSegments);
    }

    if (!heroes.length) return loadingMsg.edit('❌ No hero statistics found for this user.'); // ! Nothing to display

    // Sort by time played descending so most used heroes appear first
    heroes.sort((a, b) => b.TimePlayed - a.TimePlayed);

    const embed = new EmbedBuilder()
      .setTitle(`🦸 Hero Stats (S${PUBLIC_SEASON}) for ${username}`)
      .setColor(0x00AE86)
      .setTimestamp();

    // Build a multiline description listing up to top 10 heroes
    let description = '';
    heroes.slice(0, 10).forEach((hero, index) => {
      const winRate = hero.MatchesPlayed ? (hero.MatchesWon / hero.MatchesPlayed) * 100 : 0;
      const kda = hero.Deaths ? (hero.Kills + hero.Assists) / hero.Deaths : (hero.Kills + hero.Assists);
      const avgDmg = hero.MatchesPlayed ? hero.TotalHeroDamage / hero.MatchesPlayed : 0;
      const avgHeal = hero.MatchesPlayed ? hero.TotalHeroHeal / hero.MatchesPlayed : 0;

      const roleEmoji = hero.Role === 'Vanguard'
        ? '🛡️'
        : hero.Role === 'Duelist'
          ? '⚔️'
          : hero.Role === 'Strategist'
            ? '💚'
            : '🦸';

      description += `${roleEmoji} **${index + 1}. ${hero.Name}** (${hero.Role})\n` +
        `⏱️ ${hero.TimePlayed.toFixed(1)}h | 🎮 ${formatShortNumber(hero.MatchesPlayed)} matches\n` +
        `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n` +
        `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg (${formatShortNumber(avgDmg)} avg) | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal (${formatShortNumber(avgHeal)} avg)\n\n`;
    });

    embed
      .setDescription(description)
      .setFooter({ text: `Showing top ${Math.min(10, heroes.length)} of ${heroes.length} heroes` });

    await loadingMsg.edit({ content: '', embeds: [embed] }); // * Success path
  } catch (e) {
    console.error('❌ Heroes command error:', e); // ! Unexpected failure
    await loadingMsg.edit('❌ Failed to fetch hero data. Please check the username and try again.');
  }
}
