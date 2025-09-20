import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { scrapeJson } from '../browser.js';
import { formatShortNumber } from '../utils.js';
import { VERBOSE } from '../config.js';
import { initPagination, appendPage, getEntry, setCurrentPage, buildDisabledState } from '../pagination.js';

// * Fetch a single page of matches (optionally with next cursor)
async function fetchMatchPage(username, nextCursor = null) {
  const cursorParam = nextCursor ? `&next=${encodeURIComponent(nextCursor)}` : '';
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${username}?season=8${cursorParam}`;
  if (VERBOSE) console.log(`📡 (scrims) Fetching: ${url}`);
  const data = await scrapeJson(url);
  if (data.errors?.length) throw new Error(data.errors[0].message || 'API error');
  const matches = data.data?.matches || [];
  const cursorNext = data.data?.metadata?.next || null; // tracker.gg uses metadata.next for pagination
  return { matches, cursorNext };
}

// * Convert raw matches -> only unknown mode matches enriched with derived stats
function extractUnknown(matches) {
  return matches.filter(m => (m.metadata?.modeName || '').trim().toLowerCase() === 'unknown');
}

// * Build an embed for a page object (pageIdx inside pagination entry)
function buildEmbed(username, pageIdx, page, totalPages) {
  const displayMatches = page.matches;
  const embed = new EmbedBuilder()
    .setTitle(`🎮 Scrim Matches for ${username}`)
    .setColor(0x4B7BEC)
    .setTimestamp();

  let wins = 0, losses = 0, totalDamage = 0, totalKills = 0, totalDeaths = 0;
  const fields = [];

  displayMatches.forEach((match, index) => {
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

  const matchCount = displayMatches.length || 1;
  const avgDamage = totalDamage / matchCount;
  const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths) : totalKills;
  embed.setDescription(`Page ${pageIdx + 1}/${totalPages} • Matches: ${displayMatches.length}\nWins: ${wins} • Losses: ${losses} • WinRate: ${displayMatches.length ? ((wins / displayMatches.length) * 100).toFixed(1) : '0.0'}%\nAvg Damage: ${formatShortNumber(avgDamage)} • Avg K/D: ${avgKD.toFixed(2)}`);
  fields.slice(0, 25).forEach(f => embed.addFields(f));
  embed.setFooter({ text: `Showing scrim (unknown) mode matches • ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` });
  return embed;
}

function buildComponents(entry) {
  const state = buildDisabledState(entry);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrims_prev_${entry.currentPage}`).setLabel('Prev').setStyle(ButtonStyle.Primary).setDisabled(state.prev),
    new ButtonBuilder().setCustomId(`scrims_next_${entry.currentPage}`).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(state.next),
    new ButtonBuilder().setCustomId('scrims_close').setLabel('✖ Close').setStyle(ButtonStyle.Danger)
  )];
}

// * Handle the !scrims command: list recent matches where modeName === 'Unknown'
export async function handleScrimsCommand(message, args) {
  //. Need username argument
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!scrims <username>`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Scrims command requested for username: ${username}`);

  // * Initial feedback
  const loadingMsg = await message.reply(`🔍 Looking up scrim (unknown mode) matches for **${username}**... (fetching)\nThis may take a moment while I scan pages for scrim matches.`);
  try {
    // Prefetch up to N tracker pages until we have some unknown matches (scrims)
    const MAX_SOURCE_PAGES = 5; // configurable
    let collectedUnknown = [];
    let cursor = null;
    let lastCursor = null;
    for (let i = 0; i < MAX_SOURCE_PAGES; i++) {
      const { matches: rawMatches, cursorNext } = await fetchMatchPage(username, cursor);
      const unknown = extractUnknown(rawMatches);
      if (unknown.length) collectedUnknown = collectedUnknown.concat(unknown);
      lastCursor = cursorNext;
      if (!cursorNext) break; // no more pages at source
      cursor = cursorNext;
      if (collectedUnknown.length >= 50) break; // cap to avoid overly large results
    }
    if (!collectedUnknown.length) return loadingMsg.edit('❌ No recent matches found where modeName is "Unknown" across scanned pages.');

    // Chunk unknown matches into logical pages (10 per embed page)
    const pageSize = 10;
    const pages = [];
    for (let i = 0; i < collectedUnknown.length; i += pageSize) {
      pages.push({ matches: collectedUnknown.slice(i, i + pageSize) });
    }
    // Assign cursorNext only to last chunk if upstream has more pages and we might still have more unknown matches further ahead
    if (lastCursor) pages[pages.length - 1].cursorNext = lastCursor;

    initPagination(loadingMsg.id, username, message.author.id, pages[0]);
    // Append rest pages
    for (let i = 1; i < pages.length; i++) appendPage(loadingMsg.id, pages[i]);
    const entry = getEntry(loadingMsg.id);
    const embed = buildEmbed(username, entry.currentPage, entry.pages[entry.currentPage], entry.pages.length);
    await loadingMsg.edit({ content: '', embeds: [embed], components: buildComponents(entry) });
  } catch (e) {
    console.error('❌ Scrims command error:', e);
    await loadingMsg.edit('❌ Failed to fetch scrim match data. Please check the username and try again.');
  }
}

// * Interaction handler for scrims pagination (exported for bot.js to import)
export async function handleScrimsInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('scrims_')) return false;
  const entry = getEntry(interaction.message.id);
  if (!entry) {
    try {
      await interaction.update({ content: '⏰ Pagination expired. Run the command again.', embeds: [], components: [] });
    } catch (_) {}
    return true;
  }

  // Only original user can interact
  if (interaction.user.id !== entry.userId) {
    try { await interaction.reply({ content: '❌ Only the command invoker can use these buttons.', ephemeral: true }); } catch (_) {}
    return true;
  }

  if (interaction.customId === 'scrims_close') {
    try { await interaction.update({ components: [], embeds: interaction.message.embeds, content: 'Session closed.' }); } catch (_) {}
    return true;
  }

  const isPrev = interaction.customId.startsWith('scrims_prev');
  const isNext = interaction.customId.startsWith('scrims_next');
  if (!isPrev && !isNext) return true;

  // Prev page logic
  if (isPrev) {
    if (entry.currentPage === 0) {
      return interaction.deferUpdate();
    }
    setCurrentPage(interaction.message.id, entry.currentPage - 1);
  }

  // Next page logic -> fetch additional page if not yet loaded
  if (isNext) {
    const current = entry.pages[entry.currentPage];
    if (!current.cursorNext) {
      // No further cursor
      return interaction.deferUpdate();
    }
    if (entry.currentPage === entry.pages.length - 1) {
      // Need to fetch new page
      try {
        await interaction.deferUpdate();
        const { matches: rawMatches, cursorNext } = await fetchMatchPage(entry.username, current.cursorNext);
        const unknownMatches = extractUnknown(rawMatches);
        if (!unknownMatches.length) {
          current.cursorNext = cursorNext; // might look further ahead if API has more
          if (!cursorNext) current.cursorNext = null; // finalize no more
        } else {
          // Chunk and append (can be >10 unknown in a fetched page)
            const pageSize = 10;
            for (let i = 0; i < unknownMatches.length; i += pageSize) {
              appendPage(interaction.message.id, { matches: unknownMatches.slice(i, i + pageSize) });
            }
            // Propagate possibility of more pages to the last newly appended page
            const updatedEntry = getEntry(interaction.message.id);
            if (cursorNext) updatedEntry.pages[updatedEntry.pages.length - 1].cursorNext = cursorNext;
            setCurrentPage(interaction.message.id, updatedEntry.pages.length - 1);
        }
      } catch (err) {
        console.error('❌ Scrims pagination fetch error:', err);
      }
    } else {
      setCurrentPage(interaction.message.id, entry.currentPage + 1);
    }
  }

  const updated = getEntry(interaction.message.id);
  if (!updated) return true; // expired mid-flow
  const embed = buildEmbed(updated.username, updated.currentPage, updated.pages[updated.currentPage], updated.pages.length);
  try {
    await interaction.editReply({ embeds: [embed], components: buildComponents(updated) });
  } catch (e) {
    try { await interaction.update({ embeds: [embed], components: buildComponents(updated) }); } catch (_) {}
  }
  return true;
}
