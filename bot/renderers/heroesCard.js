import { createCanvas, roundRect, drawText, formatShortNumber, FONT_STACK } from './canvasCommon.js';
import { scoreToGrade } from '../utils.js';

// Primary hero statistics card (competitive / ranked context)
export function renderHeroesCard({ username, season, heroes }) {
  //. Limit hero rows to a concise digest
  const MAX_ROWS = Math.min(heroes.length, 10);

  // Layout + typography constants (unchanged behavior)
  const FONT_TITLE = 52, FONT_USER = 32, FONT_HEADER = 22, FONT_ROW = 22, FONT_SMALL = 16;
  const OUTER_MARGIN = 40, ROW_H = 60, MIN_GAP = 32;

  // Average / per-match value formatter with tiered precision
  function formatAvg(val) {
    if (!isFinite(val) || val === 0) return '0';
    if (val >= 1000) return formatShortNumber(val);
    if (val >= 100) return Math.round(val).toString();
    if (val >= 10) return val.toFixed(1);
    return val.toFixed(2);
  }

  // Transform raw hero data into render rows
  const rows = heroes.slice(0, MAX_ROWS).map((h, idx) => {
    const winRate = h.MatchesPlayed ? (h.MatchesWon / h.MatchesPlayed) * 100 : 0;
    const kda = h.Deaths ? (h.Kills + h.Assists) / h.Deaths : (h.Kills + h.Assists); // deaths==0 fallback
    const avgDmg = h.MatchesPlayed ? h.TotalHeroDamage / h.MatchesPlayed : 0;
    const avgHeal = h.MatchesPlayed ? h.TotalHeroHeal / h.MatchesPlayed : 0;
    return {
      idx: `${idx + 1}.`, hero: h.Name, role: h.Role || '-', time: h.TimePlayed.toFixed(1),
      matches: formatShortNumber(h.MatchesPlayed), win: winRate.toFixed(1) + '%', kda: kda.toFixed(2),
      dmg: formatShortNumber(h.TotalHeroDamage), heal: formatShortNumber(h.TotalHeroHeal),
      avgDmg: formatAvg(avgDmg), avgHeal: formatAvg(avgHeal),
      eff: (() => { const e = Math.round(h.Effectiveness || 0); return `${e} (${scoreToGrade(e)})`; })()
    };
  });

  // Measurement utilities for dynamic sizing
  const measureCanvas = createCanvas(10, 10); const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(text).width; }
  const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFont = `300 ${FONT_SMALL}px ${FONT_STACK}`;

  // Column configuration (order defines visual layout)
  const columns = [
    { key: 'idx', label: '#', font: rowFont }, { key: 'hero', label: 'Hero', font: rowFont }, { key: 'role', label: 'Role', font: rowFont },
    { key: 'time', label: 'Time (h)', font: rowFont }, { key: 'matches', label: 'Matches', font: rowFont }, { key: 'win', label: 'Win %', font: rowFont },
    { key: 'kda', label: 'KDA', font: rowFont }, { key: 'dmg', label: 'Damage', font: rowFont }, { key: 'avgDmg', label: 'Avg Dmg', font: rowFont },
    { key: 'heal', label: 'Heal', font: rowFont }, { key: 'avgHeal', label: 'Avg Heal', font: rowFont }, { key: 'eff', label: 'Eff', font: rowFont }
  ];
  columns.forEach(col => { const headerW = measure(headerFont, col.label); const contentW = Math.max(...rows.map(r => measure(col.font, r[col.key] || ''))); col.width = Math.max(headerW, contentW) + 8; });
  const heroCol = columns.find(c => c.key === 'hero'); if (heroCol) heroCol.width = Math.max(heroCol.width, 160); // ensure hero names remain legible

  // Compute full card width with padding + spacing
  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 32;
  const BASE_WIDTH = 1200, MAX_WIDTH = 1800;
  let WIDTH = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth)));
  if (WIDTH === MAX_WIDTH) { // squeeze average columns if width is clamped
    const avgCols = columns.filter(c => ['avgDmg', 'avgHeal'].includes(c.key));
    const totalAvgWidth = avgCols.reduce((a, c) => a + c.width, 0);
    if (totalAvgWidth > 260) { const target = 260 / avgCols.length; avgCols.forEach(c => { c.width = Math.max(100, target); }); }
  }

  // Canvas + gradient background
  const HEADER_BLOCK = 150, FOOTER = 70;
  const HEIGHT = HEADER_BLOCK + ROW_H * (rows.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT); grad.addColorStop(0, '#0B0F1A'); grad.addColorStop(1, '#142235'); ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title + user header
  drawText(ctx, `Hero Stats (S${season})`, OUTER_MARGIN, 60, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 60, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });

  // Table panel
  const tableX = OUTER_MARGIN, tableY = 110, tableW = WIDTH - OUTER_MARGIN * 2, tableH = ROW_H * (rows.length + 1) + 40;
  ctx.fillStyle = '#141C2A'; roundRect(ctx, tableX, tableY, tableW, tableH, 18); ctx.fill();

  // Column positions + header row
  let cursorX = tableX + 28; columns.forEach(col => { col.x = cursorX; cursorX += col.width + MIN_GAP; });
  const headerY = tableY + 54; columns.forEach(col => drawText(ctx, col.label, col.x, headerY, { font: headerFont, color: '#AAB4CF' }));

  // Data rows with alternating shading stripes
  rows.forEach((r, i) => {
    const rowBase = headerY + (i + 1) * ROW_H; if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(tableX + 8, rowBase - ROW_H + 10, tableW - 16, ROW_H - 8); }
    columns.forEach(col => {
      let text = r[col.key] || ''; if (col.key === 'hero') { mctx.font = rowFont; while (mctx.measureText(text).width > col.width && text.length > 4) text = text.slice(0, -2) + '…'; }
      let color = '#FFFFFF'; if (col.key === 'win') { //% Win rate color coding tiers
        const val = parseFloat(text); color = val >= 55 ? '#4CAF50' : val >= 50 ? '#FFC107' : '#F44336';
      } else if (col.key === 'kda') { //* Elevated highlight for strong KDA
        const val = parseFloat(text); if (val >= 4) color = '#6DD3FB';
      }
      drawText(ctx, text, col.x, rowBase - 18, { font: rowFont, color });
    });
  });

  // Footer metadata (row count + timestamp)
  drawText(ctx, `Showing top ${rows.length} of ${heroes.length} heroes • Generated ${new Date().toLocaleString()}`, OUTER_MARGIN, HEIGHT - 30, { font: smallFont, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}
