import React from 'react';
import { Box, Typography, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, LinearProgress, Grid } from '@mui/material';
import { formatNumber, getMatchesLeftColor, getProgressColor, computeWrappedDelta, FIELD_REWARDS } from '../../utils.js';
import Tooltip from '../Tooltip.jsx';

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
                <Typography sx={{ color: 'white', minWidth: 45, textAlign: 'right', fontWeight: 'normal' }}>
                    {Math.round(overallPct)}%
                </Typography>
            </Box>
            <Typography sx={{ mb: 2, color: '#b0b0b0', display: 'flex', alignItems: 'center', gap: 1 }}>
                Rank: <span style={{ color: 'white' }}>{stats.status}</span>
                <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#b0b0b0' }}>•</span>
                Proficiency: <span style={{ color: 'white' }}>{formatNumber(stats.proficiencyCurrent)} / {formatNumber(stats.proficiencyMax)}</span>
            </Typography>

            {/* Summary metrics below progress bar */}
            {metrics && (
                <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mb: 2,
                    color: '#b0b0b0',
                    alignItems: 'flex-start'
                }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: 'auto auto',
                        gap: '0.5rem 1rem',
                        alignItems: 'center'
                    }}>
                        <Tooltip content="Estimated time remaining to complete the current rank based on your recent performance" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Hours Left:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ color: 'white', fontWeight: 400 }}>
                            ~{metrics.hoursLeft}
                        </Typography>
                        <Tooltip content="Estimated number of matches needed to complete the current rank based on your average proficiency gains" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Matches Left:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ color: 'white', fontWeight: 400 }}>
                            ~{metrics.matchesLeft}
                        </Typography>
                        <Tooltip content="Estimated date and time when you will complete the current rank based on your recent play pattern" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Projected Date:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ color: 'white', fontWeight: 400 }}>
                            {metrics.projectedCompletionDate 
                                ? metrics.projectedCompletionDate.toLocaleDateString('en-US', {
                                    month: 'short', day: 'numeric', 
                                    hour: 'numeric', minute: '2-digit', hour12: true
                                })
                                : '–'
                            }
                        </Typography>
                    </Box>
                    
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: 'auto auto',
                        gap: '0.5rem 1rem',
                        alignItems: 'center'
                    }}>
                        <Tooltip content="Average proficiency points gained per match based on your recent performance" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Prof. Per Match:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ color: 'white', fontWeight: 400 }}>
                            {metrics.ptsPerMatch}
                        </Typography>
                        <Tooltip content="Total proficiency points gained since you started tracking progress for this character" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Total Gained:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ color: 'white', fontWeight: 400 }}>
                            {formatNumber(metrics.totalGained)}
                        </Typography>
                        <Tooltip content="Proficiency points gained in the last 24 hours, including any rank completions" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Last 24 Hours:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ 
                            color: 'white', 
                            fontWeight: 400 
                        }}>
                            {formatNumber(metrics.prof24Hours)}
                        </Typography>
                        <Tooltip content="Average points earned per hour over your activity span within the last 24 hours" placement="top">
                            <Typography variant="body1" sx={{ color: '#b0b0b0', fontWeight: 400, cursor: 'default', userSelect: 'text' }}>
                                Prof. Per Hour:
                            </Typography>
                        </Tooltip>
                        <Typography variant="body1" sx={{ color: 'white', fontWeight: 400 }}>
                            {typeof metrics.pointsPerHour24h === 'number' || /^(?:\d+)(?:\.\d+)?$/.test(metrics.pointsPerHour24h)
                                ? metrics.pointsPerHour24h
                                : '–'}
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
                            <TableCell >Avg Gain</TableCell>
                            <TableCell sx={{ minWidth: 70, width: 80, whiteSpace: 'nowrap', textAlign: 'center' }}>
                                <Tooltip content="Effectiveness vs. time: (field%/min%) relative to 60-min time field" placement="top">
                                    <span>Eff.</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell >Matches</TableCell>
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

                            // Calculate average challenge points per game for this field
                            // Use raw averageGains to show actual average gain per match
                            let avgPointsPerGame = 0;
                            if (metrics?.averageGains) {
                                avgPointsPerGame = metrics.averageGains[idx];
                            }

                            // Effectiveness relative to time played (field 1)
                            // Normalize by each field's max so we're comparing fractional progress per time.
                            // effectiveness = ((avgGain_i / max_i) / (avgMinutes / timeMax)) * 100
                            let effectivenessPct = null;
                            const timeAvg = metrics?.averageGains?.[0]; // avg minutes per match
                            const timeMax = stats?.field1Max || 60; // default fallback
                            if (typeof timeAvg === 'number' && timeAvg > 0 && maxValue > 0) {
                                if (idx === 0) {
                                    effectivenessPct = 100;
                                } else {
                                    const fracPerMatch = metrics.averageGains[idx] / maxValue;
                                    const timeFracPerMatch = timeAvg / timeMax;
                                    effectivenessPct = timeFracPerMatch > 0
                                        ? (fracPerMatch / timeFracPerMatch) * 100
                                        : null;
                                }
                            }

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
                                            fontWeight: 'normal', // Remove bold
                                            minWidth: 36, fontSize: '0.9rem'
                                        }}>
                                            {gain > 0 ? `+${formatNumber(gain)}` : formatNumber(gain)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography sx={{
                                            color: avgPointsPerGame > 0 ? '#4caf50' : '#b0b0b0',
                                            fontWeight: 'normal',
                                            minWidth: 60, fontSize: '0.9rem'
                                        }}>
                                            {avgPointsPerGame > 0 ? formatNumber(Math.round(avgPointsPerGame)) : '–'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ minWidth: 70, width: 80, whiteSpace: 'nowrap', textAlign: 'center' }}>
                                        <Typography sx={{
                                            color: 'white',
                                            fontWeight: 'normal',
                                            fontSize: '0.9rem'
                                        }}>
                                            {typeof effectivenessPct === 'number'
                                                ? `${Math.round(effectivenessPct)}%`
                                                : '–'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography sx={{
                                            color: getMatchesLeftColor(matchesToComplete),
                                            fontWeight: 'normal',
                                            minWidth: 60, fontSize: '0.9rem'
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
