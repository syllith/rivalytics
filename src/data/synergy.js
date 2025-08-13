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
// Updated role mapping per latest user-provided classification (includes Blade placeholder)
export const HERO_ROLES = {
  // Vanguard
  'Captain America': ROLES.VANGUARD,
  'Doctor Strange': ROLES.VANGUARD,
  'Emma Frost': ROLES.VANGUARD,
  'Groot': ROLES.VANGUARD,
  'Hulk': ROLES.VANGUARD,
  'Magneto': ROLES.VANGUARD,
  'Peni Parker': ROLES.VANGUARD,
  'The Thing': ROLES.VANGUARD,
  'Thor': ROLES.VANGUARD,
  'Venom': ROLES.VANGUARD,
  // Duelist
  'Black Panther': ROLES.DUELIST,
  'Black Widow': ROLES.DUELIST,
  'Blade': ROLES.DUELIST,
  'Hawkeye': ROLES.DUELIST,
  'Hela': ROLES.DUELIST,
  'Human Torch': ROLES.DUELIST,
  'Iron Fist': ROLES.DUELIST,
  'Iron Man': ROLES.DUELIST,
  'Magik': ROLES.DUELIST,
  'Mister Fantastic': ROLES.DUELIST,
  'Moon Knight': ROLES.DUELIST,
  'Namor': ROLES.DUELIST,
  'Phoenix': ROLES.DUELIST,
  'Psylocke': ROLES.DUELIST,
  'Scarlet Witch': ROLES.DUELIST,
  'Spider-Man': ROLES.DUELIST,
  'Squirrel Girl': ROLES.DUELIST,
  'Star-Lord': ROLES.DUELIST,
  'Storm': ROLES.DUELIST,
  'The Punisher': ROLES.DUELIST,
  'Winter Soldier': ROLES.DUELIST,
  'Wolverine': ROLES.DUELIST,
  // Strategist
  'Adam Warlock': ROLES.STRATEGIST,
  'Cloak & Dagger': ROLES.STRATEGIST,
  'Invisible Woman': ROLES.STRATEGIST,
  'Jeff the Land Shark': ROLES.STRATEGIST,
  'Loki': ROLES.STRATEGIST,
  'Luna Snow': ROLES.STRATEGIST,
  'Mantis': ROLES.STRATEGIST,
  'Rocket Raccoon': ROLES.STRATEGIST,
  'Ultron': ROLES.STRATEGIST,
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
// Tunable role balance scoring emphasizing achieving 2-of-each while still allowing stylistic flex.
// Rationale:
//  - Missing a role should feel like a real cost (vision/utility/frontline gaps) -> penalty.
//  - 1-of-a-role is better than 0, but still vulnerable -> modest bonus.
//  - 2-of-a-role hits the typical reliability breakpoint -> strong bonus.
//  - >2 gives diminishing / tapering returns; heavy stacking shouldn't massively outscore balance.
// Table (c = count for a role):
//   0:-8, 1:+2, 2:+7, 3:+5, 4:+3, 5:+1, >=6:0
function roleBalanceValue(c) {
  if (c === 0) return -8;
  if (c === 1) return 2;
  if (c === 2) return 7;
  if (c === 3) return 5;
  if (c === 4) return 3;
  if (c === 5) return 1;
  return 0; // 6+ virtually capped
}

export function teamSynergyScore(team) {
  const active = getActiveTeamUps(team);
  const base = active.reduce((s, t) => s + t.score, 0);
  const roleCounts = { [ROLES.VANGUARD]: 0, [ROLES.DUELIST]: 0, [ROLES.STRATEGIST]: 0 };
  team.forEach(h => { if (HERO_ROLES[h]) roleCounts[HERO_ROLES[h]]++; });
  const roleBreakdown = Object.fromEntries(Object.entries(roleCounts).map(([role, c]) => [role, roleBalanceValue(c)]));
  const roleBonus = Object.values(roleBreakdown).reduce((a,b)=>a+b,0);
  return { score: base + roleBonus, active, roleCounts, roleBonus, roleBreakdown, baseScore: base };
}

// For a specific player hero, evaluate best replacements to maximize overall team synergy.
export function recommendPersonalReplacements(team, yourIndex, limit = 3) {
  const currentHero = team[yourIndex];
  const pool = Object.keys(HERO_ROLES).filter(h => !team.includes(h) || h === currentHero);
  const baseEval = teamSynergyScore(team);
  const results = [];
  // Determine role scarcity for biasing.
  const counts = baseEval.roleCounts;
  const missingRoles = Object.entries(counts).filter(([, c]) => c === 0).map(([r]) => r);
  const scarceRoles = Object.entries(counts).filter(([, c]) => c === 1).map(([r]) => r);
  for (const candidate of pool) {
    if (candidate === currentHero) continue;
    const newTeam = [...team];
    newTeam[yourIndex] = candidate;
    const evalNew = teamSynergyScore(newTeam);
    const rawDelta = evalNew.score - baseEval.score;
    const role = HERO_ROLES[candidate];
    let roleBias = 0;
    if (missingRoles.includes(role)) roleBias += 5; // strong push to cover a missing role
    else if (scarceRoles.includes(role)) roleBias += 2; // gentle nudge towards balancing singletons
    results.push({ hero: candidate, delta: rawDelta + roleBias, synergyDelta: rawDelta, roleBias, details: evalNew });
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

// --- Basic derived counter heuristics (prototype) ---
// We reuse HERO_TAGS to infer soft counters vs enemy aggregate tags.
// COUNTER_RESPONSES: enemyTag -> our tags that help mitigate / answer it.
export const COUNTER_RESPONSES = {
  'dive': ['anti-dive','frontline','mitigation','control'],
  'frontline': ['burst','barrier-break','sustain-damage','support'],
  'aoe': ['mitigation','support','control'],
  'healing': ['burst','anti-air','barrier-break'],
  'revive': ['burst','snowball','control'],
  'brawl': ['healing','support','control'],
  'anti-air': ['dive','brawl'],
  'support': ['burst','snowball'],
  'control': ['sustain','support']
};

function aggregateEnemyTags(enemyTeam) {
  const counts = {};
  enemyTeam.filter(Boolean).forEach(h => {
    (HERO_TAGS[h] || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
  });
  return counts;
}

function teamTagCounts(team) {
  const counts = {};
  team.filter(Boolean).forEach(h => {
    (HERO_TAGS[h] || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
  });
  return counts;
}

// Compute a counter score for adding candidate hero vs current enemy aggregate.
// Rough heuristic: Sum enemyTagCount * weight if candidate has one of the response tags.
// Diminishing returns: if team already has >=2 of candidate tag, halve its contribution.
export function counterScoreForHero(candidate, currentTeam, enemyTeam) {
  const enemyTags = aggregateEnemyTags(enemyTeam);
  if (Object.keys(enemyTags).length === 0) return 0;
  const candidateTags = HERO_TAGS[candidate] || [];
  const ourTagCounts = teamTagCounts(currentTeam);
  let score = 0;
  for (const [eTag, eCount] of Object.entries(enemyTags)) {
    const responses = COUNTER_RESPONSES[eTag] || [];
    for (const tag of candidateTags) {
      if (responses.includes(tag)) {
        let contrib = eCount; // base weight 1 per enemy occurrence
        if ((ourTagCounts[tag] || 0) >= 2) contrib *= 0.5; // diminishing returns
        score += contrib;
      }
    }
  }
  return score; // unnormalized; small integers typically
}

// Combined recommendation factoring synergy delta + counter value.
// weightCounter can be tuned; default 2 so a counter point ~ 2 synergy points.
export function recommendPersonalReplacementsWithCounters(team, yourIndex, enemyTeam, limit = 3, weightCounter = 2) {
  const baseEval = teamSynergyScore(team);
  const currentHero = team[yourIndex];
  const pool = Object.keys(HERO_ROLES).filter(h => !team.includes(h) || h === currentHero);
  const results = [];
  const counts = baseEval.roleCounts;
  const missingRoles = Object.entries(counts).filter(([, c]) => c === 0).map(([r]) => r);
  const scarceRoles = Object.entries(counts).filter(([, c]) => c === 1).map(([r]) => r);
  for (const candidate of pool) {
    if (candidate === currentHero) continue;
    const newTeam = [...team];
    newTeam[yourIndex] = candidate;
    const evalNew = teamSynergyScore(newTeam);
    const synergyDelta = evalNew.score - baseEval.score;
    const counterDelta = counterScoreForHero(candidate, team, enemyTeam) - counterScoreForHero(currentHero, team, enemyTeam);
    const role = HERO_ROLES[candidate];
    let roleBias = 0;
    if (missingRoles.includes(role)) roleBias += 5;
    else if (scarceRoles.includes(role)) roleBias += 2;
    const total = synergyDelta + counterDelta * weightCounter + roleBias;
    if (synergyDelta > 0 || counterDelta > 0 || roleBias > 0) {
      results.push({ hero: candidate, synergyDelta, counterDelta, roleBias, total, details: evalNew });
    }
  }
  return results
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
