// src/components/Hero/Hero.jsx
import React, { useState, useEffect } from 'react'
import {
    Box,
    Table,
    TableContainer,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Paper,
} from '@mui/material'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';

// ——— Helpers (ported from Go) ———

function computeEffectiveness(h) {
    if (h.MatchesPlayed <= 0) return 0
    const winPct = h.MatchesWon / h.MatchesPlayed
    const kda = (h.Kills + h.Assists) / Math.max(1, h.Deaths)
    const dmgPerMatch = h.TotalHeroDamage / h.MatchesPlayed
    const healPerMatch = h.TotalHeroHeal / h.MatchesPlayed
    const dmgPerMin = h.TotalHeroDamagePerMinute
    const healPerMin = h.TotalHeroHealPerMinute
    const accuracy = h.MainAttacks > 0
        ? h.MainAttackHits / h.MainAttacks
        : 0
    const headPct = h.Kills > 0
        ? h.HeadKills / h.Kills
        : 0
    const survKillsPM = h.SurvivalKills / Math.max(1, h.MatchesPlayed)
    const dmgTakenPM = h.TotalDamageTaken / Math.max(1, h.MatchesPlayed)

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
        (dmgTakenPM / 1000) * 5

    return Math.max(0, eff)
}

function updateHeroStats(cur, seg) {
    const s = seg.stats
    return {
        ...cur,
        TimePlayed: cur.TimePlayed + s.timePlayed.value / 3600,
        MatchesPlayed: cur.MatchesPlayed + s.matchesPlayed.value,
        MatchesWon: cur.MatchesWon + s.matchesWon.value,
        Kills: cur.Kills + s.kills.value,
        Deaths: cur.Deaths + s.deaths.value,
        Assists: cur.Assists + s.assists.value,
        TotalHeroDamage: cur.TotalHeroDamage + s.totalHeroDamage.value,
        TotalHeroHeal: cur.TotalHeroHeal + s.totalHeroHeal.value,
        TotalHeroDamagePerMinute: cur.TotalHeroDamagePerMinute + s.totalHeroDamagePerMinute.value,
        TotalHeroHealPerMinute: cur.TotalHeroHealPerMinute + s.totalHeroHealPerMinute.value,
        MainAttacks: cur.MainAttacks + s.mainAttacks.value,
        MainAttackHits: cur.MainAttackHits + s.mainAttackHits.value,
        HeadKills: cur.HeadKills + s.headKills.value,
        SoloKills: cur.SoloKills + s.soloKills.value,
        SurvivalKills: cur.SurvivalKills + s.survivalKills.value,
        TotalDamageTaken: cur.TotalDamageTaken + s.totalDamageTaken.value,
    }
}

function getHeroesFromResponse(resp) {
    if (!resp || !resp.data) return [];
    const map = {}
    resp.data.forEach(seg => {
        if (seg.type !== 'hero') return
        const role = seg.attributes.role[0].toUpperCase() + seg.attributes.role.slice(1)
        const key = `${seg.metadata.name} (${role})`
        map[key] = map[key]
            ? updateHeroStats(map[key], seg)
            : updateHeroStats({
                Name: seg.metadata.name,
                Role: role,
                TimePlayed: 0, MatchesPlayed: 0, MatchesWon: 0,
                Kills: 0, Deaths: 0, Assists: 0,
                TotalHeroDamage: 0, TotalHeroHeal: 0,
                TotalHeroDamagePerMinute: 0, TotalHeroHealPerMinute: 0,
                MainAttacks: 0, MainAttackHits: 0,
                HeadKills: 0, SoloKills: 0, SurvivalKills: 0,
                TotalDamageTaken: 0,
            }, seg)
    })
    return Object.values(map).map(h => ({
        ...h,
        Effectiveness: computeEffectiveness(h),
    }))
}

// Helper to format numbers as 2.63M, 2.54k, etc.
function formatShortNumber(num) {
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M'
    if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(2) + 'k'
    return num.toLocaleString()
}

export default function Hero({ rawData, username, loading }) {
    const [table, setTable] = useState(() => {
        const saved = localStorage.getItem('rivalytics-table')
        return saved ? JSON.parse(saved) : []
    })
    const [sortCol, setSortCol] = useState(() => {
        const saved = localStorage.getItem('rivalytics-sortCol')
        return saved ? Number(saved) : 0
    })
    const [sortDir, setSortDir] = useState(() => {
        return localStorage.getItem('rivalytics-sortDir') || 'desc'
    })

    // Save table to localStorage when it changes
    useEffect(() => {
        if (table.length > 0) {
            localStorage.setItem('rivalytics-table', JSON.stringify(table))
        }
    }, [table])

    // Save sortCol and sortDir to localStorage when they change
    useEffect(() => {
        localStorage.setItem('rivalytics-sortCol', sortCol)
    }, [sortCol])
    useEffect(() => {
        localStorage.setItem('rivalytics-sortDir', sortDir)
    }, [sortDir])

    // Parse rawData when it changes
    useEffect(() => {
        if (!rawData) {
            setTable([])
            return
        }
        let heroes = getHeroesFromResponse(rawData)
        heroes.sort((a, b) => b.TimePlayed - a.TimePlayed)
        const header = [
            'Role', 'Hero', 'Hours', 'Matches', 'Wins', 'Win %', 'Kills', 'Deaths', 'Assists',
            'KDA', 'Dmg', 'Dmg/Min', 'Heal', 'Heal/Min', 'DmgTaken/Match', 'SurvKills/Match',
            'Accuracy', 'Headshot%', 'Effectiveness'
        ]
        const rows = heroes.map(h => {
            const winRate = (h.MatchesWon / h.MatchesPlayed * 100);
            const kda = ((h.Kills + h.Assists) / Math.max(1, h.Deaths));
            const acc = h.MainAttacks > 0 ? ((h.MainAttackHits / h.MainAttacks) * 100) : 0;
            const hs = h.Kills > 0 ? ((h.HeadKills / h.Kills) * 100) : 0;
            return [
                h.Role,
                h.Name,
                Number(h.TimePlayed.toFixed(1)).toLocaleString(),
                formatShortNumber(h.MatchesPlayed),
                formatShortNumber(h.MatchesWon),
                winRate.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%',
                formatShortNumber(h.Kills),
                formatShortNumber(h.Deaths),
                formatShortNumber(h.Assists),
                kda.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                formatShortNumber(Math.round(h.TotalHeroDamage)),
                formatShortNumber(Math.round(h.TotalHeroDamagePerMinute)),
                formatShortNumber(Math.round(h.TotalHeroHeal)),
                formatShortNumber(Math.round(h.TotalHeroHealPerMinute)),
                Number((h.TotalDamageTaken / h.MatchesPlayed).toFixed(1)).toLocaleString(),
                Number((h.SurvivalKills / h.MatchesPlayed).toFixed(2)).toLocaleString(),
                acc.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%',
                hs.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%',
                Number(h.Effectiveness.toFixed(1)).toLocaleString(),
            ]
        })
        setTable([header, ...rows])
    }, [rawData])

    // Sorting logic for table rows
    const sortedRows = React.useMemo(() => {
        if (table.length <= 1) return [];
        const rows = [...table.slice(1)];
        rows.sort((a, b) => {
            const aVal = a[sortCol];
            const bVal = b[sortCol];
            // Try numeric sort, fallback to string
            const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g,""));
            const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g,""));
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
            }
            // String sort
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return rows;
    }, [table, sortCol, sortDir]);

    // Role icon map
    const ROLE_ICONS = {
        Vanguard: "/role-icons/Vanguard_Icon.png",
        Duelist: "/role-icons/Duelist_Icon.png",
        Strategist: "/role-icons/Strategist_Icon.png",
    }

    return (
        <Box pt={2}>
            {/* Only show table if not loading and table has data */}
            {!loading && table.length > 0 && (
                <TableContainer
                    component={Paper}
                    sx={{
                        mb: 2,
                        bgcolor: 'rgba(30,30,40,0.92)',
                        boxShadow: 'none',
                        borderRadius: 2,
                        border: '1px solid rgba(255,255,255,0.07)'
                    }}
                >
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {table[0].map((h, i) => (
                                    <TableCell
                                        key={i}
                                        sx={{
                                            fontSize: '0.75rem',
                                            px: 0.25,
                                            py: 0.25,
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            color: '#fff',
                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                            borderBottom: '1px solid rgba(255,255,255,0.12)'
                                        }}
                                        padding="none"
                                        onClick={() => {
                                            if (sortCol === i) {
                                                setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                                            } else {
                                                setSortCol(i);
                                                setSortDir('desc');
                                            }
                                        }}
                                    >
                                        <Box display="flex" alignItems="center">
                                            {h}
                                            {sortCol === i && (
                                                sortDir === 'asc'
                                                    ? <ArrowDropUpIcon fontSize="small" />
                                                    : <ArrowDropDownIcon fontSize="small" />
                                            )}
                                        </Box>
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedRows.map((row, r) => (
                                <TableRow
                                    key={r}
                                    sx={{
                                        height: '28px',
                                        backgroundColor: r % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)'
                                    }}
                                >
                                    {row.map((cell, c) => (
                                        <TableCell
                                            key={c}
                                            sx={{
                                                fontSize: '0.75rem',
                                                px: 0.25,
                                                py: 0.25,
                                                color: '#e0e0e0',
                                                borderBottom: '1px solid rgba(255,255,255,0.07)'
                                            }}
                                            padding="none"
                                        >
                                            {/* Render role icon for Role column */}
                                            {c === 0 && ROLE_ICONS[cell] ? (
                                                <img
                                                    src={ROLE_ICONS[cell]}
                                                    alt={cell}
                                                    title={cell}
                                                    style={{ width: 24, height: 24, verticalAlign: 'middle' }}
                                                />
                                            ) : cell}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            {/* Only show "No hero data loaded" if not loading and no data */}
            {!loading && (!rawData || table.length === 0) && (
                <Box sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>
                    No hero data loaded.
                </Box>
            )}
        </Box>
    )
}
