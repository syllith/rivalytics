import { EmbedBuilder } from 'discord.js';
import { getHeroesFromResponse, formatShortNumber } from '../utils.js';
import { scrapeJson } from '../browser.js';
import { VERBOSE } from '../config.js';

export async function handleHeroesCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!heroes <username>`');
  const username = args[1];
  if (VERBOSE) console.log(`🔍 Heroes command requested for username: ${username}`);
  const loadingMsg = await message.reply(`🔍 Looking up heroes for **${username}**...`);
  try {
    const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all&season=8`;
    if (VERBOSE) console.log(`📡 Fetching data from: ${url}`);
    const data = await scrapeJson(url);
    if (data.errors?.length) return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
    if (!Array.isArray(data.data)) return loadingMsg.edit('❌ No data returned from API.');
    let heroes = getHeroesFromResponse(data);
    if (data.data.some(seg => seg.attributes?.season)) {
      const filteredSegments = { ...data, data: data.data.filter(seg => seg.attributes?.season === 8) };
      heroes = getHeroesFromResponse(filteredSegments);
    }
    if (!heroes.length) return loadingMsg.edit('❌ No hero statistics found for this user.');
    heroes.sort((a,b)=> b.TimePlayed - a.TimePlayed);
    const embed = new EmbedBuilder().setTitle(`🦸 Hero Stats for ${username}`).setColor(0x00AE86).setTimestamp();
    let description='';
    heroes.slice(0,10).forEach((hero,index)=>{
      const winRate = hero.MatchesPlayed? (hero.MatchesWon/hero.MatchesPlayed)*100:0;
      const kda = hero.Deaths? (hero.Kills+hero.Assists)/hero.Deaths : (hero.Kills+hero.Assists);
      const avgDmg = hero.MatchesPlayed? hero.TotalHeroDamage/hero.MatchesPlayed:0;
      const avgHeal = hero.MatchesPlayed? hero.TotalHeroHeal/hero.MatchesPlayed:0;
      const roleEmoji = hero.Role==='Vanguard'? '🛡️': hero.Role==='Duelist'? '⚔️': hero.Role==='Strategist'? '💚':'🦸';
      description += `${roleEmoji} **${index+1}. ${hero.Name}** (${hero.Role})\n`+
        `⏱️ ${hero.TimePlayed.toFixed(1)}h | 🎮 ${formatShortNumber(hero.MatchesPlayed)} matches\n`+
        `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n`+
        `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg (${formatShortNumber(avgDmg)} avg) | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal (${formatShortNumber(avgHeal)} avg)\n\n`;
    });
    embed.setDescription(description).setFooter({ text: `Showing top ${Math.min(10, heroes.length)} of ${heroes.length} heroes` });
    await loadingMsg.edit({ content:'', embeds:[embed] });
  } catch (e) {
    console.error('❌ Heroes command error:', e);
    await loadingMsg.edit('❌ Failed to fetch hero data. Please check the username and try again.');
  }
}
