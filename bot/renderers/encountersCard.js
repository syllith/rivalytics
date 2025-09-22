import { createCanvas, roundRect, drawText, FONT_STACK } from './canvasCommon.js';

// Encounter card: aggregates teammate & opponent interaction stats
export function renderEncountersCard({ username, season, allies = [], enemies = [], totalAllies = 0, totalEnemies = 0, limit }) {
  const FONT_TITLE = 48, FONT_USER = 30, FONT_HEADER = 20, FONT_ROW = 20, FONT_SMALL = 16;
  const OUTER_MARGIN = 40, ROW_H = 48, TABLE_TOP_OFFSET = 130, MIN_GAP = 22, MIN_WIDTH = 1050, MAX_WIDTH = 1700;

  // Build ordered rows including group headers
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
  if (!rows.length) throw new Error('No encounter data to render'); //! Hard stop: nothing to display

  // Measurement utilities
  const measureCanvas = createCanvas(10, 10); const mctx = measureCanvas.getContext('2d');
  function measure(font, text) { mctx.font = font; return mctx.measureText(String(text)).width; }
  const rowFont = `400 ${FONT_ROW}px ${FONT_STACK}`; const headerFont = `600 ${FONT_HEADER}px ${FONT_STACK}`;

  // Column definitions (exclude group headers)
  const columns = [{ key: 'idx', label: '#', font: rowFont }, { key: 'player', label: 'Player', font: rowFont }, { key: 'games', label: 'Games', font: rowFont }, { key: 'win', label: 'Win %', font: rowFont }, { key: 'kd', label: 'K/D', font: rowFont }, { key: 'last', label: 'Last', font: rowFont }, { key: 'sWin', label: 'S Win %', font: rowFont }, { key: 'sKd', label: 'S K/D', font: rowFont }, { key: 'rs', label: 'RS', font: rowFont }];
  const dataRows = rows.filter(r => !r.groupHeader);
  columns.forEach(col => {
    const headerW = measure(headerFont, col.label);
    const contentW = Math.max(headerW, ...dataRows.map(r => {
      let v = r[col.key];
      if (v == null) return 0;
      if (typeof v === 'number') {
        if (col.key.includes('Win')) return measure(col.font, v.toFixed(1) + '%');
        if (['kd', 'sKd'].includes(col.key)) return measure(col.font, v.toFixed(2));
        if (['games', 'rs'].includes(col.key)) return measure(col.font, String(v));
      }
      return measure(col.font, v);
    }));
    col.width = Math.max(60, contentW) + 4;
  });
  const playerCol = columns.find(c => c.key === 'player'); if (playerCol) playerCol.width = Math.max(playerCol.width, 180);

  // Card width calculation & optional shrink pass
  let requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
  let WIDTH = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(requiredInnerWidth)));
  let slack = WIDTH - requiredInnerWidth;
  if (slack > 160) { // attempt to reclaim space from numeric columns
    const shrinkTargets = columns.filter(c => ['games', 'win', 'kd', 'sWin', 'sKd', 'rs'].includes(c.key));
    const maxRecover = Math.min(slack - 60, 180); // leave breathing room
    const per = maxRecover / shrinkTargets.length;
    shrinkTargets.forEach(c => { const newW = c.width - per * 0.6; if (newW > 70) c.width = newW; });
    requiredInnerWidth = columns.reduce((a, c) => a + c.width, 0) + MIN_GAP * (columns.length - 1) + OUTER_MARGIN * 2 + 40;
    WIDTH = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(requiredInnerWidth)));
  }

  // Canvas sizing
  const BASE = 150, FOOTER = 70, HEIGHT = BASE + ROW_H * (rows.length + 1 + rows.filter(r => r.groupHeader).length) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT); grad.addColorStop(0, '#0E1522'); grad.addColorStop(1, '#1B2B40'); ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header text block
  drawText(ctx, `Encounters (S${season})`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align: 'right', color: '#AAB4CF' });
  drawText(ctx, `Teammates: ${totalAllies} • Enemies: ${totalEnemies} • Limit ${limit}`, OUTER_MARGIN, 100, { font: `400 ${FONT_SMALL}px ${FONT_STACK}`, color: '#D1DAE8' });

  // Table panel
  const tableX = OUTER_MARGIN, tableY = TABLE_TOP_OFFSET, tableW = WIDTH - OUTER_MARGIN * 2, tableH = ROW_H * (rows.length + 1) + 50; ctx.fillStyle = '#141C2A'; roundRect(ctx, tableX, tableY, tableW, tableH, 18); ctx.fill();
  let curX = tableX + 28; columns.forEach(col => { col.x = curX; curX += col.width + MIN_GAP; });
  const headerY = tableY + 52; columns.forEach(col => drawText(ctx, col.label, col.x, headerY, { font: headerFont, color: '#AAB4CF' }));

  // Row rendering (group headers + alternating stripes for data rows)
  let rowIndex = 0;
  rows.forEach(r => {
    if (r.groupHeader) { // group section bar
      const yBase = headerY + (rowIndex + 1) * ROW_H;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(tableX + 14, yBase - ROW_H + 10, tableW - 28, ROW_H - 12);
      drawText(ctx, r.label, tableX + 40, yBase - 18, { font: `600 ${FONT_ROW}px ${FONT_STACK}`, color: '#6DD3FB' });
      rowIndex++;
      return;
    }
    const yBase = headerY + (rowIndex + 1) * ROW_H;
    if (rowIndex % 2 === 1) { // alternate shading for readability
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(tableX + 10, yBase - ROW_H + 12, tableW - 20, ROW_H - 10);
    }
    columns.forEach(col => {
      let text;
      if (col.key === 'win' && r.win != null) text = r.win.toFixed(1) + '%';
      else if (col.key === 'sWin' && r.sWin != null) text = r.sWin.toFixed(1) + '%';
      else if (['kd', 'sKd'].includes(col.key) && r[col.key] != null) text = r[col.key].toFixed(2);
      else text = r[col.key] != null ? String(r[col.key]) : '—';
      if (col.key === 'player') { // truncate long handle / tier combos
        mctx.font = col.font; let attempt = text;
        while (mctx.measureText(attempt).width > col.width && attempt.length > 4) attempt = attempt.slice(0, -2) + '…';
        text = attempt;
      }
      let color = '#FFFFFF';
      if (['win', 'sWin'].includes(col.key)) {
        const val = parseFloat(text); if (!isNaN(val)) color = val >= 55 ? '#4CAF50' : val >= 50 ? '#FFC107' : '#F44336';
      } else if (['kd', 'sKd'].includes(col.key)) {
        const val = parseFloat(text); if (!isNaN(val) && val >= 4) color = '#6DD3FB';
      }
      drawText(ctx, text, col.x, yBase - 18, { font: col.font, color });
    });
    rowIndex++;
  });

  // Footer timestamp
  drawText(ctx, `Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, OUTER_MARGIN, HEIGHT - 28, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color: '#AAB4CF' });
  return canvas.toBuffer('image/png');
}
