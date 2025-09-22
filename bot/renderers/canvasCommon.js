// Shared canvas utilities & font registration for card renderers
//. Central place so individual card files stay lean and consistent
import canvasPkg from '@napi-rs/canvas';
const { createCanvas } = canvasPkg;
const rawRegisterFont = typeof canvasPkg.registerFont === 'function' ? canvasPkg.registerFont : null;
const globalFonts = canvasPkg.GlobalFonts;
import path from 'node:path';
import fs from 'node:fs';

export { createCanvas };

// Candidate directories (priority order) where bundled fonts may exist
const fontDirCandidates = [
  path.resolve(process.cwd(), 'assets/fonts'),
  path.resolve(process.cwd(), 'public/assets/fonts'),
  path.resolve(process.cwd(), 'public/fonts')
];

// Attempts registration with whichever API the @napi-rs/canvas build exposes
function safeRegisterFont(filePath, opts) {
  if (rawRegisterFont) {
    try { rawRegisterFont(filePath, opts); } catch { /* ignore */ }
  } else if (globalFonts && typeof globalFonts.register === 'function') {
    try { globalFonts.register(filePath, opts); } catch { /* ignore */ }
  }
}

// Try each candidate path until the first match; silent if none found
function tryRegisterFont(filename, family, weight = 'normal') {
  for (const dir of fontDirCandidates) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      safeRegisterFont(p, { family, weight });
      break;
    }
  }
}

// Attempt registrations (best effort) — failures are non-fatal
tryRegisterFont('Lexend-Medium.ttf', 'Lexend', '500');
tryRegisterFont('Lexend-Thin.ttf', 'Lexend', '300');
tryRegisterFont('Montserrat.ttf', 'Montserrat', '600');
tryRegisterFont('opensans.ttf', 'OpenSans', '400');
tryRegisterFont('Quicksand-Regular.ttf', 'Quicksand', '400');

export const FONT_STACK = 'Montserrat, Lexend, OpenSans, Quicksand, Arial, sans-serif';

// Rounded rectangle path helper (non-filling; caller fills/strokes)
export function roundRect(ctx, x, y, w, h, r) {
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

// drawText: thin wrapper adding defaults + optional maxWidth
export function drawText(ctx, text, x, y, opts = {}) {
  const { color = '#FFFFFF', font = '16px ' + FONT_STACK, align = 'left', baseline = 'alphabetic', maxWidth } = opts;
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth) ctx.fillText(text, x, y, maxWidth); else ctx.fillText(text, x, y);
}

// formatShortNumber: compact large numbers (e.g. 12.3K / 4.1M)
export function formatShortNumber(num) {
  if (num == null || isNaN(num)) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
}
