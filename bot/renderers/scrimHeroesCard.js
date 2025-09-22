import { createCanvas, roundRect, drawText, formatShortNumber, FONT_STACK } from './canvasCommon.js';

// Render scrim-specific hero usage summary (top N heroes by time played)
export function renderScrimHeroesCard({ username, season, heroes }) {
  //. Guard: limit processed heroes to a small, readable set
  const MAX_ROWS = Math.min(heroes.length, 10);

  // Typography and layout constants kept identical to original behavior
  const FONT_TITLE = 50, FONT_USER = 30, FONT_HEADER = 20, FONT_ROW = 20, FONT_SMALL = 16;
  const OUTER_MARGIN = 40, ROW_H = 56, MIN_GAP = 30;

  // Regular numeric formatter for per‑match averages
  function formatAvg(val) {
    if (!isFinite(val) || val === 0) return '0';
    if (val >= 1000) return formatShortNumber(val); // large numbers shortened (e.g. 12.3K)
    if (val >= 100) return Math.round(val).toString(); // whole numbers at 100+
    if (val >= 10) return val.toFixed(1); // one decimal for mid range
    return val.toFixed(2); // two decimals for small values
  }

  // Map raw hero objects into lightweight row objects used in rendering
  const rows = heroes.slice(0, MAX_ROWS).map((h, i) => {
    const winRate = h.MatchesPlayed ? (h.MatchesWon / h.MatchesPlayed) * 100 : 0;
    const kda = h.Deaths ? (h.Kills + h.Assists) / h.Deaths : (h.Kills + h.Assists); // fallback: deaths 0 => kills+assists
    const avgDmg = h.MatchesPlayed ? h.TotalHeroDamage / h.MatchesPlayed : 0;
    const avgHeal = h.MatchesPlayed ? h.TotalHeroHeal / h.MatchesPlayed : 0;
    return {
      idx: `${i + 1}.`,
      hero: h.Name,
      role: h.Role || '-',
      time: h.TimePlayed.toFixed(1),
      matches: formatShortNumber(h.MatchesPlayed),
      win: winRate.toFixed(1) + '%',
      kda: kda.toFixed(2),
      dmg: formatShortNumber(h.TotalHeroDamage),
      avgDmg: formatAvg(avgDmg),
      heal: formatShortNumber(h.TotalHeroHeal),
      avgHeal: formatAvg(avgHeal)
    };
  });

  // Measurement canvas for dynamic column width calculation
  const measureCanvas = createCanvas(10, 10);
  const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(text).width; }

  // Font specs reused throughout drawing (weights chosen for visual hierarchy)
  const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFont = `300 ${FONT_SMALL}px ${FONT_STACK}`;

  // Column definitions in display order
  const columns = [
    { key: 'idx', label: '#', font: rowFont },
    { key: 'hero', label: 'Hero', font: rowFont },
    { key: 'role', label: 'Role', font: rowFont },
    { key: 'time', label: 'Time (h)', font: rowFont },
    { key: 'matches', label: 'Matches', font: rowFont },
    { key: 'win', label: 'Win %', font: rowFont },
    { key: 'kda', label: 'KDA', font: rowFont },
    { key: 'dmg', label: 'Damage', font: rowFont },
    { key: 'avgDmg', label: 'Avg Dmg', font: rowFont },
    { key: 'heal', label: 'Heal', font: rowFont },
    { key: 'avgHeal', label: 'Avg Heal', font: rowFont }
  ];

  // Compute per-column width (header vs content) with minimal padding
  columns.forEach(col => {
    const headerW = measure(headerFont, col.label);
    const contentW = Math.max(...rows.map(r => measure(col.font, r[col.key] || '')));
    col.width = Math.max(headerW, contentW) + 8; // +8 padding retained
  });
  const heroCol = columns.find(c => c.key === 'hero');
  if (heroCol) heroCol.width = Math.max(heroCol.width, 150); // ensure readable hero column

  // Aggregate required width including gaps and side margins
  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 32;
  const BASE_WIDTH = 1180, MAX_WIDTH = 1750;
  let WIDTH = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth)));

  // If clamped to max width, proportionally squeeze average columns to avoid overflow
  if (WIDTH === MAX_WIDTH) {
    const avgCols = columns.filter(c => ['avgDmg', 'avgHeal'].includes(c.key));
    const totalAvgWidth = avgCols.reduce((a, c) => a + c.width, 0);
    if (totalAvgWidth > 250) {
      const target = 250 / avgCols.length;
      avgCols.forEach(c => { c.width = Math.max(100, target); });
    }
  }

  // Canvas + background composition
  const HEADER_BLOCK = 140, FOOTER = 64;
  const HEIGHT = HEADER_BLOCK + ROW_H * (rows.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, '#0B0F1A');
  grad.addColorStop(1, '#1D2A3C');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title + user attribution
  drawText(ctx, `Scrim-Used Heroes (S${season})`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });

  // Subtitle: brief context for dataset
  const subtitle = `Season totals for heroes used in scrim matches`;
  drawText(ctx, subtitle, OUTER_MARGIN, 94, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#D1DAE8' });

  // Table container (rounded panel) + column x positioning
  const tableX = OUTER_MARGIN, tableY = 110, tableW = WIDTH - OUTER_MARGIN * 2, tableH = ROW_H * (rows.length + 1) + 38;
  ctx.fillStyle = '#141C2A';
  roundRect(ctx, tableX, tableY, tableW, tableH, 18);
  ctx.fill();

  let cursorX = tableX + 28;
  columns.forEach(col => { col.x = cursorX; cursorX += col.width + MIN_GAP; });
  const headerY = tableY + 50;
  columns.forEach(col => drawText(ctx, col.label, col.x, headerY, { font: headerFont, color: '#AAB4CF' }));

  // Render data rows with alternating background stripes
  rows.forEach((r, i) => {
    const rowBase = headerY + (i + 1) * ROW_H;
    if (i % 2 === 0) { // even index shading band
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(tableX + 8, rowBase - ROW_H + 10, tableW - 16, ROW_H - 8);
    }
    columns.forEach(col => {
      let text = r[col.key] || '';
      if (col.key === 'hero') { // truncate hero name if it overflows column
        mctx.font = rowFont;
        while (mctx.measureText(text).width > col.width && text.length > 4) {
          text = text.slice(0, -2) + '…';
        }
      }
      let color = '#FFFFFF';
      if (col.key === 'win') { //% Win rate color-coded by performance tiers
        const val = parseFloat(text);
        color = val >= 55 ? '#4CAF50' : val >= 50 ? '#FFC107' : '#F44336';
      } else if (col.key === 'kda') { //* Highlight high KDA
        const val = parseFloat(text);
        if (val >= 4) color = '#6DD3FB';
      }
      drawText(ctx, text, col.x, rowBase - 18, { font: rowFont, color });
    });
  });

  // Footer meta: count + generation timestamp
  drawText(ctx, `Top ${rows.length}/${heroes.length} • Generated ${new Date().toLocaleString()}`, OUTER_MARGIN, HEIGHT - 28, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}
