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
        DamageTakenPerMatch: 0,
        SurvivalKillsPerMatch: 0
      };
    }
    const cur = heroMap[key];
    cur.TimePlayed += (s.timePlayed?.value || 0) / 3600; // convert seconds to hours
    cur.MatchesPlayed += s.matchesPlayed?.value || 0;
    cur.MatchesWon += s.matchesWon?.value || 0;
    cur.Kills += s.kills?.value || 0;
    cur.Deaths += s.deaths?.value || 0;
    cur.Assists += s.assists?.value || 0;
    cur.TotalHeroDamage += s.totalHeroDamage?.value || 0;
    cur.TotalHeroHeal += s.totalHeroHeal?.value || 0;
    cur.TotalHeroDamagePerMinute += s.totalHeroDamagePerMinute?.value || 0;
    cur.TotalHeroHealPerMinute += s.totalHeroHealPerMinute?.value || 0;
    cur.DamageTakenPerMatch += s.damageTakenPerMatch?.value || 0;
    cur.SurvivalKillsPerMatch += s.survivalKillsPerMatch?.value || 0;
  });
  return Object.values(heroMap);
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
