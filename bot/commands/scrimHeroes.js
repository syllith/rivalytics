import { EmbedBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { getHeroesFromResponse, formatShortNumber } from '../utils.js';
import { VERBOSE } from '../config.js';

export async function handleScrimHeroesCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!scrimheroes <username>`');
  const username = args[1];
  if (VERBOSE) console.log(`🔍 Scrim Heroes command requested for username: ${username}`);
  const loadingMsg = await message.reply(`🔍 Gathering scrim heroes for **${username}** (Season 8)...`);
  try {
    const matchesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=8`;
    if (VERBOSE) console.log(`📡 Fetching matches for scrim heroes from: ${matchesUrl}`);
    const matchesResp = await scrapeJson(matchesUrl);
    if (matchesResp.errors?.length) return loadingMsg.edit(`❌ ${matchesResp.errors[0].message || 'User not found'}`);
    const allMatches = matchesResp.data?.matches || [];
    const scrimMatches = allMatches.filter(m=> (m.metadata?.modeName || '').trim().toLowerCase()==='unknown');
    if (!scrimMatches.length) return loadingMsg.edit('❌ No scrim (Unknown mode) matches found for this user in Season 8.');
    const scrimHeroSet = new Set();
    scrimMatches.forEach(match=>{ const overviewSeg = match.segments?.find(seg=>seg.type==='overview'); const heroesArr = overviewSeg?.metadata?.heroes || []; heroesArr.forEach(h=>{ if (h?.name) scrimHeroSet.add(h.name); }); });
    if (!scrimHeroSet.size) return loadingMsg.edit('❌ No heroes recorded in scrim matches.');
    const heroesUrl = `https://api.tracker.gg/api/v2/marvel-rivals/standard/profile/ign/${username}/segments/career?mode=all&season=8`;
    let seasonHeroes=[]; try { const heroesResp = await scrapeJson(heroesUrl); let allHeroStats = getHeroesFromResponse(heroesResp); if (heroesResp.data?.some(seg=> seg.attributes?.season)) { const filteredSegments = { ...heroesResp, data: heroesResp.data.filter(seg=> seg.attributes?.season===8)}; allHeroStats = getHeroesFromResponse(filteredSegments); } seasonHeroes = allHeroStats; } catch(e){ if (VERBOSE) console.log('⚠️ Failed to fetch season hero stats:', e.message); }
    if (!seasonHeroes.length) return loadingMsg.edit('❌ Could not load season hero statistics.');
    const filteredSeason = seasonHeroes.filter(h=> scrimHeroSet.has(h.Name));
    if (!filteredSeason.length) return loadingMsg.edit('❌ No overlapping heroes between scrim usage and season stats.');
    filteredSeason.sort((a,b)=> b.TimePlayed - a.TimePlayed); const top = filteredSeason.slice(0,10);
    const embed = new EmbedBuilder().setTitle(`🦸 Scrim-Used Hero Season Stats (S8) for ${username}`).setColor(0x8A2BE2).setTimestamp();
    let description = 'These are full Season 8 totals ONLY for heroes you have used in Unknown-mode matches (scrims). Scrim-only per-hero stats are not exposed by the API.\n\n';
    top.forEach((hero,idx)=>{
      const winRate = hero.MatchesPlayed? (hero.MatchesWon/hero.MatchesPlayed)*100:0; const kda = hero.Deaths? (hero.Kills+hero.Assists)/hero.Deaths: (hero.Kills+hero.Assists);
      const avgDmg = hero.MatchesPlayed? hero.TotalHeroDamage/hero.MatchesPlayed:0; const avgHeal = hero.MatchesPlayed? hero.TotalHeroHeal/hero.MatchesPlayed:0;
      const roleEmoji = hero.Role==='Vanguard'? '🛡️': hero.Role==='Duelist'? '⚔️': hero.Role==='Strategist'? '💚':'🦸';
      description += `${roleEmoji} **${idx+1}. ${hero.Name}** (${hero.Role})\n`+
        `🎮 ${formatShortNumber(hero.MatchesPlayed)} matches | ⏱️ ${hero.TimePlayed.toFixed(1)}h\n`+
        `📈 ${winRate.toFixed(1)}% WR | 💀 ${formatShortNumber(hero.Kills)}/${formatShortNumber(hero.Deaths)} (${kda.toFixed(2)} KDA)\n`+
        `💥 ${formatShortNumber(hero.TotalHeroDamage)} dmg (${formatShortNumber(avgDmg)} avg) | 💚 ${formatShortNumber(hero.TotalHeroHeal)} heal (${formatShortNumber(avgHeal)} avg)\n\n`;
    });
    embed.setDescription(description).setFooter({ text: `Showing ${top.length} of ${filteredSeason.length} heroes (Season totals)` });
    await loadingMsg.edit({ content:'', embeds:[embed] });
  } catch (e){
    console.error('❌ Scrim Heroes command error:', e);
    await loadingMsg.edit('❌ Failed to fetch scrim hero stats. Please try again later.');
  }
}
