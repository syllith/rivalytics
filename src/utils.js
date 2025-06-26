// src/utils.js

// --- Constants ---
export const RANKS = {
  order: ['Agent', 'Knight', 'Captain', 'Centurion', 'Lord'],
  caps:    { Agent: 500, Knight: 1200, Captain: 2000, Centurion: 2400, Lord: 2400 },
  multipliers: { Agent: 1.3, Knight: 1.35, Captain: 1.4, Centurion: 1.45, Lord: 1.55 }
};

export const FIELD_REWARDS = [60, 40, 25, 20];

export const SIM = {
  JITTER_MIN:     0.85,
  JITTER_RANGE:   0.3,
  DEFAULT_RATIO:  0.16,
  MINUTES_MIN:    5,
  MINUTES_RANGE:  11
};

// --- Formatting & Color Helpers ---
export const formatNumber = n => n.toLocaleString();

export function getMatchesLeftColor(matches) {
  if (matches === '–' || matches === Infinity) return '#b0b0b0';
  if (matches <= 2)                            return '#4caf50';
  if (matches <= 5)                            return '#ffd600';
  return '#f44336';
}

export function getProgressColor(pct) {
  const percent = Math.max(0, Math.min(100, pct));
  const hue     = percent * 1.2;
  return `hsl(${hue},100%,45%)`;
}

// --- Rank Calculations ---
export const getRankCap = rank =>
  RANKS.caps[rank];

export function getNextRank(current) {
  const idx = RANKS.order.indexOf(current);
  return idx < RANKS.order.length - 1
    ? RANKS.order[idx + 1]
    : current;
}

export function computeWrappedDelta(cur, prev, prevMax) {
  let diff = cur - prev;
  if (diff < 0) {
    diff += Math.ceil((prev - cur) / prevMax) * prevMax;
  }
  return diff;
}

export function applyChallengeGains(stats, gains) {
  gains.forEach((gain, i) => {
    const curKey = `field${i+1}Current`;
    const maxKey = `field${i+1}Max`;
    stats[curKey] += gain;
    while (stats[curKey] >= stats[maxKey]) {
      stats[curKey]           -= stats[maxKey];
      stats.proficiencyCurrent += FIELD_REWARDS[i];
    }
  });

  while (stats.proficiencyCurrent >= getRankCap(stats.status)) {
    stats.proficiencyCurrent -= getRankCap(stats.status);
    stats.status             = getNextRank(stats.status);
  }

  stats.proficiencyMax = getRankCap(stats.status);
}

// --- OCR & Image Helpers ---
export function cropImage(srcCanvas, sw, sh) {
  const leftFrac   = 950 / 2560;
  const topFrac    = 289 / 1440;
  const rightFrac  = 1704 / 2560;
  const bottomFrac = 1200 / 1440;

  const x = Math.floor(leftFrac  * sw);
  const y = Math.floor(topFrac   * sh);
  const w = Math.floor((rightFrac - leftFrac) * sw);
  const h = Math.floor((bottomFrac - topFrac) * sh);

  const tmp = document.createElement('canvas');
  tmp.width  = w;
  tmp.height = h;
  tmp.getContext('2d')
     .drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);

  return tmp;
}

export function parseOcrResult(items) {
  const texts     = items.map(({ text }) => text.trim());
  const STATUS_RX = /\b(Agent|Knight|Captain|Centurion|Lord)\b/i;
  const PAIR_RX   = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/;

  // rank
  const rawStatus = texts.find(t => STATUS_RX.test(t))?.match(STATUS_RX)?.[1];
  if (!rawStatus) throw new Error('Failed to parse rank');
  const status = rawStatus[0].toUpperCase() + rawStatus.slice(1).toLowerCase();

  // overall proficiency
  const profText = texts.find(t => /proficiency/i.test(t) && PAIR_RX.test(t));
  if (!profText) throw new Error('Failed to parse overall proficiency');
  const [, curStr, maxStr] = profText.match(PAIR_RX);
  const proficiencyCurrent = parseInt(curStr.replace(/,/g, ''), 10);
  const proficiencyMax     = parseInt(maxStr.replace(/,/g, ''), 10);

  // challenge pairs
  const profIndex = texts.indexOf(profText);
  const nnIndices = texts
    .map((t,i) => PAIR_RX.test(t) ? i : -1)
    .filter(i => i>=0 && i!==profIndex)
    .slice(0, 4);
  if (nnIndices.length < 4) throw new Error('Failed to parse challenges');

  const challenges = nnIndices.map(idx => {
    const [curRaw, maxRaw] = texts[idx].split('/');
    const cur = parseInt(curRaw.replace(/,/g,''), 10);
    const max = parseInt(maxRaw.replace(/,/g,''), 10);
    const name = [texts[idx-1], texts[idx-2], texts[idx+1], texts[idx+2]]
      .find(c => c && !PAIR_RX.test(c) && !STATUS_RX.test(c) && !/proficiency/i.test(c) && c.length>2)
      ?.replace(/^CO\s*/i,'').trim() || '';
    return { name, cur, max };
  });

  const stats = { status, proficiencyCurrent, proficiencyMax, fieldNames: challenges.map(c=>c.name) };
  challenges.forEach(({ cur, max }, i) => {
    stats[`field${i+1}Current`] = cur;
    stats[`field${i+1}Max`]     = max;
  });

  return stats;
}

// --- Playtime & Simulation Helpers ---
export function calculatePlaytimeDuration(points) {
  return points; // 1 point per minute
}

export function getFieldRewardsForRank(rank) {
  switch (rank) {
    case 'Lord':
    case 'Centurion': return [60,50,50,50];
    case 'Captain':   return [60,40,40,40];
    case 'Knight':    return [60,25,25,25];
    default:          return [60,10,10,10];
  }
}

export function computeAverageGains(entries) {
  if (entries.length < 2) return [];
  return FIELD_REWARDS.map((_, idx) => {
    let total = 0;
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i-1].stats;
      const curr = entries[i].stats;
      total += computeWrappedDelta(
        curr[`field${idx+1}Current`],
        prev[`field${idx+1}Current`],
        prev[`field${idx+1}Max`]
      );
    }
    return total / (entries.length - 1);
  });
}
