import React from 'react';
import { Box, Typography, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, LinearProgress } from '@mui/material';
import { formatNumber, getMatchesLeftColor, getProgressColor, computeWrappedDelta } from '../../utils.js';

/**
 * Challenges component for displaying challenge progress and summary stats.
 * @param {Object} props
 * @param {Object} stats - Current stats object (must have .proficiencyCurrent, .proficiencyMax, .fieldNames, etc.)
 * @param {Object} previousStats - Previous stats object for gain calculation
 * @param {Object} metrics - Metrics object with ptsPerMatch, totalGained, hoursLeft, matchesLeft
 */
export default function Challenges({ stats, previousStats, metrics }) {
    const overallPct = (stats.proficiencyCurrent / stats.proficiencyMax) * 100;

    // Precompute gains and matches to complete only if previousStats is provided
    const { gains, toComplete } = React.useMemo(() => {
        if (!previousStats) return { gains: [], toComplete: [] };
        return stats.fieldNames.reduce((acc, _, i) => {
            const cur = stats[`field${i + 1}Current`];
            const prev = previousStats[`field${i + 1}Current`];
            const pmax = previousStats[`field${i + 1}Max`];
            const g = computeWrappedDelta(cur, prev, pmax);
            acc.gains.push(g);
            acc.toComplete.push(g > 0 ? (stats[`field${i + 1}Max`] - cur) / g : Infinity);
            return acc;
        }, { gains: [], toComplete: [] });
    }, [stats, previousStats]);

    return (
        <Box sx={{ mb: 2 }}>
            {/* Progress bar and rank info */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ flexGrow: 1, mr: 1 }}>
                    <LinearProgress variant="determinate" value={overallPct} />
                </Box>
                <Typography sx={{ color: 'white', minWidth: 45, textAlign: 'right' }}>
                    {Math.round(overallPct)}%
                </Typography>
            </Box>
            <Typography sx={{ mb: 2, color: 'white' }}>
                Rank: {stats.status} | Proficiency: {formatNumber(stats.proficiencyCurrent)} / {formatNumber(stats.proficiencyMax)}
            </Typography>

            {/* Summary metrics below progress bar */}
            {metrics && (
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mb: 2,
                    gap: 2,
                    color: 'white'
                }}>
                    <Box>
                        <Typography>
                            Prof. Per Match: {metrics.ptsPerMatch}
                        </Typography>
                        <Typography sx={{ mt: 1 }}>
                            Total Gained: {formatNumber(metrics.totalGained)}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography>
                            Hours Left: ~{metrics.hoursLeft}
                        </Typography>
                        <Typography>
                            Matches Left: ~{metrics.matchesLeft}
                        </Typography>
                    </Box>
                </Box>
            )}

            {/* Table title directly above the table */}
            <Typography variant="h6" sx={{ color: 'white', mb: 1, textAlign: 'center' }}>
                Challenges
            </Typography>

            {/* Challenge Table */}
            <TableContainer component={Paper} sx={{ mb: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Challenge</TableCell>
                            <TableCell>Current</TableCell>
                            <TableCell>Max</TableCell>
                            <TableCell>Progress</TableCell>
                            <TableCell>Gain</TableCell>
                            <TableCell>Matches Left</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stats.fieldNames.map((name, idx) => {
                            const currentValue = stats[`field${idx + 1}Current`];
                            const maxValue = stats[`field${idx + 1}Max`];
                            const gain = previousStats ? gains[idx] : 0;
                            const matchesToComplete = previousStats ? toComplete[idx] : '–';
                            const pct = (currentValue / maxValue) * 100;
                            const color = getProgressColor(pct);

                            return (
                                <TableRow key={idx}>
                                    <TableCell>{name}</TableCell>
                                    <TableCell>{formatNumber(currentValue)}</TableCell>
                                    <TableCell>{formatNumber(maxValue)}</TableCell>
                                    <TableCell sx={{ minWidth: 140, maxWidth: 180, width: '18%' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Box sx={{ flexGrow: 1, mr: 1 }}>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={pct}
                                                    sx={{
                                                        height: 10,
                                                        borderRadius: 5,
                                                        backgroundColor: 'rgba(255,255,255,0.12)',
                                                        '& .MuiLinearProgress-bar': { backgroundColor: color }
                                                    }}
                                                />
                                            </Box>
                                            <Typography sx={{
                                                color: 'white', minWidth: 32, textAlign: 'right', fontWeight: 'bold'
                                            }}>
                                                {Math.round(pct)}%
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography sx={{
                                            color: gain > 0 ? '#4caf50' : '#b0b0b0',
                                            fontWeight: gain > 0 ? 'bold' : 'normal',
                                            minWidth: 36, fontSize: '0.9rem'
                                        }}>
                                            {gain > 0 ? `+${formatNumber(gain)}` : formatNumber(gain)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography sx={{
                                            color: getMatchesLeftColor(matchesToComplete),
                                            fontWeight:
                                                matchesToComplete > 0 && matchesToComplete !== Infinity
                                                    ? 'bold' : 'normal',
                                            minWidth: 36, fontSize: '0.9rem'
                                        }}>
                                            {matchesToComplete > 0 && matchesToComplete !== Infinity
                                                ? `~${Math.ceil(matchesToComplete)}`
                                                : '–'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
