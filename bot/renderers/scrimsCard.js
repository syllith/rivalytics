import { createCanvas, roundRect, drawText, formatShortNumber, FONT_STACK } from './canvasCommon.js';

// Scrim match summary card (non-ranked / practice context)
// Supports pagination: page parameter (0-indexed), ROWS_PER_PAGE=20, max 100 total
// 20 per page to match Discord's button limit (5 rows max, 1 for nav = 4 rows × 5 buttons = 20)
export const SCRIMS_ROWS_PER_PAGE = 20;
export const SCRIMS_MAX_TOTAL = 100;

export function renderScrimsCard({ username, season, rows, page = 0, totalRows = null }) {
  // Support pagination: each page shows up to 25 rows
  const totalAvailable = totalRows ?? rows.length;
  const totalPages = Math.ceil(Math.min(totalAvailable, SCRIMS_MAX_TOTAL) / SCRIMS_ROWS_PER_PAGE);
  const startIdx = page * SCRIMS_ROWS_PER_PAGE;
  const pageRows = rows.slice(startIdx, startIdx + SCRIMS_ROWS_PER_PAGE);
  const MAX_ROWS = pageRows.length;
  const FONT_TITLE = 48, FONT_USER = 30, FONT_HEADER = 20, FONT_ROW = 20, FONT_SMALL = 16;
  const OUTER_MARGIN = 40, ROW_H = 48, TABLE_TOP_OFFSET = 130, MIN_GAP = 28, BASE_WIDTH = 1500, MAX_WIDTH = 1900;

  // Normalize input rows into render-friendly shape (with adjusted index for current page)
  const processed = pageRows.map((r, i) => ({
    idx: `${startIdx + i + 1}.`,
    // Store semantic outcome instead of raw emoji so we can custom-render if emoji fonts are missing
    outcome: r.resultEmoji === '🟢' ? 'win' : r.resultEmoji === '🔴' ? 'loss' : 'unknown',
    map: r.mapName || 'Unknown',
    kd: `${r.kills}/${r.deaths}`,
    kdr: String(r.kd || '0'),
    dmg: typeof r.damage === 'number' ? formatShortNumber(r.damage) : r.damage || '0',
    dur: r.duration || '?:??',
    heroes: r.heroes || '',
    replay: r.replay || '',
    time: r.timestamp ? (() => { const d = new Date(r.timestamp); return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); })() : ''
  }));

  // Measurement helpers for responsive widths
  const measureCanvas = createCanvas(10, 10); const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(text).width; }
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`; const smallFont = `400 ${FONT_SMALL}px ${FONT_STACK}`; const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;

  // Column layout definition
  const columns = [
    { key: 'idx', label: '#', font: rowFont, align: 'right', pad: 0 },
    { key: 'outcome', label: 'R', font: rowFont, align: 'center', fixed: 50 },
    { key: 'map', label: 'Map', font: rowFont, align: 'left' },
    { key: 'kd', label: 'K/D', font: rowFont, align: 'right' },
    { key: 'kdr', label: 'Ratio', font: rowFont, align: 'right' },
    { key: 'dmg', label: 'Damage', font: rowFont, align: 'right' },
    { key: 'dur', label: 'Dur', font: rowFont, align: 'right' },
    { key: 'heroes', label: 'Top Heroes', font: smallFont, align: 'left' },
    { key: 'replay', label: 'Replay', font: smallFont, align: 'right' },
    { key: 'time', label: 'Time', font: smallFont, align: 'right' }
  ];
  columns.forEach(col => {
    if (col.fixed) { col.width = col.fixed; return; }
    const headerW = measure(headerFont, col.label || '');
    const contentW = Math.max(headerW, ...processed.map(p => measure(col.font, p[col.key] || '')));
    col.width = Math.max(50, contentW + (col.align === 'left' ? 10 : 0));
  });

  // Total width computation (clamped between base & max)
  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40; let WIDTH = Math.min(MAX_WIDTH, Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth)));
  const heroCol = columns.find(c => c.key === 'heroes');
  if (WIDTH === MAX_WIDTH && heroCol) { // adjust heroes column if constrained
    const otherWidth = columns.filter(c => c !== heroCol).reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
    const remaining = WIDTH - otherWidth;
    if (remaining < heroCol.width) heroCol.width = Math.max(120, remaining);
  }

  // Canvas dimensions
  const BASE = 150, FOOTER = 70, HEIGHT = BASE + ROW_H * (processed.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');

  // Background gradient (cooler palette for scrims)
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT); grad.addColorStop(0, '#101726'); grad.addColorStop(1, '#18263A'); ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title + meta header (show page info if paginated)
  const pageLabel = totalPages > 1 ? ` (Page ${page + 1}/${totalPages})` : '';
  drawText(ctx, `Scrim Matches (S${season})${pageLabel}`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });
  drawText(ctx, `Total Matches: ${totalAvailable} • Page ${page + 1} of ${totalPages} • Generated ${new Date().toLocaleDateString()}`, OUTER_MARGIN, 100, { font: `400 ${FONT_SMALL}px ${FONT_STACK}`, color: '#D1DAE8' });

  // Table container
  const tableX = OUTER_MARGIN, tableY = TABLE_TOP_OFFSET, tableW = WIDTH - OUTER_MARGIN * 2, tableH = ROW_H * (processed.length + 1) + 36; ctx.fillStyle = '#141C2A'; roundRect(ctx, tableX, tableY, tableW, tableH, 18); ctx.fill();
  let curX = tableX + 28;
  columns.forEach(col => { col.x = curX; curX += col.width + MIN_GAP; }); // col.x is left edge
  const headerY = tableY + 52;
  columns.forEach(col => {
    if (!col.label) return;
    const hx = col.align === 'right' ? col.x + col.width : col.align === 'center' ? col.x + col.width / 2 : col.x;
    drawText(ctx, col.label, hx, headerY, { font: headerFont, color: '#AAB4CF', align: col.align || 'left', baseline: 'alphabetic' });
  });

  // Data rows with alternating shading + truncation for wide hero sets
  processed.forEach((row, i) => {
    const rowY = headerY + (i + 1) * ROW_H;
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(tableX + 10, rowY - ROW_H + 12, tableW - 20, ROW_H - 10); }
    columns.forEach(col => {
      const cellMidY = rowY - (ROW_H / 2) + 6; // center baseline correction
      if (col.key === 'outcome') {
        const centerY = cellMidY + 4; // fine tune
        const centerX = col.x + col.width / 2;
        const radius = 14;
        let fill = '#4C5A6F';
        if (row.outcome === 'win') fill = '#2EAD5A';
        else if (row.outcome === 'loss') fill = '#D03C2F';
        ctx.beginPath();
        ctx.fillStyle = fill;
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        const letter = row.outcome === 'win' ? 'W' : row.outcome === 'loss' ? 'L' : '-';
        drawText(ctx, letter, centerX, centerY + 1, { font: `600 18px ${FONT_STACK}`, align: 'center', baseline: 'middle', color: '#FFFFFF' });
        return;
      }
      let text = row[col.key] || '';
      const font = (col.key === 'heroes' || col.key === 'replay' || col.key === 'time') ? smallFont : rowFont;
      if (col.key === 'heroes' && text) {
        mctx.font = font;
        while (mctx.measureText(text).width > col.width - 4 && text.length > 4) text = text.slice(0, -2) + '…';
      }
      const drawX = col.align === 'right' ? col.x + col.width : col.align === 'center' ? col.x + col.width / 2 : col.x;
      drawText(ctx, text, drawX, cellMidY + 8, { font, color: '#FFFFFF', align: col.align || 'left', baseline: 'alphabetic' });
    });
  });

  // Footer meta
  const rowRangeStart = startIdx + 1;
  const rowRangeEnd = startIdx + processed.length;
  drawText(ctx, `Showing ${rowRangeStart}-${rowRangeEnd} of ${totalAvailable} matches`, OUTER_MARGIN, HEIGHT - 28, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}
