import { createCanvas, roundRect, drawText, formatShortNumber, FONT_STACK, drawOutcomeBadge } from './canvasCommon.js';

// Competitive matches card: recent ranked games with rank deltas & performance stats
export function renderMatchesCard({ username, season, currentRank, currentScore, combinedRows }) {
  //. Cap to most recent 10 rows for readability
  const rows = combinedRows.slice(0, 10);

  // Font + layout constants (retained as originally used)
  const FONT_TITLE = 52, FONT_USER = 34, FONT_SUB = 28, FONT_HEADER = 24, FONT_ROW = 22, FONT_SMALL = 18;
  const ROW_H = 64, OUTER_MARGIN = 48, TABLE_TOP_OFFSET = 140, MIN_GAP = 32, MAX_WIDTH = 1800, BASE_WIDTH = 1400;

  // Flatten & pre-format row values (ensures consistent measurement + drawing)
  const rowStrings = rows.map(r => ({
    idx: `${r.index}.`,
    outcome: r.resultEmoji === '🟢' ? 'win' : r.resultEmoji === '🔴' ? 'loss' : 'unknown',
    map: r.mapName.split(' • ')[0],
    delta: r.delta || '-',
    rs: r.rankScore.toLocaleString('en-US'),
    kdKillsDeaths: `${r.kills}/${r.deaths}`,
    kdRatio: String(r.kd),
    dmg: formatShortNumber(r.damage),
    dur: r.duration,
    time: r.timestamp ? (() => { const d = new Date(r.timestamp); return d.toLocaleDateString('en-US',{month:'numeric',day:'numeric'}) + ' ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}); })() : '-',
    replay: r.replay || '',
    rank: currentRank
  }));

  // Measurement helpers for dynamic layout
  const measureCanvas = createCanvas(10,10); const mctx = measureCanvas.getContext('2d');
  function measure(fontSpec,text){ mctx.font = fontSpec; return mctx.measureText(text).width; }
  const rowFontSpec = `400 ${FONT_ROW}px ${FONT_STACK}`;
  const smallFontSpec = `400 ${FONT_SMALL}px ${FONT_STACK}`;
  const headerFontSpec = `600 ${FONT_HEADER}px ${FONT_STACK}`;

  // Column metadata (order => visual order)
  const columns = [
    { key:'idx', label:'#', font: rowFontSpec, align:'right' },
    { key:'outcome', label:'R', font: rowFontSpec, align:'center', fixed:50 },
    { key:'map', label:'Map', font: rowFontSpec, align:'left' },
    { key:'delta', label:'Rank Δ', font: rowFontSpec, align:'right' },
    { key:'rs', label:'RS After', font: rowFontSpec, align:'right' },
    { key:'kd', label:'K/D', font: rowFontSpec, align:'right' },
    { key:'dmg', label:'Damage', font: rowFontSpec, align:'right' },
    { key:'dur', label:'Dur', font: rowFontSpec, align:'right' },
    { key:'time', label:'Time', font: smallFontSpec, align:'right' },
    { key:'replay', label:'Replay', font: smallFontSpec, align:'right' },
    { key:'rank', label:'Rank', font: smallFontSpec, align:'right' }
  ];
  const KD_INTERNAL_GAP = 44; // visual spacing inside K/D composite column
  columns.forEach(col => {
    if (col.fixed) { col.width = col.fixed; return; }
    const headerW = measure(headerFontSpec, col.label);
    if (col.key === 'kd') { // composite column width = kills/deaths + gap + ratio
      const kdKillsDeathsWidth = Math.max(...rowStrings.map(r=>measure(col.font, r.kdKillsDeaths)));
      const kdRatioWidth = Math.max(...rowStrings.map(r=>measure(col.font, r.kdRatio)));
      col.kdKillsDeathsWidth = kdKillsDeathsWidth; col.kdRatioWidth = kdRatioWidth; col.internalGap = KD_INTERNAL_GAP;
      const kdTotal = kdKillsDeathsWidth + KD_INTERNAL_GAP + kdRatioWidth;
      col.width = Math.max(headerW, kdTotal + 4);
    } else {
      const contentW = Math.max(...rowStrings.map(r=>measure(col.font, r[col.key]||'')));
      col.width = Math.max(headerW, contentW + (col.align === 'left' ? 10 : 0));
    }
  });

  // Calculate total width (clamped to limits)
  let requiredInnerWidth = columns.reduce((a,c)=>a+c.width,0) + MIN_GAP*(columns.length-1) + OUTER_MARGIN*2 + 32;
  let WIDTH = Math.max(BASE_WIDTH, Math.ceil(requiredInnerWidth));
  if (WIDTH > MAX_WIDTH) WIDTH = MAX_WIDTH;

  // Rank column abbreviation if at max width and rank strings are long
  if (WIDTH === MAX_WIDTH) {
    const rankCol = columns.find(c=>c.key==='rank');
    const abbreviated = currentRank.replace(/Grandmaster/gi,'GM').replace(/Platinum/gi,'Plat').replace(/Diamond/gi,'Dia').replace(/Master/gi,'Mstr');
    if (abbreviated !== currentRank) {
      rowStrings.forEach(r=>{ r.rank = abbreviated; });
      rankCol.width = Math.max(measure(headerFontSpec, rankCol.label), Math.max(...rowStrings.map(r=>measure(smallFontSpec, r.rank))));
    }
  }

  // Canvas sizing
  const BASE = 160, FOOTER = 80, HEIGHT = BASE + ROW_H * (rows.length + 1) + FOOTER;
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0,0,WIDTH,HEIGHT); grad.addColorStop(0,'#0B0F1A'); grad.addColorStop(1,'#13202F'); ctx.fillStyle = grad; ctx.fillRect(0,0,WIDTH,HEIGHT);

  // Title + contextual subtitle
  drawText(ctx, `Competitive Matches (S${season})`, OUTER_MARGIN, 56, { font: `600 ${FONT_TITLE}px ${FONT_STACK}` });
  drawText(ctx, username, WIDTH - OUTER_MARGIN, 56, { font: `300 ${FONT_USER}px ${FONT_STACK}`, align:'right', color:'#AAB4CF' });
  drawText(ctx, `Current Rank: ${currentRank} • Score: ${currentScore}`, OUTER_MARGIN, 112, { font: `400 ${FONT_SUB}px ${FONT_STACK}`, color:'#FFFFFF' });

  // Table container rectangle
  const tableX = OUTER_MARGIN, tableY = TABLE_TOP_OFFSET, tableW = WIDTH - OUTER_MARGIN * 2, tableH = ROW_H * (rows.length + 1) + 40;
  ctx.fillStyle = '#141C2A'; roundRect(ctx, tableX, tableY, tableW, tableH, 20); ctx.fill();

  // Column x positions & header labels
  let cursorX = tableX + 28; columns.forEach(c=>{ c.x = cursorX; cursorX += c.width + MIN_GAP; }); // left edges
  const headerBaselineY = tableY + 54;
  columns.forEach(c => {
    const hx = c.align === 'right' ? c.x + c.width : c.align === 'center' ? c.x + c.width/2 : c.x;
    drawText(ctx, c.label, hx, headerBaselineY, { font: headerFontSpec, color:'#AAB4CF', align: c.align || 'left' });
  });

  function colFont(c){ if(['time','replay','rank'].includes(c.key)) return `400 ${FONT_SMALL}px ${FONT_STACK}`; return `400 ${FONT_ROW}px ${FONT_STACK}`; }

  // Row rendering with alternating shading bands
  rows.forEach((_, i) => {
    const baseY = headerBaselineY + (i+1) * ROW_H;
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(tableX + 8, baseY - ROW_H + 10, tableW - 16, ROW_H - 8); }
    const data = rowStrings[i];
    columns.forEach(c => {
      const cellMidY = baseY - (ROW_H/2) + 8; // vertical center baseline adjustment
      if (c.key === 'outcome') {
        drawOutcomeBadge(ctx, c.x + c.width/2, cellMidY + 4, data.outcome);
        return;
      }
      if (c.key === 'kd') {
        const killsDeathsX = c.align === 'right' ? c.x + c.width - (c.kdRatioWidth + c.internalGap + c.kdKillsDeathsWidth) : c.x;
        drawText(ctx, data.kdKillsDeaths, killsDeathsX, baseY - 18, { font: colFont(c), color:'#FFFFFF' });
        const ratioX = killsDeathsX + c.kdKillsDeathsWidth + c.internalGap;
        drawText(ctx, data.kdRatio, ratioX, baseY - 18, { font: colFont(c), color:'#FFFFFF' });
        return;
      }
      let text = data[c.key] ?? '';
      const f = colFont(c);
      if (c.key === 'map') { mctx.font = f; let attempt = text; while (mctx.measureText(attempt).width > c.width && attempt.length > 5) attempt = attempt.slice(0,-2) + '…'; text = attempt; }
      const gainColor = c.key === 'delta' ? (text.startsWith('+') ? '#4CAF50' : text.startsWith('-') ? '#F44336' : '#D1DAE8') : '#FFFFFF';
      const color = c.key === 'delta' ? gainColor : (c.key === 'replay' ? '#6DD3FB' : (c.key === 'time' ? '#D1DAE8' : '#FFFFFF'));
      const drawX = c.align === 'right' ? c.x + c.width : c.align === 'center' ? c.x + c.width/2 : c.x;
      drawText(ctx, text, drawX, baseY - 18, { font: f, color, align: c.align || 'left' });
    });
  });

  // Footer metadata (timestamp)
  drawText(ctx, `Generated ${new Date().toLocaleString()}`, OUTER_MARGIN, HEIGHT - 30, { font: `300 ${FONT_SMALL}px ${FONT_STACK}`, color:'#AAB4CF' });
  return canvas.toBuffer('image/png');
}
