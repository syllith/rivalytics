import { SEASON_START } from './config.js';

// * Determine if a timestamp value is within the current season start boundary
//   Accepts number (ms or seconds), numeric string, ISO string, or Date-parsable string.
export function isWithinCurrentSeason(ts) {
  if (!ts) return false;
  let t;
  if (typeof ts === 'number') {
    t = ts < 1e12 ? ts * 1000 : ts; // interpret small numbers as seconds
  } else if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      const num = Number(ts);
      t = num < 1e12 ? num * 1000 : num;
    } else {
      t = Date.parse(ts);
    }
  } else {
    return false;
  }
  if (Number.isNaN(t)) return false;
  return t >= SEASON_START.getTime();
}

// * Determine if an object represents a competitive/ranked/tournament match.
//   Accepts either full match object or metadata object. Strict: excludes unknown/custom/practice/training.
export function isCompetitiveMode(obj) {
  const meta = obj?.metadata ? obj.metadata : obj; // allow metadata directly
  const attrMode = (obj?.attributes?.mode || '').toLowerCase();
  const metaMode = (meta?.modeName || meta?.mapModeName || '').toLowerCase();
  const combined = [attrMode, metaMode].filter(Boolean).join(' ');
  if (!combined) return false;
  if (/unknown|custom|practice|training/.test(combined)) return false; // ! explicitly ignored modes
  return /(competitive|ranked|tournament)/.test(combined);
}

// * Consolidate hero segment stats into aggregate objects keyed by hero name + role
// Compute effectiveness score (ported from web app Hero.jsx)
export function computeEffectiveness(h) {
  if (!h || (h.MatchesPlayed ?? 0) <= 0) return 0;
  const winPct = (h.MatchesWon || 0) / Math.max(1, h.MatchesPlayed || 0);
  const kda = ((h.Kills || 0) + (h.Assists || 0)) / Math.max(1, h.Deaths || 0);
  const dmgPerMatch = (h.TotalHeroDamage || 0) / Math.max(1, h.MatchesPlayed || 0);
  const healPerMatch = (h.TotalHeroHeal || 0) / Math.max(1, h.MatchesPlayed || 0);
  const dmgPerMin = h.TotalHeroDamagePerMinute || 0;
  const healPerMin = h.TotalHeroHealPerMinute || 0;
  const accuracy = (h.MainAttacks || 0) > 0 ? (h.MainAttackHits || 0) / Math.max(1, h.MainAttacks || 0) : 0;
  const headPct = (h.Kills || 0) > 0 ? (h.HeadKills || 0) / Math.max(1, h.Kills || 0) : 0;
  const survKillsPM = (h.SurvivalKills || 0) / Math.max(1, h.MatchesPlayed || 0);
  const dmgTakenPM = (h.TotalDamageTaken || 0) / Math.max(1, h.MatchesPlayed || 0);

  let eff =
    winPct * 40 +
    kda * 20 +
    (dmgPerMatch / 1000) * 6 +
    (healPerMatch / 1000) * 4 +
    (dmgPerMin / 100) * 4 +
    (healPerMin / 100) * 2 +
    accuracy * 10 +
    headPct * 10 +
    survKillsPM * 5 -
    (dmgTakenPM / 1000) * 5;

  return Math.max(0, eff);
}

// Convert a numeric efficiency score into a letter grade (100~F, 300~A), with +/-
export function scoreToGrade(score) {
  const grades = ['F','D-','D','D+','C-','C','C+','B-','B','B+','A-','A','A+'];
  if (score >= 650) return 'A+'; // elite tier
  if (score >= 400) return 'A';  // adjusted A threshold
  // Map 100..400 -> F..A linearly (12 buckets excluding A+)
  const t = Math.max(0, Math.min(1, (score - 100) / 300)); // 100->0, 400->1
  const idx = Math.min(11, Math.round(t * 11)); // 0..11 => F..A
  return grades[idx];
}

export function getHeroesFromResponse(resp) {
  if (!resp || !resp.data) return [];
  const heroMap = {};
  resp.data.forEach(seg => {
    if (seg.type !== 'hero') return;
    const role = seg.attributes.role[0].toUpperCase() + seg.attributes.role.slice(1);
    const key = `${seg.metadata.name} (${role})`;
    const s = seg.stats;
    if (!heroMap[key]) {
      heroMap[key] = {
        Name: seg.metadata.name,
        Role: role,
        TimePlayed: 0,
        MatchesPlayed: 0,
        MatchesWon: 0,
        Kills: 0,
        Deaths: 0,
        Assists: 0,
        TotalHeroDamage: 0,
        TotalHeroHeal: 0,
        TotalHeroDamagePerMinute: 0,
        TotalHeroHealPerMinute: 0,
        MainAttacks: 0,
        MainAttackHits: 0,
        HeadKills: 0,
        SoloKills: 0,
        SurvivalKills: 0,
        TotalDamageTaken: 0,
        Effectiveness: 0
      };
    }
    const cur = heroMap[key];
    cur.TimePlayed += (s.timePlayed?.value || 0) / 3600; // seconds -> hours
    cur.MatchesPlayed += s.matchesPlayed?.value || 0;
    cur.MatchesWon += s.matchesWon?.value || 0;
    cur.Kills += s.kills?.value || 0;
    cur.Deaths += s.deaths?.value || 0;
    cur.Assists += s.assists?.value || 0;
    cur.TotalHeroDamage += s.totalHeroDamage?.value || 0;
    cur.TotalHeroHeal += s.totalHeroHeal?.value || 0;
    cur.TotalHeroDamagePerMinute += s.totalHeroDamagePerMinute?.value || 0;
    cur.TotalHeroHealPerMinute += s.totalHeroHealPerMinute?.value || 0;
    cur.MainAttacks += s.mainAttacks?.value || 0;
    cur.MainAttackHits += s.mainAttackHits?.value || 0;
    cur.HeadKills += s.headKills?.value || 0;
    cur.SoloKills += s.soloKills?.value || 0;
    cur.SurvivalKills += s.survivalKills?.value || 0;
    cur.TotalDamageTaken += s.totalDamageTaken?.value || 0;
  });
  // compute effectiveness for each
  return Object.values(heroMap).map(h => ({ ...h, Effectiveness: computeEffectiveness(h) }));
}

// * Human-friendly compact number formatting (k/M with decimals)
export function formatShortNumber(num) {
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return Math.round(num).toLocaleString();
}

// * Simple string truncation with ellipsis
export function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

// * Convert hero name to avatar asset slug (normalize punctuation + spaces)
export function heroNameToAvatarSlug(name) {
  return name.toLowerCase().replace(/'|\.|!/g, '').replace(/\s+/g, '-') + '_avatar.webp';
}
