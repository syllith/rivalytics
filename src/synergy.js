// synergy.js
// Lightweight, manually curated synergy + role dataset (Season 3.5 snapshot)
// NOTE: Scores are rough relative weights (1-10). High = impactful, Low = negligible.
// This is an initial seed; refine with real win rate deltas later.

export const ROLES = {
  VANGUARD: 'Vanguard',
  DUELIST: 'Duelist',
  STRATEGIST: 'Strategist'
};

// Hero role mapping (simplified; adjust as meta clarifies)
export const HERO_ROLES = {
  'Adam Warlock': ROLES.STRATEGIST,
  'Black Panther': ROLES.DUELIST,
  'Black Widow': ROLES.DUELIST,
  'Captain America': ROLES.VANGUARD,
  'Cloak & Dagger': ROLES.DUELIST,
  'Doctor Strange': ROLES.STRATEGIST,
  'Emma Frost': ROLES.STRATEGIST,
  'Groot': ROLES.VANGUARD,
  'Hawkeye': ROLES.DUELIST,
  'Hela': ROLES.DUELIST,
  'Hulk': ROLES.VANGUARD,
  'Human Torch': ROLES.DUELIST,
  'Invisible Woman': ROLES.STRATEGIST,
  'Iron Fist': ROLES.DUELIST,
  'Iron Man': ROLES.STRATEGIST,
  'Jeff the Land Shark': ROLES.STRATEGIST,
  'Loki': ROLES.DUELIST,
  'Luna Snow': ROLES.DUELIST,
  'Magik': ROLES.DUELIST,
  'Magneto': ROLES.STRATEGIST,
  'Mantis': ROLES.STRATEGIST,
  'Mister Fantastic': ROLES.STRATEGIST,
  'Moon Knight': ROLES.DUELIST,
  'Namor': ROLES.VANGUARD,
  'Peni Parker': ROLES.VANGUARD,
  'Phoenix': ROLES.DUELIST,
  'Psylocke': ROLES.DUELIST,
  'Rocket Raccoon': ROLES.STRATEGIST,
  'Scarlet Witch': ROLES.DUELIST,
  'Spider-Man': ROLES.DUELIST,
  'Squirrel Girl': ROLES.STRATEGIST,
  'Star-Lord': ROLES.STRATEGIST,
  'Storm': ROLES.DUELIST,
  'The Punisher': ROLES.DUELIST,
  'The Thing': ROLES.VANGUARD,
  'Thor': ROLES.VANGUARD,
  'Ultron': ROLES.STRATEGIST,
  'Venom': ROLES.DUELIST,
  'Winter Soldier': ROLES.DUELIST,
  'Wolverine': ROLES.DUELIST
};

// Team-Up data. Each entry: anchor hero provides synergy to partner hero(s).
// score: relative impact (10 = top tier). lowScoreThreshold used for filtering negligible synergies.
export const TEAM_UPS = [
  { anchor: 'Phoenix', partner: 'Wolverine', name: 'Primal Flame', score: 10, notes: 'Fire aura + lifesteal' },
  { anchor: 'Hulk', partner: 'Namor', name: 'Gamma Monstro', score: 9, notes: 'Gamma beam turret for Namor' },
  { anchor: 'Rocket Raccoon', partner: 'Peni Parker', name: 'Rocket Network', score: 9, notes: 'Extra drones + armor packs' },
  { anchor: 'Invisible Woman', partner: 'Mister Fantastic', name: 'Fantastic Four', score: 8, notes: 'Resist + regen shield' },
  { anchor: 'Invisible Woman', partner: 'Human Torch', name: 'Fantastic Four', score: 8, notes: 'Resist + regen shield' },
  { anchor: 'Invisible Woman', partner: 'The Thing', name: 'Fantastic Four', score: 8, notes: 'Resist + regen shield' },
  { anchor: 'Doctor Strange', partner: 'Scarlet Witch', name: 'Arcane Order', score: 8, notes: 'Mystic Burst damage spike' },
  { anchor: 'Adam Warlock', partner: 'Luna Snow', name: 'Duality Dance', score: 8, notes: 'Lifesteal tether' },
  { anchor: 'Hela', partner: 'Thor', name: 'Ragnarok Rebirth', score: 8, notes: 'Thor revive / HP bonus' },
  { anchor: 'Storm', partner: 'Jeff the Land Shark', name: 'Jeff-Nado', score: 7, notes: 'Shark-infused tornado CC' },
  { anchor: 'Emma Frost', partner: 'Magneto', name: 'Mental Projection', score: 6, notes: 'Decoy clones' },
  { anchor: 'Emma Frost', partner: 'Psylocke', name: 'Mental Projection', score: 6, notes: 'Decoy clones' },
  { anchor: 'Iron Man', partner: 'Ultron', name: 'Stark Protocol', score: 7, notes: 'Healing / beam utility' },
  { anchor: 'Iron Man', partner: 'Squirrel Girl', name: 'Stark Protocol', score: 7, notes: 'Homing anti-air projectile' },
  { anchor: 'Magik', partner: 'Black Panther', name: 'Dimensional Shortcut', score: 3, notes: 'Rewind escape (dive heavy)' },
  { anchor: 'Hulk', partner: 'Wolverine', name: 'Fastball Special', score: 1, notes: 'Throw Wolverine (low impact)' },
  { anchor: 'The Thing', partner: 'Wolverine', name: 'Fastball Special', score: 1, notes: 'Throw Wolverine (low impact)' },
  { anchor: 'Captain America', partner: 'Winter Soldier', name: 'Stars Aligned', score: 2, notes: 'Mild leap + small stats' },
  { anchor: 'The Punisher', partner: 'Black Widow', name: 'Operation: Microchip', score: 2, notes: 'Pulse mode (still weak)' },
  { anchor: 'Groot', partner: 'Rocket Raccoon', name: 'Planet X Pals', score: 2, notes: 'Ride + DR (rarely useful)' },
  { anchor: 'Groot', partner: 'Jeff the Land Shark', name: 'Planet X Pals', score: 2, notes: 'Ride + DR (rarely useful)' }
];

// Optional simple counters / tags (seed). Format: hero => array of strategic tags.
export const HERO_TAGS = {
  'Namor': ['anti-dive', 'frontline'],
  'Hulk': ['frontline', 'engage'],
  'Invisible Woman': ['support', 'mitigation'],
  'Rocket Raccoon': ['healing', 'support'],
  'Peni Parker': ['frontline', 'objective'],
  'Doctor Strange': ['utility', 'burst'],
  'Scarlet Witch': ['aoe', 'barrier-break'],
  'Phoenix': ['sustain-damage'],
  'Wolverine': ['brawl'],
  'Storm': ['aoe', 'control'],
  'Jeff the Land Shark': ['heal-beam'],
  'Hela': ['revive', 'snowball'],
  'Thor': ['frontline'],
  'Magik': ['dive'],
  'Black Panther': ['dive'],
  'Luna Snow': ['self-heal'],
  'Adam Warlock': ['support'],
  'Iron Man': ['flex-range'],
  'Ultron': ['sustain'],
  'Squirrel Girl': ['anti-air'],
};

// Compute active team-ups present in a given array of hero names.
export function getActiveTeamUps(team) {
  const set = new Set(team.filter(Boolean));
  return TEAM_UPS.filter(t => set.has(t.anchor) && set.has(t.partner));
}

// Calculate a raw synergy score for a team (sum of active team-up scores + role balance bonus)
export function teamSynergyScore(team) {
  const active = getActiveTeamUps(team);
  const base = active.reduce((s, t) => s + t.score, 0);
  // Role balance: reward having at least one of each role; mild diminishing returns.
  const roleCounts = { [ROLES.VANGUARD]: 0, [ROLES.DUELIST]: 0, [ROLES.STRATEGIST]: 0 };
  team.forEach(h => { if (HERO_ROLES[h]) roleCounts[HERO_ROLES[h]]++; });
  let roleBonus = 0;
  Object.values(roleCounts).forEach(c => { if (c > 0) roleBonus += 5; if (c > 1) roleBonus += 2; });
  return { score: base + roleBonus, active, roleCounts, roleBonus, baseScore: base };
}

// For a specific player hero, evaluate best replacements to maximize overall team synergy.
export function recommendPersonalReplacements(team, yourIndex, limit = 3) {
  const currentHero = team[yourIndex];
  const pool = Object.keys(HERO_ROLES).filter(h => !team.includes(h) || h === currentHero);
  const baseEval = teamSynergyScore(team);
  const results = [];
  for (const candidate of pool) {
    if (candidate === currentHero) continue;
    const newTeam = [...team];
    newTeam[yourIndex] = candidate;
    const evalNew = teamSynergyScore(newTeam);
    results.push({ hero: candidate, delta: evalNew.score - baseEval.score, details: evalNew });
  }
  return results
    .filter(r => r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
}

// Greedy ideal team suggestion: Start with existing heroes; try swaps to increase synergy.
export function suggestIdealTeam(currentTeam) {
  let team = [...currentTeam];
  const slots = 6;
  team.length = slots; // ensure length 6 (undefined allowed)
  // Fill empty slots with provisional picks that add synergy (anchors/partners of existing picks)
  const pool = Object.keys(HERO_ROLES);
  const tryAdd = (hero) => { if (team.includes(hero)) return; const idx = team.indexOf(undefined); if (idx !== -1) team[idx] = hero; };
  // Fill empties prioritizing high score anchors or partners of present heroes
  const highImpactPairs = TEAM_UPS.filter(t => t.score >= 7);
  for (const pair of highImpactPairs) {
    if (team.includes(pair.anchor) && !team.includes(pair.partner)) tryAdd(pair.partner);
    if (team.includes(pair.partner) && !team.includes(pair.anchor)) tryAdd(pair.anchor);
  }
  // Still empties: add highest impact anchors not yet taken
  for (const pair of highImpactPairs) {
    if (!team.includes(pair.anchor)) tryAdd(pair.anchor);
    if (!team.includes(pair.partner)) tryAdd(pair.partner);
  }
  // Replace low impact heroes with higher synergy if beneficial
  let improved = true; let safety = 0;
  while (improved && safety < 20) {
    safety++; improved = false;
    const base = teamSynergyScore(team).score;
    for (let i = 0; i < slots; i++) {
      const original = team[i];
      for (const cand of pool) {
        if (team.includes(cand) && cand !== original) continue;
        team[i] = cand;
        const s = teamSynergyScore(team).score;
        if (s > base) { improved = true; break; } else { team[i] = original; }
      }
      if (improved) break;
    }
  }
  return { team, evaluation: teamSynergyScore(team) };
}
