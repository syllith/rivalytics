import { SEASON_START } from './config.js';

export function isWithinCurrentSeason(ts) {
  if (!ts) return false;
  let t;
  if (typeof ts === 'number') {
    if (ts < 1e12) t = ts * 1000; else t = ts;
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

export function isCompetitiveMode(meta) {
  const mode = (meta?.modeName || meta?.mapModeName || '').toLowerCase();
  if (!mode) return false;
  if (/unknown|custom/.test(mode)) return false;
  return /(competitive|ranked|tournament)/.test(mode);
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
        DamageTakenPerMatch: 0,
        SurvivalKillsPerMatch: 0
      };
    }
    const cur = heroMap[key];
    cur.TimePlayed += (s.timePlayed?.value || 0) / 3600;
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

export function formatShortNumber(num) {
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  return Math.round(num).toLocaleString();
}

export function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export function heroNameToAvatarSlug(name) {
  return name.toLowerCase().replace(/'|\.|!/g, '').replace(/\s+/g, '-') + '_avatar.webp';
}
