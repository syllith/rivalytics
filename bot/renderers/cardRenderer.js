// Legacy aggregated card rendering module (kept for backward compatibility)
//. Newer renderers live as dedicated files in this folder (heroesCard.js, matchesCard.js, etc.)
// Provides functions to render hero stats and ranked history + recent matches into PNG buffers
// All functions return Buffer suitable for AttachmentBuilder in discord.js

// CommonJS module interop: import full package then destructure
import canvasPkg from '@napi-rs/canvas';
const { createCanvas } = canvasPkg;
// registerFont may exist (node-canvas style) or GlobalFonts.register (napi-rs style)
const rawRegisterFont = typeof canvasPkg.registerFont === 'function' ? canvasPkg.registerFont : null;
const globalFonts = canvasPkg.GlobalFonts;
import path from 'node:path';
import fs from 'node:fs';

// Attempt to register available local fonts (best effort, ignore failures)
const fontDirCandidates = [
  path.resolve(process.cwd(), 'assets/fonts'),
  path.resolve(process.cwd(), 'public/assets/fonts'),
  path.resolve(process.cwd(), 'public/fonts')
];

function safeRegisterFont(filePath, opts) {
  if (rawRegisterFont) {
    try { rawRegisterFont(filePath, opts); } catch { /* ignore */ }
  } else if (globalFonts && typeof globalFonts.register === 'function') {
    try { globalFonts.register(filePath, opts); } catch { /* ignore */ }
  }
}

function tryRegisterFont(filename, family, weight = 'normal') {
  for (const dir of fontDirCandidates) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      safeRegisterFont(p, { family, weight });
      break; // stop after first found
    }
  }
}

// Register a few known fonts if present (fallback to system sans if missing)
tryRegisterFont('Lexend-Medium.ttf', 'Lexend', '500');
tryRegisterFont('Lexend-Thin.ttf', 'Lexend', '300');
tryRegisterFont('Montserrat.ttf', 'Montserrat', '600');
tryRegisterFont('opensans.ttf', 'OpenSans', '400');
tryRegisterFont('Quicksand-Regular.ttf', 'Quicksand', '400');

const FONT_STACK = 'Montserrat, Lexend, OpenSans, Quicksand, Arial, sans-serif';

// Shared drawing helpers -----------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawText(ctx, text, x, y, opts = {}) {
  const { color = '#FFFFFF', font = '16px ' + FONT_STACK, align = 'left', baseline = 'alphabetic', maxWidth } = opts;
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth) ctx.fillText(text, x, y, maxWidth); else ctx.fillText(text, x, y);
}

function formatShortNumber(num) {
  if (num == null || isNaN(num)) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
}

// HEROES CARD ----------------------------------------------------------------
// heroes: array already sorted by TimePlayed desc
export function renderHeroesCard({ username, season, heroes }) {
  const MAX_ROWS = Math.min(heroes.length, 10);
  const FONT_TITLE = 52;
  const FONT_USER = 32;
  const FONT_HEADER = 22;
  const FONT_ROW = 22;
  const FONT_SMALL = 16;
  const OUTER_MARGIN = 40;
  const ROW_H = 60;
  const MIN_GAP = 32;

  // Preprocess hero rows (already sorted by time played per caller assumption)
  function formatAvg(val) {
    if (!isFinite(val) || val === 0) return '0';
    if (val >= 1000) return formatShortNumber(val); // already shortened
    if (val >= 100) return Math.round(val).toString();
    if (val >= 10) return val.toFixed(1); // one decimal
    return val.toFixed(2); // two decimals for very small values
  }
  const rows = heroes.slice(0, MAX_ROWS).map((h, idx) => {
    const winRate = h.MatchesPlayed ? (h.MatchesWon / h.MatchesPlayed) * 100 : 0;
    const kda = h.Deaths ? (h.Kills + h.Assists) / h.Deaths : (h.Kills + h.Assists);
    const avgDmg = h.MatchesPlayed ? h.TotalHeroDamage / h.MatchesPlayed : 0;
    const avgHeal = h.MatchesPlayed ? h.TotalHeroHeal / h.MatchesPlayed : 0;
    return {
      idx: `${idx + 1}.`,
      hero: h.Name,
      role: h.Role || '-',
      time: h.TimePlayed.toFixed(1),
      matches: formatShortNumber(h.MatchesPlayed),
      win: winRate.toFixed(1) + '%',
      kda: kda.toFixed(2),
      dmg: formatShortNumber(h.TotalHeroDamage),
      heal: formatShortNumber(h.TotalHeroHeal),
      avgDmg: formatAvg(avgDmg),
      avgHeal: formatAvg(avgHeal)
    };
  });

  // Measurement phase for dynamic width
  const measureCanvas = createCanvas(10, 10); const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(text).width; }
  const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFont = `300 ${FONT_SMALL}px ${FONT_STACK}`;

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
  columns.forEach(col => {
    const headerW = measure(headerFont, col.label);
    const contentW = Math.max(...rows.map(r => measure(col.font, r[col.key] || '')));
    col.width = Math.max(headerW, contentW) + 8; // padding
  });
  // Constrain hero column minimum
  const heroCol = columns.find(c => c.key === 'hero'); if (heroCol) heroCol.width = Math.max(heroCol.width, 160);

  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 32;
  const BASE_WIDTH = 1200; const MAX_WIDTH = 1800;
  let WIDTH = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth)));

  // If width is clamped, squeeze average columns proportionally
  if (WIDTH === MAX_WIDTH) {
    const avgCols = columns.filter(c => ['avgDmg', 'avgHeal'].includes(c.key));
    const totalAvgWidth = avgCols.reduce((a, c) => a + c.width, 0);
    if (totalAvgWidth > 260) {
      const target = 260 / avgCols.length;
      avgCols.forEach(c => { c.width = Math.max(100, target); });
    }
  }

  const HEADER_BLOCK = 150; const FOOTER = 70;
  const HEIGHT = HEADER_BLOCK + ROW_H * (rows.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, '#0B0F1A'); grad.addColorStop(1, '#142235');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title & user
  drawText(ctx, `Hero Stats (S${season})`, OUTER_MARGIN, 60, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 60, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });

  // Table container
  const tableX = OUTER_MARGIN; const tableY = 110; const tableW = WIDTH - OUTER_MARGIN * 2; const tableH = ROW_H * (rows.length + 1) + 40;
  ctx.fillStyle = '#141C2A'; roundRect(ctx, tableX, tableY, tableW, tableH, 18); ctx.fill();

  // Column x positions
  let cursorX = tableX + 28;
  columns.forEach(col => { col.x = cursorX; cursorX += col.width + MIN_GAP; });
  const headerY = tableY + 54;
  columns.forEach(col => drawText(ctx, col.label, col.x, headerY, { font: headerFont, color: '#AAB4CF' }));

  // Draw rows
  rows.forEach((r, i) => {
    const rowBase = headerY + (i + 1) * ROW_H;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(tableX + 8, rowBase - ROW_H + 10, tableW - 16, ROW_H - 8);
    }
    columns.forEach(col => {
      let text = r[col.key] || '';
      // Use uniform row font for all data columns (requested style consistency)
      const font = rowFont;
      if (col.key === 'hero') {
        // truncate hero name to fit
        mctx.font = font;
        while (mctx.measureText(text).width > col.width && text.length > 4) {
          text = text.slice(0, -2) + '…';
        }
      }
      let color = '#FFFFFF';
      if (col.key === 'win') {
        const val = parseFloat(text);
        color = val >= 55 ? '#4CAF50' : val >= 50 ? '#FFC107' : '#F44336';
      } else if (col.key === 'kda') {
        const val = parseFloat(text);
        if (val >= 4) color = '#6DD3FB';
      }
      drawText(ctx, text, col.x, rowBase - 18, { font, color });
    });
  });

  drawText(ctx, `Showing top ${rows.length} of ${heroes.length} heroes • Generated ${new Date().toLocaleString()}`,
    OUTER_MARGIN, HEIGHT - 30, { font: smallFont, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}

// MATCHES CARD ---------------------------------------------------------------
export function renderMatchesCard({ username, season, currentRank, currentScore, combinedRows }) {
  const rows = combinedRows.slice(0, 10); // exactly paired rows (max 10)
  // Font sizing constants
  const FONT_TITLE = 52;
  const FONT_USER = 34;
  const FONT_SUB = 28;
  const FONT_HEADER = 24;
  const FONT_ROW = 22;
  const FONT_SMALL = 18;
  const ROW_H = 64;
  const OUTER_MARGIN = 48;
  const TABLE_TOP_OFFSET = 140;
  const MIN_GAP = 32; // min spacing between columns
  const MAX_WIDTH = 1800;
  const BASE_WIDTH = 1400; // starting target width, may grow if content requires

  // Precompute display strings & allow abbreviation later
  const rowStrings = rows.map(r => {
    return {
      idx: `${r.index}.`,
      map: r.mapName.split(' • ')[0],
      delta: r.delta || '-',
      rs: r.rankScore.toLocaleString('en-US'),
      // Split K/D into two parts so we can align ratio with a tab-like internal spacing
      kdKillsDeaths: `${r.kills}/${r.deaths}`,
      kdRatio: String(r.kd),
      dmg: formatShortNumber(r.damage),
      dur: r.duration,
      time: r.timestamp ? (() => { const d = new Date(r.timestamp); return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); })() : '-',
      replay: r.replay || '',
      rank: currentRank
    };
  });

  // Measurement canvas
  const measureCanvas = createCanvas(10, 10);
  const mctx = measureCanvas.getContext('2d');
  function measure(fontSpec, text) {
    mctx.font = fontSpec;
    return mctx.measureText(text).width;
  }

  const rowFontSpec = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFontSpec = `400 ${FONT_SMALL}px ${FONT_STACK}`;
  const headerFontSpec = `600 ${FONT_HEADER}px ${FONT_STACK}`;

  // Column definitions (header label + accessor key + font type)
  const columns = [
    { key: 'idx', label: '#', font: rowFontSpec },
    { key: 'map', label: 'Map', font: rowFontSpec },
    { key: 'delta', label: 'Rank Δ', font: rowFontSpec },
    { key: 'rs', label: 'RS After', font: rowFontSpec },
    // K/D special handling (kills/deaths + ratio aligned)
    { key: 'kd', label: 'K/D', font: rowFontSpec },
    { key: 'dmg', label: 'Damage', font: rowFontSpec },
    { key: 'dur', label: 'Dur', font: rowFontSpec },
    { key: 'time', label: 'Time', font: smallFontSpec },
    { key: 'replay', label: 'Replay', font: smallFontSpec },
    { key: 'rank', label: 'Rank', font: smallFontSpec }
  ];

  // Measure widths
  const KD_INTERNAL_GAP = 44; // space between kills/deaths and ratio (acts like a tab)
  columns.forEach(col => {
    const headerW = measure(headerFontSpec, col.label);
    if (col.key === 'kd') {
      // Determine sub widths
      const kdKillsDeathsWidth = Math.max(...rowStrings.map(rs => measure(col.font, rs.kdKillsDeaths)));
      const kdRatioWidth = Math.max(...rowStrings.map(rs => measure(col.font, rs.kdRatio)));
      col.kdKillsDeathsWidth = kdKillsDeathsWidth;
      col.kdRatioWidth = kdRatioWidth;
      col.internalGap = KD_INTERNAL_GAP;
      const kdTotal = kdKillsDeathsWidth + KD_INTERNAL_GAP + kdRatioWidth;
      col.width = Math.max(headerW, kdTotal);
    } else {
      const contentW = Math.max(...rowStrings.map(rs => measure(col.font, rs[col.key] || '')));
      col.width = Math.max(headerW, contentW);
    }
  });

  // Compute required width
  let requiredInnerWidth = columns.reduce((acc, c) => acc + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 32; // extra padding
  let WIDTH = Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth));
  if (WIDTH > MAX_WIDTH) WIDTH = MAX_WIDTH;

  // If width was clamped, attempt rank abbreviation to reclaim space
  if (WIDTH === MAX_WIDTH) {
    const rankCol = columns.find(c => c.key === 'rank');
    // Abbreviate rank if helpful
    const abbreviated = currentRank
      .replace(/Grandmaster/gi, 'GM')
      .replace(/Platinum/gi, 'Plat')
      .replace(/Diamond/gi, 'Dia')
      .replace(/Master/gi, 'Mstr');
    if (abbreviated !== currentRank) {
      rowStrings.forEach(r => { r.rank = abbreviated; });
      rankCol.width = Math.max(measure(headerFontSpec, rankCol.label), Math.max(...rowStrings.map(r => measure(smallFontSpec, r.rank))));
      requiredInnerWidth = columns.reduce((acc, c) => acc + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 32;
      if (requiredInnerWidth < WIDTH) {
        // free space, keep WIDTH as is
      }
    }
  }

  const rowH = ROW_H;
  const BASE = 160;
  const FOOTER = 80;
  const HEIGHT = BASE + rowH * (rows.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, '#0B0F1A');
  grad.addColorStop(1, '#13202F');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title & header texts
  // Updated title per request
  drawText(ctx, `Competitive Matches (S${season})`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });
  drawText(ctx, `Current Rank: ${currentRank} • Score: ${currentScore}`, OUTER_MARGIN, 112, { font: `400 ${FONT_SUB}px ${FONT_STACK}`, color: '#FFFFFF' });

  // Table container
  const tableX = OUTER_MARGIN; const tableY = TABLE_TOP_OFFSET; const tableW = WIDTH - OUTER_MARGIN * 2;
  const tableH = rowH * (rows.length + 1) + 40;
  ctx.fillStyle = '#141C2A';
  roundRect(ctx, tableX, tableY, tableW, tableH, 20);
  ctx.fill();

  // Column X positions
  let cursorX = tableX + 28; // inner left padding
  columns.forEach((c, idx) => {
    c.x = cursorX;
    cursorX += c.width + MIN_GAP;
  });

  const headerBaselineY = tableY + 54;
  columns.forEach(c => {
    drawText(ctx, c.label, c.x, headerBaselineY, { font: headerFontSpec, color: '#AAB4CF' });
  });

  // Determine actual fonts per column when drawing rows
  function colFont(c) {
    if (c.key === 'time' || c.key === 'replay' || c.key === 'rank') return `400 ${FONT_SMALL}px ${FONT_STACK}`;
    return `400 ${FONT_ROW}px ${FONT_STACK}`;
  }

  rows.forEach((r, i) => {
    const rowYBase = headerBaselineY + (i + 1) * rowH;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(tableX + 8, rowYBase - rowH + 10, tableW - 16, rowH - 8);
    }
    const data = rowStrings[i];
    columns.forEach(c => {
      if (c.key === 'kd') {
        // Draw kills/deaths
        drawText(ctx, data.kdKillsDeaths, c.x, rowYBase - 18, { font: colFont(c), color: '#FFFFFF' });
        // Draw ratio left-aligned at consistent offset within column
        const ratioX = c.x + c.kdKillsDeathsWidth + c.internalGap;
        drawText(ctx, data.kdRatio, ratioX, rowYBase - 18, { font: colFont(c), color: '#FFFFFF' });
        return;
      }
      let text = data[c.key] ?? '';
      if (c.key === 'map') {
        let attempt = text;
        const f = colFont(c);
        mctx.font = f;
        while (mctx.measureText(attempt).width > c.width && attempt.length > 5) {
          attempt = attempt.slice(0, -2) + '…';
        }
        text = attempt;
      }
      const gainColor = c.key === 'delta' ? (text.startsWith('+') ? '#4CAF50' : text.startsWith('-') ? '#F44336' : '#D1DAE8') : '#FFFFFF';
      const color = c.key === 'delta' ? gainColor : (c.key === 'replay' ? '#6DD3FB' : (c.key === 'time' ? '#D1DAE8' : '#FFFFFF'));
      drawText(ctx, text, c.x, rowYBase - 18, { font: colFont(c), color });
    });
  });

  drawText(ctx, `Generated ${new Date().toLocaleString()}`, OUTER_MARGIN, HEIGHT - 30, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}

// SCRIMS CARD ---------------------------------------------------------------
// rows: [{ index, mapName, resultEmoji, kills, deaths, kd, damage, duration, heroes, replay, timestamp }]
export function renderScrimsCard({ username, season, rows }) {
  const MAX_ROWS = Math.min(rows.length, 15); // cap at 15 per requirements
  const FONT_TITLE = 48;
  const FONT_USER = 30;
  const FONT_HEADER = 20;
  const FONT_ROW = 20;
  const FONT_SMALL = 16;
  const OUTER_MARGIN = 40;
  const ROW_H = 48;
  const TABLE_TOP_OFFSET = 130;
  const MIN_GAP = 28;
  const BASE_WIDTH = 1500;
  const MAX_WIDTH = 1900;

  // Precompute display breakdown
  const processed = rows.slice(0, MAX_ROWS).map(r => ({
    idx: `${r.index}.`,
    result: r.resultEmoji === '🟢' ? 'W' : r.resultEmoji === '🔴' ? 'L' : '-',
    map: r.mapName || 'Unknown',
    kd: `${r.kills}/${r.deaths}`,
    kdr: String(r.kd || '0'),
    dmg: typeof r.damage === 'number' ? formatShortNumber(r.damage) : r.damage || '0',
    dur: r.duration || '?:??',
    heroes: r.heroes || '',
    replay: r.replay ? r.replay.slice(-6) : '',
    time: r.timestamp ? (() => { const d = new Date(r.timestamp); return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); })() : ''
  }));

  const measureCanvas = createCanvas(10, 10); const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(text).width; }
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFont = `400 ${FONT_SMALL}px ${FONT_STACK}`;
  const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;

  const columns = [
    { key: 'idx', label: '#', font: rowFont },
    { key: 'result', label: 'R', font: rowFont },
    { key: 'map', label: 'Map', font: rowFont },
    { key: 'kd', label: 'K/D', font: rowFont },
    { key: 'kdr', label: 'Ratio', font: rowFont },
    { key: 'dmg', label: 'Damage', font: rowFont },
    { key: 'dur', label: 'Dur', font: rowFont },
    { key: 'heroes', label: 'Top Heroes', font: smallFont },
    { key: 'replay', label: 'Replay', font: smallFont },
    { key: 'time', label: 'Time', font: smallFont }
  ];

  columns.forEach(col => {
    const headerW = measure(headerFont, col.label || '');
    const contentW = Math.max(headerW, ...processed.map(p => measure(col.font, p[col.key] || '')));
    col.width = Math.max(50, contentW);
  });
  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
  let WIDTH = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth)));

  // If width overflows, allow hero column truncation
  const heroCol = columns.find(c => c.key === 'heroes');
  if (WIDTH === MAX_WIDTH && heroCol) {
    // recompute hero column to fit remainder
    const otherWidth = columns.filter(c => c !== heroCol).reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
    const remaining = WIDTH - otherWidth;
    if (remaining < heroCol.width) heroCol.width = Math.max(120, remaining);
  }

  const BASE = 150; const FOOTER = 70; const HEIGHT = BASE + ROW_H * (processed.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, '#101726'); grad.addColorStop(1, '#18263A');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawText(ctx, `Scrim Matches (S${season})`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });
  drawText(ctx, `Total Matches: ${rows.length} • Generated ${new Date().toLocaleDateString()}`, OUTER_MARGIN, 100, { font: `400 ${FONT_SMALL}px ${FONT_STACK}`, color: '#D1DAE8' });

  // Table background
  const tableX = OUTER_MARGIN; const tableY = TABLE_TOP_OFFSET; const tableW = WIDTH - OUTER_MARGIN * 2; const tableH = ROW_H * (processed.length + 1) + 36;
  ctx.fillStyle = '#141C2A';
  roundRect(ctx, tableX, tableY, tableW, tableH, 18); ctx.fill();

  let curX = tableX + 28;
  columns.forEach(col => { col.x = curX; curX += col.width + MIN_GAP; });
  const headerY = tableY + 52;
  columns.forEach(col => { if (col.label) drawText(ctx, col.label, col.x, headerY, { font: headerFont, color: '#AAB4CF' }); });

  processed.forEach((row, i) => {
    const rowY = headerY + (i + 1) * ROW_H;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(tableX + 10, rowY - ROW_H + 12, tableW - 20, ROW_H - 10);
    }
    columns.forEach(col => {
      let text = row[col.key] || '';
      const font = (col.key === 'heroes' || col.key === 'replay' || col.key === 'time') ? smallFont : rowFont;
      // truncate hero names to fit
      if (col.key === 'heroes' && text) {
        mctx.font = font;
        while (mctx.measureText(text).width > col.width && text.length > 4) {
          text = text.slice(0, -2) + '…';
        }
      }
      const color = col.key === 'result' ? (text === 'W' ? '#4CAF50' : text === 'L' ? '#F44336' : '#D1DAE8') : '#FFFFFF';
      drawText(ctx, text, col.x, rowY - 16, { font, color });
    });
  });

  drawText(ctx, `Rows: ${processed.length}/${rows.length}`, OUTER_MARGIN, HEIGHT - 28, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}

// ENCOUNTERS CARD -----------------------------------------------------------
// allies/enemies: already normalized arrays from encounters command (limit applied there or passed raw then sliced)
// Each item fields: handle, matchesTogether, winPctTogether, kdTogether, lastTs, seasonRankTier, seasonWinPct, seasonKD, seasonMatches, seasonRankScore
export function renderEncountersCard({ username, season, allies = [], enemies = [], totalAllies = 0, totalEnemies = 0, limit }) {
  const FONT_TITLE = 48;
  const FONT_USER = 30;
  const FONT_HEADER = 20;
  const FONT_ROW = 20;
  const FONT_SMALL = 16;
  const OUTER_MARGIN = 40;
  const ROW_H = 48;
  const TABLE_TOP_OFFSET = 130;
  const MIN_GAP = 22; // tighter gap for encounters
  const MIN_WIDTH = 1050; // dynamic minimum
  const MAX_WIDTH = 1700; // reduced maximum

  // Build combined rows with group headers
  const rows = [];
  if (allies.length) {
    rows.push({ groupHeader: true, label: '🤝 Played With' });
    allies.forEach((a, idx) => rows.push({
      groupHeader: false,
      idx: `${idx + 1}.`,
      player: a.seasonRankTier ? `${a.handle} (${a.seasonRankTier})` : a.handle,
      games: a.matchesTogether || 0,
      win: typeof a.winPctTogether === 'number' ? a.winPctTogether : null,
      kd: a.kdTogether || 0,
      last: a.lastTs ? new Date(a.lastTs).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—',
      sWin: typeof a.seasonWinPct === 'number' ? a.seasonWinPct : null,
      sKd: typeof a.seasonKD === 'number' ? a.seasonKD : null,
      rs: a.seasonRankScore || 0
    }));
  }
  if (enemies.length) {
    rows.push({ groupHeader: true, label: '⚔️ Played Against' });
    enemies.forEach((a, idx) => rows.push({
      groupHeader: false,
      idx: `${idx + 1}.`,
      player: a.seasonRankTier ? `${a.handle} (${a.seasonRankTier})` : a.handle,
      games: a.matchesTogether || 0,
      win: typeof a.winPctTogether === 'number' ? a.winPctTogether : null,
      kd: a.kdTogether || 0,
      last: a.lastTs ? new Date(a.lastTs).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—',
      sWin: typeof a.seasonWinPct === 'number' ? a.seasonWinPct : null,
      sKd: typeof a.seasonKD === 'number' ? a.seasonKD : null,
      rs: a.seasonRankScore || 0
    }));
  }

  if (!rows.length) throw new Error('No encounter data to render');

  // Measurement setup
  const measureCanvas = createCanvas(10, 10); const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(String(text)).width; }
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFont = `400 ${FONT_SMALL}px ${FONT_STACK}`;
  const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;

  // Define visible data columns (excluding group headers)
  const columns = [
    { key: 'idx', label: '#', font: rowFont },
    { key: 'player', label: 'Player', font: rowFont },
    { key: 'games', label: 'Games', font: rowFont },
    { key: 'win', label: 'Win %', font: rowFont },
    { key: 'kd', label: 'K/D', font: rowFont },
    { key: 'last', label: 'Last', font: rowFont },
    { key: 'sWin', label: 'S Win %', font: rowFont },
    { key: 'sKd', label: 'S K/D', font: rowFont },
    { key: 'rs', label: 'RS', font: rowFont }
  ];

  // Measure widths skipping group header rows
  const dataRows = rows.filter(r => !r.groupHeader);
  columns.forEach(col => {
    const headerW = measure(headerFont, col.label);
    const contentW = Math.max(headerW, ...dataRows.map(r => {
      let v = r[col.key];
      if (v == null) return 0;
      if (typeof v === 'number') {
        if (col.key.includes('Win')) return measure(col.font, v.toFixed(1) + '%');
        if (col.key === 'kd' || col.key === 'sKd') return measure(col.font, v.toFixed(2));
        if (col.key === 'games' || col.key === 'rs') return measure(col.font, String(v));
      }
      return measure(col.font, v);
    }));
    col.width = Math.max(60, contentW) + 4;
  });
  // Minimum player width
  const playerCol = columns.find(c => c.key === 'player'); if (playerCol) playerCol.width = Math.max(playerCol.width, 180);

  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
  let WIDTH = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(requiredInnerWidth)));

  // If there's excessive leftover space (>160px slack) after sizing, proportionally shrink numeric/stat columns
  let slack = WIDTH - requiredInnerWidth;
  if (slack > 160) {
    const shrinkTargets = columns.filter(c => ['games', 'win', 'kd', 'sWin', 'sKd', 'rs'].includes(c.key));
    // compute target shrink distributing up to 120px slack removal
    const maxRecover = Math.min(slack - 60, 180); // leave some breathing room
    const per = maxRecover / shrinkTargets.length;
    shrinkTargets.forEach(c => {
      const newW = c.width - per * 0.6; // soften shrink
      if (newW > 70) c.width = newW; // keep sensible minimum
    });
    requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
    WIDTH = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(requiredInnerWidth)));
  }

  const BASE = 150; const FOOTER = 70; const HEIGHT = BASE + ROW_H * (rows.length + 1 /* header row per group table? we use single header */ + (rows.filter(r => r.groupHeader).length)) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, '#0E1522'); grad.addColorStop(1, '#1B2B40');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawText(ctx, `Encounters (S${season})`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });
  drawText(ctx, `Teammates: ${totalAllies} • Enemies: ${totalEnemies} • Limit ${limit}`, OUTER_MARGIN, 100, { font: `400 ${FONT_SMALL}px ${FONT_STACK}`, color: '#D1DAE8' });

  // Table container
  const tableX = OUTER_MARGIN; const tableY = TABLE_TOP_OFFSET; const tableW = WIDTH - OUTER_MARGIN * 2; const tableH = ROW_H * (rows.length + 1) + 50;
  ctx.fillStyle = '#141C2A'; roundRect(ctx, tableX, tableY, tableW, tableH, 18); ctx.fill();

  // Column positions
  let curX = tableX + 28; columns.forEach(col => { col.x = curX; curX += col.width + MIN_GAP; });
  const headerY = tableY + 52;
  columns.forEach(col => drawText(ctx, col.label, col.x, headerY, { font: headerFont, color: '#AAB4CF' }));

  // Render rows under header, inserting group header styled rows
  let rowIndex = 0; // counts drawn rows after header for vertical positioning
  rows.forEach(r => {
    if (r.groupHeader) {
      // full-width bar
      const yBase = headerY + (rowIndex + 1) * ROW_H;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(tableX + 14, yBase - ROW_H + 10, tableW - 28, ROW_H - 12);
      drawText(ctx, r.label, tableX + 40, yBase - 18, { font: `600 ${FONT_ROW}px ${FONT_STACK}`, color: '#6DD3FB' });
      rowIndex++;
      return;
    }
    const yBase = headerY + (rowIndex + 1) * ROW_H;
    if (rowIndex % 2 === 1) { // alternate shading for data rows only
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(tableX + 10, yBase - ROW_H + 12, tableW - 20, ROW_H - 10);
    }
    columns.forEach(col => {
      let text;
      if (col.key === 'win' && r.win != null) text = r.win.toFixed(1) + '%';
      else if (col.key === 'sWin' && r.sWin != null) text = r.sWin.toFixed(1) + '%';
      else if (['kd', 'sKd'].includes(col.key) && r[col.key] != null) text = r[col.key].toFixed(2);
      else text = r[col.key] != null ? String(r[col.key]) : '—';
      if (col.key === 'player') {
        // truncate to fit
        mctx.font = col.font;
        let attempt = text;
        while (mctx.measureText(attempt).width > col.width && attempt.length > 4) {
          attempt = attempt.slice(0, -2) + '…';
        }
        text = attempt;
      }
      let color = '#FFFFFF';
      if (col.key === 'win' || col.key === 'sWin') {
        const val = parseFloat(text); if (!isNaN(val)) color = val >= 55 ? '#4CAF50' : val >= 50 ? '#FFC107' : '#F44336';
      } else if (col.key === 'kd' || col.key === 'sKd') {
        const val = parseFloat(text); if (!isNaN(val) && val >= 4) color = '#6DD3FB';
      }
      drawText(ctx, text, col.x, yBase - 18, { font: col.font, color });
    });
    rowIndex++;
  });

  drawText(ctx, `Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    OUTER_MARGIN, HEIGHT - 28, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}
