import { useMemo } from 'react';
import { Box, Typography, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper } from '@mui/material';
import { getRankCap, formatNumber, RANKS } from '../../utils.js';

/**
 * RankProgression component for displaying rank progression table.
 * @param {Object} props
 * @param {Object} props.currentStats - Current stats object (must have .status, .proficiencyCurrent, .proficiencyMax)
 * @param {number[]} props.averageGains - Array of average gains per field
 * @param {number|string} props.profPerMatch - Proficiency per match
 * @param {number} props.currentRemainingMatches - Remaining matches for current rank
 * @param {number} props.currentRemainingHours - Remaining hours for current rank
 */
export default function RankProgression({
    currentStats, averageGains, profPerMatch,
    currentRemainingMatches
}) {
    const progression = useMemo(() => {
        if (!averageGains?.length || !profPerMatch || !currentStats) return [];
        const perMatch = Number(profPerMatch);
        if (!perMatch || perMatch <= 0) return [];
        const matches = [];
        let cumMatches = 0;
        const startIdx = RANKS.order.indexOf(currentStats.status) + 1;
        const typicalMins = 12;
        for (let idx = startIdx; idx < RANKS.order.length; idx++) {
            const rank = RANKS.order[idx];
            const cap = getRankCap(rank);
            let need, m;
            if (idx === startIdx) {
                need = currentStats.proficiencyMax - currentStats.proficiencyCurrent;
                m = currentRemainingMatches;
            } else {
                need = cap;
                m = need / perMatch;
            }
            cumMatches += m;
            matches.push({
                rank,
                profNeeded: Math.round(need),
                cumulativeMatches: Math.ceil(cumMatches),
                cumulativeHours: ((cumMatches * typicalMins) / 60).toFixed(1)
            });
            if (rank === 'Lord') break;
        }
        return matches;
    }, [averageGains, currentStats, profPerMatch, currentRemainingMatches]);

    if (!progression.length) return null;
    return (
        <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ color: 'white', mb: 1, textAlign: 'center' }}>
                Rank Progression
            </Typography>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>Prof. Needed</TableCell>
                            <TableCell>Total Matches</TableCell>
                            <TableCell>Total Hours</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {progression.map(({ rank, profNeeded, cumulativeMatches, cumulativeHours }) => (
                            <TableRow key={rank}>
                                <TableCell>{rank}</TableCell>
                                <TableCell>{formatNumber(profNeeded)}</TableCell>
                                <TableCell>~{cumulativeMatches}</TableCell>
                                <TableCell>~{cumulativeHours}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
