import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { formatShortNumber } from '../utils.js';
import { renderScrimsCard } from '../renderers/scrimsCard.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';

// NOTE: Pagination removed per new requirements. We now aggregate all scrim (Unknown mode) matches
// across a limited number of backend pages and render them in a single embed similar to !matches.
// We also provide numbered buttons (1..n) that allow a user to copy replay IDs ephemerally.

// * Fetch a single page of matches (optionally with next cursor)
async function fetchMatchPage(username, nextCursor = null) {
  const cursorParam = nextCursor ? `&next=${encodeURIComponent(nextCursor)}` : '';
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=${CURRENT_SEASON}${cursorParam}`;
  if (VERBOSE) console.log(`📡 (scrims) Fetching: ${url}`);
  const data = await scrapeJson(url);
  if (data.errors?.length) throw new Error(data.errors[0].message || 'API error');
  const matches = data.data?.matches || [];
  const cursorNext = data.data?.metadata?.next || null; // tracker.gg uses metadata.next for pagination
  return { matches, cursorNext };
}

// * Convert raw matches -> only unknown mode matches
function extractUnknown(matches) {
  return matches.filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'unknown');
}

// * Handle the !scrims command: list recent matches where modeName === 'Unknown'
export async function handleScrimsCommand(message, args) {
  //. Need username argument
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!scrims <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Scrims command requested for username: ${username}`);

  const loadingMsg = await message.reply(`🔍 Aggregating scrim (Unknown mode) matches for **${username}** (Season ${PUBLIC_SEASON})...`);
  try {
    const MAX_SOURCE_PAGES = 8; // backend pages to scan
    const TARGET_MATCHES = 15; // we only want the last 15 scrim matches
    let collected = [];
    let cursor = null;
    for (let i = 0; i < MAX_SOURCE_PAGES; i++) {
      const { matches: rawMatches, cursorNext } = await fetchMatchPage(username, cursor);
      const unknown = extractUnknown(rawMatches);
      if (unknown.length) collected = collected.concat(unknown);
      if (!cursorNext || collected.length >= TARGET_MATCHES) break; // stop once we have enough
      cursor = cursorNext;
    }
    if (!collected.length) return loadingMsg.edit('❌ No recent Unknown-mode (scrim) matches found within scanned range.');

    // Prepare structured rows for canvas renderer
    let wins = 0, losses = 0, totalDamage = 0, totalKills = 0, totalDeaths = 0;
    const cardRows = [];
    const LIMIT_FOR_CARD = TARGET_MATCHES; // 15 rows on card
    replayCache.set(loadingMsg.id, []);
    collected.slice(0, LIMIT_FOR_CARD).forEach((match, idx) => {
      const meta = match.metadata || {};
      const overview = match.segments?.find(s => s.type === 'overview');
      const stats = overview?.stats || {};
      const overviewMeta = overview?.metadata || {};
      const resultRaw = (overviewMeta.result || 'unknown').toLowerCase();
      if (resultRaw === 'win') wins++; else if (resultRaw === 'loss') losses++;
      const resultEmoji = resultRaw === 'win' ? '🟢' : resultRaw === 'loss' ? '🔴' : '⚪';
      const kills = stats.kills?.value || 0;
      const deaths = stats.deaths?.value || 0;
      totalKills += kills; totalDeaths += deaths;
      const damage = stats.totalHeroDamage?.value || 0; totalDamage += damage;
      const durationRaw = stats.timePlayed?.displayValue || '';
      const duration = durationRaw ? durationRaw.replace(/(\d+)m (\d+)s/, '$1:$2').replace('s', '') : '?:??';
      const mapName = meta.mapName || 'Unknown';
      const replayId = meta.replayId || overviewMeta.replayId || match.attributes?.id || '';
      const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
      const heroes = overviewMeta.heroes?.slice(0, 3).map(h => h.name).join(', ') || '';
      if (replayId) replayCache.get(loadingMsg.id).push(replayId);
      cardRows.push({
        index: idx + 1,
        mapName,
        resultEmoji,
        kills,
        deaths,
        kd,
        damage,
        duration,
        heroes,
        replay: replayId ? replayId.slice(-6) : '',
        timestamp: meta.timestamp || null
      });
    });

    // Stats for fallback embed & potential future header
    const totalMatches = Math.min(collected.length, TARGET_MATCHES);
    const winRate = totalMatches ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';
    const avgDmg = totalMatches ? formatShortNumber(totalDamage / Math.min(totalMatches, cardRows.length)) : '0';
    const avgKD = totalDeaths ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2);

    // Attempt canvas render first
    try {
      const png = renderScrimsCard({ username, season: PUBLIC_SEASON, rows: cardRows });
      const attachmentName = `scrims_${username}.png`;
      const attachment = new AttachmentBuilder(png, { name: attachmentName });

      // Replay buttons correspond exactly to rendered rows
      const replayIds = replayCache.get(loadingMsg.id);
      const buttons = replayIds.slice(0, cardRows.length).map((_, i) => new ButtonBuilder()
        .setCustomId(`scrimreplay_${loadingMsg.id}_${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary));
      const rowsComponents = [];
      for (let i = 0; i < buttons.length; i += 5) rowsComponents.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      await loadingMsg.edit({ content: '', embeds: [], files: [attachment], components: rowsComponents });
    } catch (cardErr) {
      console.warn('⚠️ Scrims image render failed, falling back to embed:', cardErr.message);
      const embed = new EmbedBuilder()
        .setTitle(`🎮 Scrim Matches (S${PUBLIC_SEASON}) for ${username}`)
        .setColor(0x4B7BEC)
        .setTimestamp();
      embed.setDescription(`Matches: ${totalMatches} • Wins: ${wins} • Losses: ${losses} • WinRate: ${winRate}%\nAvg Damage: ${avgDmg} • Avg K/D: ${avgKD}` + '\n\n' + cardRows.map(r => `• ${r.index}. ${r.resultEmoji} ${r.mapName} • ${r.kills}/${r.deaths} (K/D ${r.kd}) • ${formatShortNumber(r.damage)} dmg • ${r.duration}${r.heroes ? ' • ' + r.heroes : ''}${r.replay ? ' • 🔁 ' + r.replay : ''}`).join('\n'))
        .setFooter({ text: `Showing ${cardRows.length} scrim matches (Unknown mode)` });
      // Build buttons using replayCache
      const replayIds = replayCache.get(loadingMsg.id);
      const buttons = replayIds.slice(0, cardRows.length).map((_, i) => new ButtonBuilder()
        .setCustomId(`scrimreplay_${loadingMsg.id}_${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary));
      const rowsComponents = [];
      for (let i = 0; i < buttons.length; i += 5) rowsComponents.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      await loadingMsg.edit({ content: '', embeds: [embed], components: rowsComponents });
    }
  } catch (e) {
    console.error('❌ Scrims command error:', e);
    const msg = (e && e.message) ? e.message : '';
    //. Detect private profile status surfaced by upstream API (exact token 'Private')
    if (/private/i.test(msg)) {
      await loadingMsg.edit('🔒 This profile appears to be **Private** – match history is hidden. Ask the user to enable public match data on Tracker.gg and try again.');
      return;
    }
    await loadingMsg.edit('❌ Failed to fetch scrim match data. Please check the username or try again later.');
  }
}
// In-memory replay cache for scrims (messageId -> replayId[])
const replayCache = new Map();

// * Interaction handler for scrim replay buttons
export async function handleScrimsInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('scrimreplay_')) return false;
  const parts = interaction.customId.split('_');
  const messageId = parts[1];
  const idx = parseInt(parts[2], 10);
  const list = replayCache.get(messageId);
  if (!list) {
    try { await interaction.reply({ content: '⏰ Replay buttons expired.', ephemeral: true }); } catch (_) { }
    return true;
  }
  const replayId = list[idx];
  if (!replayId) {
    try { await interaction.reply({ content: '❌ Replay unavailable.', ephemeral: true }); } catch (_) { }
    return true;
  }
  try {
    await interaction.reply({ content: `🎬 Scrim Replay ID (Match ${idx + 1}): ${replayId}`, ephemeral: true });
  } catch (e) {
    try { await interaction.followUp({ content: `🎬 Scrim Replay ID (Match ${idx + 1}): ${replayId}`, ephemeral: true }); } catch (_) { }
  }
  return true;
}
