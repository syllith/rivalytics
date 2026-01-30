import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { scrapeJson, screenshotMatchScoreboard } from '../browser.js';
import { formatShortNumber, computeEffectiveness, scoreToGrade } from '../utils.js';
import { renderScrimsCard, SCRIMS_ROWS_PER_PAGE, SCRIMS_MAX_TOTAL } from '../renderers/scrimsCard.js';
import { VERBOSE, CURRENT_SEASON, PUBLIC_SEASON } from '../config.js';

// NOTE: Supports up to 100 scrim matches with pagination (20 per page, 5 pages max).
// 20 per page to match Discord's button limit (5 rows max, 1 for nav = 4 rows × 5 buttons = 20).
// Navigation buttons allow paging through results, and numbered buttons show replay IDs.

// Scrim mode names - tracker.gg now distinguishes between tournament customs ("Unknown") and regular customs ("Custom Game")
const SCRIM_MODE_NAMES = ['unknown', 'custom game'];

// * Fetch a single page of matches (optionally with next cursor and specific season)
async function fetchMatchPage(username, nextCursor = null, season = CURRENT_SEASON) {
  const cursorParam = nextCursor ? `&next=${encodeURIComponent(nextCursor)}` : '';
  const url = `https://api.tracker.gg/api/v2/marvel-rivals/standard/matches/ign/${encodeURIComponent(username)}?season=${season}${cursorParam}`;
  if (VERBOSE) console.log(`📡 (scrims) Fetching: ${url}`);
  const data = await scrapeJson(url);
  if (data.errors?.length) throw new Error(data.errors[0].message || 'API error');
  const matches = data.data?.matches || [];
  const cursorNext = data.data?.metadata?.next || null; // tracker.gg uses metadata.next for pagination
  return { matches, cursorNext };
}

// * Convert raw matches -> only scrim/custom mode matches
function extractScrimMatches(matches) {
  return matches.filter(m => {
    const modeName = (m.metadata?.modeName || '').trim().toLowerCase();
    return SCRIM_MODE_NAMES.includes(modeName);
  });
}

// * Handle the !scrims command: list recent matches where modeName is a scrim/custom mode
export async function handleScrimsCommand(message, args) {
  //. Need username argument
  if (args.length < 2) return message.reply('❌ Please provide a username. Usage: `!scrims <username> [count]`');

  const username = args[1];
  if (VERBOSE) console.log(`🔍 Scrims command requested for username: ${username}`);

  // Optional: user may request a specific number of recent scrim matches to fetch
  const DEFAULT_TARGET = 30;
  const MAX_ALLOWED = SCRIMS_MAX_TOTAL; // Support up to 100 matches
  let targetMatches = DEFAULT_TARGET;
  if (args[2]) {
    const parsed = parseInt(args[2], 10);
    if (Number.isNaN(parsed) || parsed <= 0) return message.reply('❌ Invalid match count. Please provide a positive number for the count (e.g. `!scrims user 10`).');
    targetMatches = Math.min(MAX_ALLOWED, parsed);
  }

  const loadingMsg = await message.reply(`🔍 Aggregating scrim/custom matches for **${username}** (Season ${PUBLIC_SEASON})${targetMatches !== DEFAULT_TARGET ? ` — last ${targetMatches} matches` : ''}...`);
  try {
    const MAX_SOURCE_PAGES = 15; // backend pages to scan per season
    const TARGET_MATCHES = targetMatches; // user-requested or default target
    let collected = [];
    let cursor = null;
    
    // First, fetch from current season
    for (let i = 0; i < MAX_SOURCE_PAGES; i++) {
      const { matches: rawMatches, cursorNext } = await fetchMatchPage(username, cursor, CURRENT_SEASON);
      const scrimMatches = extractScrimMatches(rawMatches);
      if (scrimMatches.length) collected = collected.concat(scrimMatches);
      if (!cursorNext || collected.length >= TARGET_MATCHES) break; // stop once we have enough
      cursor = cursorNext;
    }
    
    // If we still need more matches, try previous season
    const PREVIOUS_SEASON = CURRENT_SEASON - 1;
    if (collected.length < TARGET_MATCHES && PREVIOUS_SEASON >= 1) {
      if (VERBOSE) console.log(`📡 (scrims) Current season has ${collected.length}/${TARGET_MATCHES} matches, fetching from previous season ${PREVIOUS_SEASON}`);
      cursor = null; // reset cursor for new season
      for (let i = 0; i < MAX_SOURCE_PAGES; i++) {
        const { matches: rawMatches, cursorNext } = await fetchMatchPage(username, cursor, PREVIOUS_SEASON);
        const scrimMatches = extractScrimMatches(rawMatches);
        if (scrimMatches.length) collected = collected.concat(scrimMatches);
        if (!cursorNext || collected.length >= TARGET_MATCHES) break;
        cursor = cursorNext;
      }
    }
    
    if (!collected.length) return loadingMsg.edit('❌ No recent scrim/custom matches found within scanned range.');

    // Prepare structured rows for canvas renderer
    let wins = 0, losses = 0, totalDamage = 0, totalKills = 0, totalDeaths = 0;
  const cardRows = [];
  const perMatchEffs = []; // collect per-match per-hero efficiencies for overall average
    const LIMIT_FOR_CARD = Math.min(TARGET_MATCHES, SCRIMS_MAX_TOTAL); // cap rows to max supported (100)
  replayCache.set(loadingMsg.id, []);
  matchIdCache.set(loadingMsg.id, []);
  // Store session data for pagination
  scrimSessionCache.set(loadingMsg.id, { username, season: PUBLIC_SEASON, currentPage: 0 });
    collected.slice(0, LIMIT_FOR_CARD).forEach((match, idx) => {
      const meta = match.metadata || {};
      const overview = match.segments?.find(s => s.type === 'overview');
      const stats = overview?.stats || {};
      const overviewMeta = overview?.metadata || {};
      const matchId = match.attributes?.id || '';
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
      const replayId = meta.replayId || overviewMeta.replayId || '';
      const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
      // Compute simple per-hero efficiency snapshots using available per-match stats (approximation)
      const heroNames = overviewMeta.heroes?.slice(0, 3).map(h => h.name) || [];
      // Build a minimal hero stat object resembling the career aggregation for computeEffectiveness
      const heroEffs = heroNames.map(() => computeEffectiveness({
        MatchesPlayed: 1,
        MatchesWon: resultRaw === 'win' ? 1 : 0,
        Kills: kills,
        Deaths: deaths,
        Assists: stats.assists?.value || 0,
        TotalHeroDamage: damage,
        TotalHeroHeal: stats.totalHeroHeal?.value || 0,
        TotalHeroDamagePerMinute: stats.totalHeroDamagePerMinute?.value || 0,
        TotalHeroHealPerMinute: stats.totalHeroHealPerMinute?.value || 0,
        MainAttacks: stats.mainAttacks?.value || 0,
        MainAttackHits: stats.mainAttackHits?.value || 0,
        HeadKills: stats.headKills?.value || 0,
        SoloKills: stats.soloKills?.value || 0,
        SurvivalKills: stats.maxSurvivalKills?.value || stats.survivalKills?.value || 0,
        TotalDamageTaken: stats.totalDamageTaken?.value || 0
      }));
      // Annotate hero names with (eff)
      const heroes = heroNames.map((n, i) => `${n} (${Math.round(heroEffs[i] || 0)})`).join(', ');
      if (heroEffs.length) perMatchEffs.push(...heroEffs);
      if (replayId) {
        replayCache.get(loadingMsg.id).push(replayId);
        matchIdCache.get(loadingMsg.id).push(matchId || '');
      }
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
        replay: replayId || '',
        matchId: matchId || '',
        timestamp: meta.timestamp || null
      });
    });

    // Stats for fallback embed & potential future header
    const totalMatches = Math.min(collected.length, TARGET_MATCHES);
    const winRate = totalMatches ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';
    const avgDmg = totalMatches ? formatShortNumber(totalDamage / Math.min(totalMatches, cardRows.length)) : '0';
    const avgKD = totalDeaths ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2);

    // Store cardRows for pagination
    cardRowsCache.set(loadingMsg.id, cardRows);

    // Attempt canvas render first
    try {
  const png = renderScrimsCard({ username, season: PUBLIC_SEASON, rows: cardRows, page: 0, totalRows: cardRows.length });
      const attachmentName = `scrims_${username}.png`;
      const attachment = new AttachmentBuilder(png, { name: attachmentName });

      // Build pagination and replay buttons
      const components = buildScrimButtons(loadingMsg.id, cardRows, 0);
      
      // Append overall average efficiency summary with grade
      let avgEff = 0, grade = '';
      if (perMatchEffs.length) {
        avgEff = perMatchEffs.reduce((a, b) => a + b, 0) / perMatchEffs.length;
        grade = scoreToGrade(avgEff);
      }
      // Store efficiency data for use in pagination
      scrimSessionCache.get(loadingMsg.id).avgEff = avgEff;
      scrimSessionCache.get(loadingMsg.id).grade = grade;
      
      const summaryEmbed = (perMatchEffs.length)
        ? new EmbedBuilder()
            .setColor(0x4B7BEC)
            .setDescription(`Average Scrim Efficiency: ${Math.round(avgEff)} (${grade})`)
        : null;
      await loadingMsg.edit({ content: '', embeds: summaryEmbed ? [summaryEmbed] : [], files: [attachment], components });
    } catch (cardErr) {
      console.warn('⚠️ Scrims image render failed, falling back to embed:', cardErr.message);
      const embed = new EmbedBuilder()
        .setTitle(`🎮 Scrim Matches (S${PUBLIC_SEASON}) for ${username}`)
        .setColor(0x4B7BEC)
        .setTimestamp();
      // Compute average efficiency and grade
      let avgEff = 0, grade = '';
      if (perMatchEffs.length) {
        avgEff = perMatchEffs.reduce((a, b) => a + b, 0) / perMatchEffs.length;
        grade = scoreToGrade(avgEff);
      }
      const headerLine = `Matches: ${totalMatches} • Wins: ${wins} • Losses: ${losses} • WinRate: ${winRate}%\nAvg Damage: ${avgDmg} • Avg K/D: ${avgKD}`;
      const threatLine = perMatchEffs.length ? `\nOverall Scrim Efficiency: ${Math.round(avgEff)} (${grade})` : '';
      // Show first page of matches in embed fallback
      const pageRows = cardRows.slice(0, SCRIMS_ROWS_PER_PAGE);
      embed.setDescription(headerLine + threatLine + '\n\n' + pageRows.map(r => `• ${r.index}. ${r.resultEmoji} ${r.mapName} • ${r.kills}/${r.deaths} (K/D ${r.kd}) • ${formatShortNumber(r.damage)} dmg • ${r.duration}${r.heroes ? ' • ' + r.heroes : ''}${r.replay ? ' • 🔁 ' + r.replay : ''}`).join('\n'))
        .setFooter({ text: `Showing 1-${pageRows.length} of ${cardRows.length} scrim/custom matches` });
      // Build pagination and replay buttons
      const components = buildScrimButtons(loadingMsg.id, cardRows, 0);
      await loadingMsg.edit({ content: '', embeds: [embed], components });
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
// Parallel cache for scrims: messageId -> tracker match id[] for team comp links
const matchIdCache = new Map();
// Cache for cardRows data to support pagination (messageId -> cardRows[])
const cardRowsCache = new Map();
// Session cache for pagination state (messageId -> { username, season, currentPage, avgEff, grade })
const scrimSessionCache = new Map();

// * Build button components for scrims with pagination support
// Returns action rows with: navigation buttons (if multiple pages) + replay buttons for current page
function buildScrimButtons(messageId, cardRows, currentPage) {
  const totalPages = Math.ceil(cardRows.length / SCRIMS_ROWS_PER_PAGE);
  const startIdx = currentPage * SCRIMS_ROWS_PER_PAGE;
  const endIdx = Math.min(startIdx + SCRIMS_ROWS_PER_PAGE, cardRows.length);
  const pageRows = cardRows.slice(startIdx, endIdx);
  const replayIds = replayCache.get(messageId) || [];
  
  const components = [];
  
  // Navigation row (if multiple pages)
  if (totalPages > 1) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`scrimprev_${messageId}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`scrimpage_${messageId}`)
        .setLabel(`Page ${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`scrimnext_${messageId}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1)
    );
    components.push(navRow);
  }
  
  // Replay buttons for current page matches (up to 20 buttons in 4 rows to leave room for nav)
  const maxReplayButtons = totalPages > 1 ? 20 : 25; // Reserve 1 row for nav if paginated
  const replayButtons = [];
  for (let i = 0; i < Math.min(pageRows.length, maxReplayButtons); i++) {
    const globalIdx = startIdx + i;
    if (replayIds[globalIdx]) {
      replayButtons.push(
        new ButtonBuilder()
          .setCustomId(`scrimreplay_${messageId}_${globalIdx}`)
          .setLabel(String(globalIdx + 1))
          .setStyle(ButtonStyle.Secondary)
      );
    }
  }
  
  // Add replay buttons in rows of 5
  for (let i = 0; i < replayButtons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(replayButtons.slice(i, i + 5)));
  }
  
  return components;
}

// * Interaction handler for scrim replay buttons and pagination
export async function handleScrimsInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const customId = interaction.customId;
  
  // Handle pagination buttons
  if (customId.startsWith('scrimprev_') || customId.startsWith('scrimnext_')) {
    const messageId = customId.split('_')[1];
    const session = scrimSessionCache.get(messageId);
    const cardRows = cardRowsCache.get(messageId);
    
    if (!session || !cardRows) {
      try { await interaction.reply({ content: '⏰ Session expired. Please run the command again.', ephemeral: true }); } catch (_) { }
      return true;
    }
    
    const totalPages = Math.ceil(cardRows.length / SCRIMS_ROWS_PER_PAGE);
    let newPage = session.currentPage;
    
    if (customId.startsWith('scrimprev_')) {
      newPage = Math.max(0, newPage - 1);
    } else {
      newPage = Math.min(totalPages - 1, newPage + 1);
    }
    
    if (newPage === session.currentPage) {
      try { await interaction.deferUpdate(); } catch (_) { }
      return true;
    }
    
    session.currentPage = newPage;
    
    try {
      // Re-render card for new page
      const png = renderScrimsCard({ 
        username: session.username, 
        season: session.season, 
        rows: cardRows, 
        page: newPage, 
        totalRows: cardRows.length 
      });
      const attachmentName = `scrims_${session.username}_p${newPage + 1}.png`;
      const attachment = new AttachmentBuilder(png, { name: attachmentName });
      const components = buildScrimButtons(messageId, cardRows, newPage);
      
      const summaryEmbed = session.avgEff
        ? new EmbedBuilder()
            .setColor(0x4B7BEC)
            .setDescription(`Average Scrim Efficiency: ${Math.round(session.avgEff)} (${session.grade})`)
        : null;
      
      await interaction.update({ 
        embeds: summaryEmbed ? [summaryEmbed] : [], 
        files: [attachment], 
        components 
      });
    } catch (e) {
      console.error('Pagination update error:', e);
      try { await interaction.reply({ content: '❌ Failed to update page.', ephemeral: true }); } catch (_) { }
    }
    return true;
  }
  
  // Handle replay buttons - show replay ID/link instantly with option to get screenshot
  if (customId.startsWith('scrimreplay_')) {
    const parts = customId.split('_');
    const messageId = parts[1];
    const idx = parseInt(parts[2], 10);
    const list = replayCache.get(messageId);
    if (!list) {
      try { await interaction.reply({ content: '⏰ Replay buttons expired.', ephemeral: true }); } catch (_) { }
      return true;
    }
    const replayId = list[idx];
    const matchIds = matchIdCache.get(messageId) || [];
    const matchId = matchIds[idx] || '';
    if (!replayId) {
      try { await interaction.reply({ content: '❌ Replay unavailable.', ephemeral: true }); } catch (_) { }
      return true;
    }
    
    // Respond immediately with replay ID and link (no waiting for screenshot)
    try {
      const link = matchId ? `https://tracker.gg/marvel-rivals/matches/${matchId}` : null;
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎬 Match ${idx + 1} Details`)
        .setDescription(
          `**Replay ID:** \`${replayId}\`\n` +
          (link ? `**Scoreboard:** [View on Tracker.gg](${link})` : '')
        );
      
      // Add screenshot button if we have a match ID
      // Use messageId and idx to look up matchId from cache (avoids issues with underscores in matchId)
      const components = [];
      if (matchId) {
        const screenshotRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`scrimshot_${messageId}_${idx}`)
            .setLabel('📸 Get Screenshot')
            .setStyle(ButtonStyle.Primary)
        );
        components.push(screenshotRow);
      }
      
      await interaction.reply({ embeds: [embed], components, ephemeral: false });
    } catch (e) {
      console.error('Replay button error:', e);
      try {
        await interaction.reply({ content: `🎬 Replay ID (Match ${idx + 1}): \`${replayId}\``, ephemeral: false });
      } catch (_) { }
    }
    return true;
  }
  
  // Handle screenshot button - takes the screenshot (slow operation)
  if (customId.startsWith('scrimshot_')) {
    const parts = customId.split('_');
    const messageId = parts[1];
    const idx = parseInt(parts[2], 10);
    
    // Look up match ID from cache (same pattern as replay buttons)
    const matchIds = matchIdCache.get(messageId) || [];
    const matchId = matchIds[idx] || '';
    
    if (!matchId) {
      try { await interaction.reply({ content: '⏰ Session expired. Please run the command again.', ephemeral: true }); } catch (_) { }
      return true;
    }
    
    // Defer reply since screenshot takes ~10 seconds
    try {
      await interaction.deferReply({ ephemeral: false });
    } catch (e) {
      if (VERBOSE) console.log('⚠️ Could not defer reply:', e.message);
      return true;
    }
    
    try {
      if (VERBOSE) console.log(`📸 Taking scoreboard screenshot for match ${idx + 1}: ${matchId}`);
      
      const screenshotBuffer = await screenshotMatchScoreboard(matchId);
      const attachment = new AttachmentBuilder(screenshotBuffer, { name: `scoreboard_${idx + 1}.png` });
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📊 Match ${idx + 1} Scoreboard`)
        .setImage(`attachment://scoreboard_${idx + 1}.png`)
        .setFooter({ text: 'Scoreboard captured from tracker.gg' });
      
      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (screenshotErr) {
      console.error('Screenshot error:', screenshotErr);
      const link = `https://tracker.gg/marvel-rivals/matches/${matchId}`;
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`❌ Screenshot failed. [View scoreboard on Tracker.gg](${link})`);
      try {
        await interaction.editReply({ embeds: [embed] });
      } catch (_) { }
    }
    return true;
  }
  
  return false;
}
