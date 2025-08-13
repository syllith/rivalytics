import { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Autocomplete, TextField, Paper, Typography, Chip, Divider, FormControlLabel, Checkbox, Avatar, Tooltip, Slider, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import characters from '../../characters.json';
import { HERO_ROLES, ROLES, getActiveTeamUps, teamSynergyScore, recommendPersonalReplacements, recommendPersonalReplacementsWithCounters, suggestIdealTeam, counterScoreForHero } from '../../data/synergy';

const HERO_NAMES = characters.map(c => c.name);
const ROLE_ORDER = ['Vanguard','Duelist','Strategist'];
const HERO_NAMES_SORTED = [...HERO_NAMES].sort((a,b)=>{
    const ra = ROLE_ORDER.indexOf(HERO_ROLES[a] || '');
    const rb = ROLE_ORDER.indexOf(HERO_ROLES[b] || '');
    const ai = ra === -1 ? 99 : ra;
    const bi = rb === -1 ? 99 : rb;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
});
const HERO_ICON_MAP = Object.fromEntries(characters.map(c => [c.name, c.icon]));

// Role icon assets in public/role-icons
const ROLE_ICONS = {
    Vanguard: '/role-icons/Vanguard_Icon.png',
    Duelist: '/role-icons/Duelist_Icon.png',
    Strategist: '/role-icons/Strategist_Icon.png'
};

// Requirement: red=vanguard, blue=duelist, green=strategist
const ROLE_COLORS = {
    Vanguard: '#e53935',
    Duelist: '#1e88e5',
    Strategist: '#43a047'
};

function roleColor(role) { return ROLE_COLORS[role] || '#666'; }

function synergyColor(score) {
    if (score >= 30) return 'success'; // great
    if (score >= 15) return 'warning'; // ok
    return 'error'; // poor
}

function teamUpChipColor(s) {
    if (s >= 8) return 'success';
    if (s >= 5) return 'warning';
    return 'error';
}

function normalize(input) { return (input || '').toLowerCase(); }

// Resolve partial input to unique hero (prefix priority). If ambiguous, returns ''.
function resolveHero(partial) {
    if (!partial) return '';
    const n = normalize(partial);
    const pref = HERO_NAMES.filter(h => normalize(h).startsWith(n));
    if (pref.length === 1) return pref[0];
    if (pref.length > 1) return '';
    const contains = HERO_NAMES.filter(h => normalize(h).includes(n));
    return contains.length === 1 ? contains[0] : '';
}

export default function Composition() {
    const [ourTeam, setOurTeam] = useState(Array(6).fill(''));
    const [enemyTeam, setEnemyTeam] = useState(Array(6).fill(''));
    // Raw text currently being typed (not yet committed) for each slot
    const [ourInputs, setOurInputs] = useState(Array(6).fill(''));
    const [enemyInputs, setEnemyInputs] = useState(Array(6).fill(''));
    const [yourIndex, setYourIndex] = useState(0);
    const [counterWeight, setCounterWeight] = useState(2); // weight applied to counter delta
    // --- Persistence load ---
    useEffect(() => {
        try {
            const raw = localStorage.getItem('composition_state_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.ourTeam)) {
                    const t = parsed.ourTeam.concat(Array(6).fill('')).slice(0,6);
                    setOurTeam(t);
                    setOurInputs(t);
                }
                if (Array.isArray(parsed.enemyTeam)) {
                    const t2 = parsed.enemyTeam.concat(Array(6).fill('')).slice(0,6);
                    setEnemyTeam(t2);
                    setEnemyInputs(t2);
                }
                if (typeof parsed.yourIndex === 'number') setYourIndex(Math.min(5, Math.max(0, parsed.yourIndex)));
                if (typeof parsed.counterWeight === 'number') setCounterWeight(parsed.counterWeight);
            }
        } catch (_) { /* ignore */ }
    }, []);
    // --- Persistence save ---
    useEffect(() => {
        const payload = { ourTeam, enemyTeam, yourIndex, counterWeight };
        try { localStorage.setItem('composition_state_v1', JSON.stringify(payload)); } catch (_) { /* ignore */ }
    }, [ourTeam, enemyTeam, yourIndex, counterWeight]);

    useEffect(() => {
        if (!ourTeam[yourIndex]) {
            const idx = ourTeam.findIndex(Boolean);
            if (idx >= 0) setYourIndex(idx);
        }
    }, [ourTeam, yourIndex]);

    const synergyEval = useMemo(() => teamSynergyScore(ourTeam.filter(Boolean)), [ourTeam]);
    const activeTeamUps = synergyEval.active;
    const enemySynergyEval = useMemo(() => teamSynergyScore(enemyTeam.filter(Boolean)), [enemyTeam]);
    const synergyDiff = enemyTeam.filter(Boolean).length ? (synergyEval.score - enemySynergyEval.score) : null;
    function diffColor(diff){ if(diff === null) return 'default'; if(diff >= 10) return 'success'; if(diff >= 3) return 'warning'; if(diff >= 0) return 'default'; return 'error'; }
    const ourCounterTotal = useMemo(()=> enemyTeam.filter(Boolean).length ? ourTeam.filter(Boolean).reduce((s,h)=> s + counterScoreForHero(h, ourTeam.filter(Boolean), enemyTeam.filter(Boolean)),0) : 0, [ourTeam, enemyTeam]);
    const enemyCounterTotal = useMemo(()=> ourTeam.filter(Boolean).length ? enemyTeam.filter(Boolean).reduce((s,h)=> s + counterScoreForHero(h, enemyTeam.filter(Boolean), ourTeam.filter(Boolean)),0) : 0, [ourTeam, enemyTeam]);
    const counterDiff = (enemyTeam.filter(Boolean).length && ourTeam.filter(Boolean).length) ? (ourCounterTotal - enemyCounterTotal) : null;
    const personalRecs = useMemo(() => {
        if (!ourTeam[yourIndex]) return [];
        const compact = ourTeam.filter(Boolean);
        const enemyCompact = enemyTeam.filter(Boolean);
        const localIdx = compact.indexOf(ourTeam[yourIndex]);
        if (enemyCompact.length === 0 && counterWeight > 0) {
            // No enemy info yet: fall back to pure synergy
            return recommendPersonalReplacements(compact, localIdx).map(r => ({
                hero: r.hero,
                synergyDelta: r.synergyDelta ?? r.delta - (r.roleBias || 0),
                counterDelta: 0,
                roleBias: r.roleBias || 0,
                total: r.delta,
                details: r.details
            }));
        }
        // Use combined scoring
        return recommendPersonalReplacementsWithCounters(compact, localIdx, enemyCompact, 3, counterWeight);
    }, [ourTeam, yourIndex, enemyTeam, counterWeight]);
    const ideal = useMemo(() => suggestIdealTeam(ourTeam.filter(Boolean)), [ourTeam]);

    const enemyDiveCount = enemyTeam.filter(h => ['Magik', 'Black Panther'].includes(h)).length;
    const hasAntiDive = ourTeam.includes('Namor');

    function updateTeam(setter, team, idx, value) {
        const next = [...team]; next[idx] = value; setter(next);
    }
    function commitHero(teamSetter, team, inputsSetter, inputs, idx) {
        const raw = (inputs[idx] || '').trim();
        if (!raw) {
            if (team[idx] !== '') updateTeam(teamSetter, team, idx, '');
            return;
        }
        const resolved = resolveHero(raw) || raw; // Only expand on unique match
        if (resolved !== team[idx]) updateTeam(teamSetter, team, idx, resolved);
        // Normalize visible input
        const nextInputs = [...inputs];
        nextInputs[idx] = resolved;
        inputsSetter(nextInputs);
    }

    const roleCounts = synergyEval.roleCounts || {};

    return (
        <Box p={2}>
            <Typography variant="h5" gutterBottom>Team Composition</Typography>
            {/* Removed instructional text per request */}
            <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                <Tooltip title="Difference between our synergy score and enemy synergy score. Positive = advantage.">
                    <Chip size="small" label={synergyDiff === null ? 'Advantage: —' : `Advantage: ${synergyDiff > 0 ? '+' : ''}${synergyDiff}`} color={diffColor(synergyDiff)} />
                </Tooltip>
                {synergyDiff !== null && (
                    <Tooltip title="Total counter coverage advantage (our counter score - theirs). Uses tag heuristic.">
                        <Chip size="small" label={`Counter Edge: ${counterDiff > 0 ? '+' : ''}${counterDiff}`} color={diffColor(counterDiff)} />
                    </Tooltip>
                )}
                {enemyTeam.filter(Boolean).length > 0 && (
                    <Tooltip title="Enemy total synergy score (team-ups + role balance)">
                        <Chip size="small" label={`Enemy Synergy: ${enemySynergyEval.score}`} />
                    </Tooltip>
                )}
            </Box>
            {/* Two-column equal width layout using flex for precise 50/50 split */}
                    <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} gap={4} alignItems={{ xs: 'flex-start', md: 'stretch' }}>
                {/* OUR TEAM PANEL - LEFT SIDE */}
                        <Box flex={1} minWidth={0} display="flex">
                            <Paper variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
                            <Typography variant="h6">Our Team</Typography>
                            <Tooltip title="Overall synergy = Team-Ups + Role Balance. Role Balance now heavily rewards reaching 2 of each role and penalizes missing a role (0). Stacking past 2 gives diminishing returns.">
                                <Chip label={`Synergy ${synergyEval.score}`} color={synergyColor(synergyEval.score)} size="small" />
                            </Tooltip>
                        </Box>
                        {/* Vertical list of hero inputs */}
                        <Box display="flex" flexDirection="column" gap={1.5}>
                            {ourTeam.map((hero, i) => (
                                <Box key={i} display="flex" alignItems="center" gap={1}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={yourIndex === i}
                                                onChange={() => setYourIndex(i)}
                                            />
                                        }
                                        label="You"
                                        sx={{ minWidth: 60 }}
                                    />
                                    <Autocomplete
                                        size="small"
                                        freeSolo
                                        fullWidth
                                        options={HERO_NAMES_SORTED}
                                        value={hero}
                                        inputValue={ourInputs[i]}
                                        onInputChange={(e, v, reason) => {
                                            if (reason === 'input') {
                                                const next = [...ourInputs];
                                                next[i] = v; // don't auto-complete yet
                                                setOurInputs(next);
                                            } else if (reason === 'clear') {
                                                const next = [...ourInputs]; next[i] = ''; setOurInputs(next);
                                                updateTeam(setOurTeam, ourTeam, i, '');
                                            }
                                        }}
                                        onChange={(_, v, reason) => {
                                            // Selection from list commits immediately
                                            if (reason === 'selectOption') {
                                                updateTeam(setOurTeam, ourTeam, i, v || '');
                                                const next = [...ourInputs]; next[i] = v || ''; setOurInputs(next);
                                            } else if (reason === 'clear') {
                                                updateTeam(setOurTeam, ourTeam, i, '');
                                                const next = [...ourInputs]; next[i] = ''; setOurInputs(next);
                                            }
                                        }}
                                        onBlur={() => commitHero(setOurTeam, ourTeam, setOurInputs, ourInputs, i)}
                                        renderOption={(props, option) => {
                                            const role = HERO_ROLES[option];
                                            return (
                                                <li {...props} key={option} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <Avatar src={HERO_ICON_MAP[option]} alt={option} sx={{ width: 28, height: 28 }} />
                                                    <Box component="span" sx={{ flexGrow: 1 }}>{option}</Box>
                                                    {role && <Avatar variant="rounded" src={ROLE_ICONS[role]} alt={role} sx={{ width: 20, height: 20, bgcolor: roleColor(role) }} />}
                                                </li>
                                            );
                                        }}
                                        renderInput={(params) => {
                                            const role = HERO_ROLES[hero];
                                            return (
                                                <TextField
                                                    {...params}
                                                    label={`Hero ${i + 1}`}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            commitHero(setOurTeam, ourTeam, setOurInputs, ourInputs, i);
                                                        }
                                                    }}
                                                    InputLabelProps={{ shrink: true }}
                                                    InputProps={{
                                                        ...params.InputProps,
                                                        startAdornment: hero && HERO_ICON_MAP[hero] ? (
                                                            <Box display="flex" alignItems="center" mr={1}>
                                                                <Avatar src={HERO_ICON_MAP[hero]} alt="" sx={{ width: 28, height: 28, mr: 1 }} />
                                                                {role && <Avatar variant="rounded" src={ROLE_ICONS[role]} alt={role} sx={{ width: 22, height: 22, bgcolor: roleColor(role), boxShadow: `0 0 0 1px ${roleColor(role)}` }} />}
                                                            </Box>
                                                        ) : params.InputProps.startAdornment
                                                    }}
                                                />
                                            );
                                        }}
                                    />
                                </Box>
                            ))}
                        </Box>
                        <Box display="flex" flexWrap="wrap" gap={1}>
                            {Object.entries(roleCounts).map(([role, count]) => (
                                <Tooltip key={role} title={`${role} count on your team`}>
                                    <Chip
                                        label={`${role}: ${count}`}
                                        size="small"
                                        icon={<Avatar src={ROLE_ICONS[role]} alt={role} sx={{ width: 18, height: 18 }} />}
                                        sx={{ backgroundColor: roleColor(role), color: '#fff', '& .MuiChip-icon': { ml: 0.5 } }}
                                    />
                                </Tooltip>
                            ))}
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>Active Team-Ups</Typography>
                            {activeTeamUps.length === 0 && <Typography variant="caption" sx={{ color: '#888' }}>None active</Typography>}
                            <Box display="flex" flexWrap="wrap" gap={0.75}>
                                {activeTeamUps.map(t => (
                                    <Tooltip key={`${t.anchor}-${t.partner}`} title={`${t.anchor} + ${t.partner}: ${t.notes || 'Team-Up'}`}>
                                        <Chip size="small" color={teamUpChipColor(t.score)} label={`${t.name} (+${t.score})`} />
                                    </Tooltip>
                                ))}
                            </Box>
                        </Box>
                        <Box>
                            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                                <Typography variant="subtitle2">Your Upgrade Picks</Typography>
                                <Box display="flex" alignItems="center" gap={1} minWidth={250}>
                    <Tooltip title={"Far left = Recommends picks to enhance your own team's abilities.\nFar right = Recommends picks to actively counter the enemy team."}>
                                        <Box display="flex" alignItems="center" gap={0.5}>
                        <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>Counter Emphasis</Typography>
                                            <InfoOutlinedIcon sx={{ fontSize: 16, opacity: 0.7 }} />
                                        </Box>
                                    </Tooltip>
                                    <Slider
                                        size="small"
                                        min={0}
                                        max={4}
                                        step={0.5}
                                        value={counterWeight}
                                        onChange={(_, v) => setCounterWeight(v)}
                                        sx={{ width: 120 }}
                                    />
                                    <Typography variant="caption" sx={{ width: 24, textAlign: 'right' }}>{counterWeight}</Typography>
                                </Box>
                            </Box>
                            {(() => {
                                const youPicked = !!ourTeam[yourIndex];
                                const upgrades = personalRecs.filter(r => (r.total ?? r.delta) > 0).length;
                                if (!youPicked) {
                                    return <Typography variant="caption" sx={{ color: '#888' }}>Pick your hero (and add enemy heroes) to see better choices.</Typography>;
                                }
                                if (youPicked && upgrades === 0) {
                                    return <Typography variant="caption" sx={{ color: '#888' }}>No positive swaps found — your current hero is already optimal for team synergy{counterWeight > 0 && enemyTeam.filter(Boolean).length ? ' & counter profile' : ''} at this weight.</Typography>;
                                }
                                return null;
                            })()}
                            {(() => {
                                // Surface missing / scarce roles to nudge user
                                const counts = roleCounts;
                                const missing = Object.entries(counts).filter(([,c])=>c===0).map(([r])=>r);
                                const scarce = Object.entries(counts).filter(([,c])=>c===1).map(([r])=>r);
                                if (missing.length === 0 && scarce.length === 0) return null;
                                return (
                                    <Box display="flex" flexWrap="wrap" gap={0.5} mb={0.5}>
                                        {missing.map(r => <Chip key={r+"-need"} color="error" size="small" label={`Need ${r}`} />)}
                                        {scarce.map(r => <Chip key={r+"-low"} color="warning" size="small" label={`Only 1 ${r}`} />)}
                                    </Box>
                                );
                            })()}
                            <Box display="flex" flexWrap="wrap" gap={0.75}>
                                {personalRecs.filter(r => {
                                    const total = r.total ?? r.delta;
                                    return total > 0; // hide non-upgrades
                                }).map(r => {
                                    const totalRaw = r.total ?? r.delta;
                                    const total = Math.round(totalRaw * 10) / 10; // tidy
                                    const synergyDelta = Math.round((r.synergyDelta ?? r.delta) * 10) / 10;
                                    const counterDelta = Math.round((r.counterDelta ?? 0) * 10) / 10;
                                    const color = total >= 12 ? 'success' : total >= 6 ? 'warning' : 'default';
                                    const showCounter = (counterWeight > 0) && (counterDelta !== 0);
                                    const sign = (n) => (n > 0 ? '+' + n : n);
                                    const label = showCounter
                                        ? `${r.hero} (${sign(total)})`
                                        : `${r.hero} (${sign(synergyDelta)})`;
                                    const roleBias = r.roleBias || 0;
                                    const tooltip = (() => {
                                        const parts = [`Synergy ${sign(synergyDelta)}`];
                                        if (showCounter) parts.push(`Counter ${sign(counterDelta)} × ${counterWeight}`);
                                        if (roleBias) parts.push(`Role ${sign(roleBias)}`);
                                        parts.push(`Total ${sign(total)}`);
                                        return parts.join('  |  ');
                                    })();
                                    return (
                                        <Tooltip key={r.hero} title={tooltip}>
                                            <Chip
                                                size="small"
                                                color={color}
                                                label={label}
                                                icon={<Avatar src={HERO_ICON_MAP[r.hero]} alt={r.hero} sx={{ width: 20, height: 20 }} />}
                                            />
                                        </Tooltip>
                                    );
                                })}
                            </Box>
                            {/* Removed example explanation per request */}
                        </Box>
                    </Paper>
                </Box>
                {/* ENEMY TEAM PANEL - RIGHT SIDE */}
                        <Box flex={1} minWidth={0} display="flex">
                            <Paper variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                        <Typography variant="h6">Enemy Team</Typography>
                        {/* Vertical list of enemy inputs */}
                        <Box display="flex" flexDirection="column" gap={1.5}>
                            {enemyTeam.map((hero, i) => (
                                <Autocomplete
                                    key={i}
                                    size="small"
                                    freeSolo
                                    fullWidth
                                    options={HERO_NAMES_SORTED}
                                    value={hero}
                                    inputValue={enemyInputs[i]}
                                    onInputChange={(e, v, reason) => {
                                        if (reason === 'input') {
                                            const next = [...enemyInputs]; next[i] = v; setEnemyInputs(next);
                                        } else if (reason === 'clear') {
                                            const next = [...enemyInputs]; next[i] = ''; setEnemyInputs(next);
                                            updateTeam(setEnemyTeam, enemyTeam, i, '');
                                        }
                                    }}
                                    onChange={(_, v, reason) => {
                                        if (reason === 'selectOption') {
                                            updateTeam(setEnemyTeam, enemyTeam, i, v || '');
                                            const next = [...enemyInputs]; next[i] = v || ''; setEnemyInputs(next);
                                        } else if (reason === 'clear') {
                                            updateTeam(setEnemyTeam, enemyTeam, i, '');
                                            const next = [...enemyInputs]; next[i] = ''; setEnemyInputs(next);
                                        }
                                    }}
                                    onBlur={() => commitHero(setEnemyTeam, enemyTeam, setEnemyInputs, enemyInputs, i)}
                                    renderOption={(props, option) => {
                                        const role = HERO_ROLES[option];
                                        return (
                                            <li {...props} key={option} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Avatar src={HERO_ICON_MAP[option]} alt={option} sx={{ width: 28, height: 28 }} />
                                                <Box component="span" sx={{ flexGrow: 1 }}>{option}</Box>
                                                {role && <Avatar variant="rounded" src={ROLE_ICONS[role]} alt={role} sx={{ width: 20, height: 20, bgcolor: roleColor(role) }} />}
                                            </li>
                                        );
                                    }}
                                    renderInput={(params) => {
                                        const role = HERO_ROLES[hero];
                                        return (
                                            <TextField
                                                {...params}
                                                label={`Enemy ${i + 1}`}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        commitHero(setEnemyTeam, enemyTeam, setEnemyInputs, enemyInputs, i);
                                                    }
                                                }}
                                                InputLabelProps={{ shrink: true }}
                                                InputProps={{
                                                    ...params.InputProps,
                                                    startAdornment: hero && HERO_ICON_MAP[hero] ? (
                                                        <Box display="flex" alignItems="center" mr={1}>
                                                            <Avatar src={HERO_ICON_MAP[hero]} alt="" sx={{ width: 28, height: 28, mr: 1 }} />
                                                            {role && <Avatar variant="rounded" src={ROLE_ICONS[role]} alt={role} sx={{ width: 22, height: 22, bgcolor: roleColor(role), boxShadow: `0 0 0 1px ${roleColor(role)}` }} />}
                                                        </Box>
                                                    ) : params.InputProps.startAdornment
                                                }}
                                            />
                                        );
                                    }}
                                />
                            ))}
                        </Box>
                        <Box>
                            {enemyDiveCount > 1 && !hasAntiDive && (
                                <Chip color="warning" label="Add Namor (anti-dive)" size="small" />
                            )}
                        </Box>
                        <Box display="flex" flexWrap="wrap" gap={1}>
                            {Object.entries(enemySynergyEval.roleCounts || {}).map(([role, count]) => (
                                <Tooltip key={role} title={`Enemy ${role} count`}>
                                    <Chip
                                        label={`${role}: ${count}`}
                                        size="small"
                                        icon={<Avatar src={ROLE_ICONS[role]} alt={role} sx={{ width: 18, height: 18 }} />}
                                        sx={{ backgroundColor: roleColor(role), color: '#fff', opacity: 0.85, '& .MuiChip-icon': { ml: 0.5 } }}
                                    />
                                </Tooltip>
                            ))}
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>Notes</Typography>
                            <Typography variant="caption" sx={{ color: '#999' }}>
                                Enemy picks influence counter suggestions & ideal comp below.
                            </Typography>
                        </Box>
                    </Paper>
                </Box>
            </Box>
            {/* IDEAL TEAM PANEL - CENTERED BELOW */}
            <Box mt={4}>
                <Paper variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
                    <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={1}>
                        <Typography variant="subtitle1">Ideal Team</Typography>
                    </Box>
                    <Box display="flex" flexWrap="wrap" gap={0.75}>
                        {ideal.team.map((h, idx) => {
                            const role = HERO_ROLES[h];
                            return (
                                <Tooltip key={idx} title={h || 'Open slot'}>
                                    <Chip
                                        label={h || '—'}
                                        size="small"
                                        icon={h ? <Avatar src={HERO_ICON_MAP[h]} alt={h} sx={{ width: 20, height: 20 }} /> : undefined}
                                        sx={h ? { bgcolor: roleColor(role), color: '#fff' } : {}}
                                    />
                                </Tooltip>
                            );
                        })}
                    </Box>
                    <Divider light />
                    <Box display="flex" flexWrap="wrap" gap={1}>
                        {ideal.evaluation.active.map(t => (
                            <Tooltip key={`${t.anchor}-${t.partner}`} title={`${t.anchor} + ${t.partner}: ${t.notes || ''}`}>
                                <Chip size="small" color={teamUpChipColor(t.score)} label={`${t.name}: +${t.score}`} />
                            </Tooltip>
                        ))}
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
}
