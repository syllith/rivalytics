import { EmbedBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { formatShortNumber } from '../utils.js';
import { VERBOSE } from '../config.js';

export async function handleTournCommand(message, args) {
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!tourn <username>`');
  const username = args[1];
  if (VERBOSE) console.log(`🔍 Tournament command requested for username: ${username}`);
  const loadingMsg = await message.reply(`🔍 Looking up Season 8 tournament matches for **${username}**...`);
  try {
    const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=8`;
    if (VERBOSE) console.log(`📡 Fetching matches (tournament, Season 8) from: ${url}`);
    const data = await scrapeJson(url);
    if (data.errors?.length) return loadingMsg.edit(`❌ ${data.errors[0].message || 'User not found'}`);
    const allMatches = data.data?.matches || [];
    const tournMatches = allMatches.filter(m=> (m.metadata?.modeName || '').trim().toLowerCase() === 'tournament');
    if (!tournMatches.length) return loadingMsg.edit('❌ No recent Tournament matches found.');
    const slice = tournMatches.slice(0,10);
    let wins=0, losses=0, totalDamage=0, totalKills=0, totalDeaths=0; const fields=[];
    slice.forEach((match,index)=>{
      const meta = match.metadata || {}; const ts = meta.timestamp? new Date(meta.timestamp): null;
      const overview = match.segments?.find(seg=> seg.type==='overview'); const stats = overview?.stats || {}; const overviewMeta = overview?.metadata || {};
      const resultRaw = (overviewMeta.result || 'unknown').toLowerCase(); if (resultRaw==='win') wins++; else if (resultRaw==='loss') losses++;
      const emoji = resultRaw==='win'? '🟢': resultRaw==='loss'? '🔴':'⚪';
      const kills = stats.kills?.value || 0; const deaths = stats.deaths?.value || 0; totalKills+=kills; totalDeaths+=deaths;
      const dmgVal = stats.totalHeroDamage?.value || 0; totalDamage += dmgVal;
      const durationRaw = stats.timePlayed?.displayValue || ''; const duration = durationRaw.includes('m')? durationRaw.replace(/(\d+)m (\d+)s/,'$1:$2'): (durationRaw || '?:??');
      const mapName = meta.mapName || 'Unknown'; const heroObjs = overviewMeta.heroes?.slice(0,3) || []; const heroesLine = heroObjs.length? heroObjs.map(h=>h.name).join(', '): '—';
      const timeCol = ts? ts.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}): '??:??';
      const dateCol = ts? ts.toLocaleDateString('en-US',{month:'numeric',day:'numeric'}): '--/--';
      const kdRatio = deaths>0? (kills/deaths).toFixed(2): kills.toFixed(2);
      const name = `${index+1}. ${emoji} ${resultRaw==='win'? 'Win': resultRaw==='loss'? 'Loss':'—'} • ${mapName}`.slice(0,256);
      const valueLines = [
        `🕒 ${dateCol} ${timeCol} | ⏱ ${duration}`,
        `💀 ${kills}/${deaths} (K/D ${kdRatio})`,
        `💥 ${formatShortNumber(dmgVal)}`,
        `🦸 ${heroesLine}`,
        `🎬 Replay: ${meta.replayId || 'N/A'}`
      ];
      fields.push({ name, value: valueLines.join('\n').slice(0,1024), inline:true });
    });
    const avgDamage = slice.length? (totalDamage/slice.length):0; const avgKD = totalDeaths>0? (totalKills/totalDeaths): totalKills;
    const embed = new EmbedBuilder().setTitle(`🏟️ Tournament Matches (S8) for ${username}`).setColor(0xC71585).setTimestamp();
    embed.setDescription(`Wins: ${wins} • Losses: ${losses} • WinRate: ${(slice.length? (wins/slice.length*100).toFixed(1):'0.0')}%\nAvg Damage: ${formatShortNumber(avgDamage)} • Avg K/D: ${avgKD.toFixed(2)}`);
    fields.slice(0,25).forEach(f=> embed.addFields(f));
    embed.setFooter({ text: `Season 8 • Showing last ${slice.length} Tournament matches • ${new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}` });
    await loadingMsg.edit({ content:'', embeds:[embed] });
  } catch(e){
    console.error('❌ Tournament command error:', e);
    await loadingMsg.edit('❌ Failed to fetch tournament match data. Please check the username and try again.');
  }
}
