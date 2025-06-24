// ProficiencyTracker.jsx
import React, { useReducer, useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
    Box, Button, LinearProgress, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Container, Dialog, DialogTitle, DialogContent,
    DialogContentText, DialogActions, ThemeProvider, Stack, IconButton, FormControl,
    InputLabel, Select, MenuItem, Avatar
} from '@mui/material';
import {
    Chart as ChartJS, CategoryScale, LinearScale, TimeScale, PointElement, LineElement,
    Title, Tooltip, Legend
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import * as themes from '../../themes';
import localforage from 'localforage';
import characters from '../../characters.json';
import { AddAPhoto, Delete, Undo, PlayArrow, Stop, ChevronLeft, ChevronRight } from '@mui/icons-material';

ChartJS.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Title, Tooltip, Legend);

// --- Constants & Helpers ---

// Format numbers with locale separators
const formatNumber = n => n.toLocaleString();

// Rank data consolidated into a single object
const RANKS = {
    order: ['Agent', 'Knight', 'Captain', 'Centurion', 'Lord'],
    caps: { Agent: 500, Knight: 1200, Captain: 2000, Centurion: 2400, Lord: 2400 },
    multipliers: { Agent: 1.3, Knight: 1.35, Captain: 1.4, Centurion: 1.45, Lord: 1.55 }
};

// Change this array to the real challenge reward amounts:
const FIELD_REWARDS = [60, 40, 25, 20];

// Simulation parameters grouped
const SIM = {
    JITTER_MIN: 0.85,
    JITTER_RANGE: 0.3,
    DEFAULT_RATIO: 0.16,
    MINUTES_MIN: 5,
    MINUTES_RANGE: 11
};

// Simplified helpers
const getRankCap = rank => RANKS.caps[rank];
const getNextRank = current => {
    const idx = RANKS.order.indexOf(current);
    return idx < RANKS.order.length - 1 ? RANKS.order[idx + 1] : current;
};
const computeWrappedDelta = (cur, prev, prevMax) => {
    // Handles multiple rollovers
    let diff = cur - prev;
    if (diff < 0) diff += Math.ceil((prev - cur) / prevMax) * prevMax;
    return diff;
};

// Apply challenge gains to a stats snapshot, handling rollover & promotions
function applyChallengeGains(stats, gains) {
    gains.forEach((gain, i) => {
        const curKey = `field${i + 1}Current`;
        const maxKey = `field${i + 1}Max`;
        stats[curKey] += gain;
        while (stats[curKey] >= stats[maxKey]) {
            stats[curKey] -= stats[maxKey]; // Fixed: use maxKey from stats object
            stats.proficiencyCurrent += FIELD_REWARDS[i];
        }
    });

    // Promote rank as needed
    while (stats.proficiencyCurrent >= getRankCap(stats.status)) {
        stats.proficiencyCurrent -= getRankCap(stats.status);
        stats.status = getNextRank(stats.status);
    }
    stats.proficiencyMax = getRankCap(stats.status);
}

// Crop & grayscale the canvas before sending to OCR
function cropImage(srcCanvas, sw, sh) {
    const leftFrac = 950 / 2560;
    const topFrac = 289 / 1440;
    const rightFrac = 1704 / 2560;
    const bottomFrac = 1200 / 1440;

    const x = Math.floor(leftFrac * sw);
    const y = Math.floor(topFrac * sh);
    const w = Math.floor((rightFrac - leftFrac) * sw);
    const h = Math.floor((bottomFrac - topFrac) * sh);

    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);

    return tmp;
}

// Parse OCR items into a structured stats object
function parseOcrResult(items) {
    const texts = items.map(({ text }) => text.trim());
    const MAX_FIELDS = 4;
    const STATUS_REGEX = /\b(Agent|Knight|Captain|Centurion|Lord)\b/i;
    const NUM_PAIR = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/;

    // Parse rank
    const rawStatus = texts.find(t => STATUS_REGEX.test(t))?.match(STATUS_REGEX)?.[1];
    if (!rawStatus) throw new Error('Failed to parse rank');
    const status = rawStatus[0].toUpperCase() + rawStatus.slice(1).toLowerCase();

    // Parse proficiency
    const profText = texts.find(t => /proficiency/i.test(t) && NUM_PAIR.test(t));
    if (!profText) throw new Error('Failed to parse overall proficiency');
    const [, curStr, maxStr] = profText.match(NUM_PAIR);
    const proficiencyCurrent = parseInt(curStr.replace(/,/g, ''), 10);
    const proficiencyMax = parseInt(maxStr.replace(/,/g, ''), 10);
    const profIndex = texts.indexOf(profText);

    // Find challenge pairs
    const nnIndices = texts
        .map((t, i) => NUM_PAIR.test(t) ? i : -1)
        .filter(i => i >= 0 && i !== profIndex)
        .slice(0, MAX_FIELDS);

    if (nnIndices.length < MAX_FIELDS) throw new Error('Failed to pair challenges');

    // Parse challenges
    const challenges = nnIndices.map(idx => {
        const [curRaw, maxRaw] = texts[idx].split('/');
        const cur = parseInt(curRaw.replace(/,/g, ''), 10);
        const max = parseInt(maxRaw.replace(/,/g, ''), 10);
        if (isNaN(cur) || isNaN(max)) {
            throw new Error(`Invalid numeric pair at index ${idx}: ${texts[idx]}`);
        }

        const name = [texts[idx - 1], texts[idx - 2], texts[idx + 1], texts[idx + 2]]
            .find(c =>
                c &&
                !NUM_PAIR.test(c) &&
                !STATUS_REGEX.test(c) &&
                !/proficiency/i.test(c) &&
                c.length > 2
            )?.replace(/^CO\s*/i, '').trim() || '';

        return { name, cur, max };
    });

    // Build stats object
    const fieldNames = challenges.map(c => c.name);
    const stats = { status, proficiencyCurrent, proficiencyMax, fieldNames };
    challenges.forEach(({ cur, max }, i) => {
        stats[`field${i + 1}Current`] = cur;
        stats[`field${i + 1}Max`] = max;
    });

    return stats;
}

// Character list
const CHARACTERS = characters;

// Default empty character data
const initialCharacterData = {
    history: [],
    backupHistory: []
};

// --- Reducer for history & simulation state ---
const initialState = {
    characters: {},
    currentCharacter: null,
    simMode: false,
    simCount: 0
};

function reducer(state, action) {
    switch (action.type) {
        case 'LOAD':
            return {
                ...state,
                characters: action.payload.characters || {},
                currentCharacter: action.payload.currentCharacter
            };
        case 'SET_CHARACTER':
            return {
                ...state,
                currentCharacter: action.payload
            };
        case 'INIT_CHARACTER':
            return {
                ...state,
                characters: {
                    ...state.characters,
                    [action.payload]: state.characters[action.payload] || { ...initialCharacterData }
                }
            };
        case 'CAPTURE': {
            const character = state.currentCharacter;
            if (!character) return state;

            return {
                ...state,
                characters: {
                    ...state.characters,
                    [character]: {
                        ...state.characters[character],
                        history: [...state.characters[character].history, action.payload]
                    }
                }
            };
        }
        case 'CLEAR': {
            const character = state.currentCharacter;
            if (!character) return state;

            return {
                ...state,
                characters: {
                    ...state.characters,
                    [character]: { ...initialCharacterData }
                }
            };
        }
        case 'BACKUP': {
            const character = state.currentCharacter;
            if (!character) return state;

            return {
                ...state,
                characters: {
                    ...state.characters,
                    [character]: {
                        ...state.characters[character],
                        backupHistory: [...state.characters[character].history]
                    }
                },
                simMode: true,
                simCount: 0
            };
        }
        case 'SIM_STEP': {
            const character = state.currentCharacter;
            if (!character) return state;

            return {
                ...state,
                characters: {
                    ...state.characters,
                    [character]: {
                        ...state.characters[character],
                        history: [...state.characters[character].history, action.payload]
                    }
                },
                simCount: state.simCount + 1
            };
        }
        case 'RESTORE': {
            const character = state.currentCharacter;
            if (!character) return state;

            return {
                ...state,
                characters: {
                    ...state.characters,
                    [character]: {
                        ...state.characters[character],
                        history: [...state.characters[character].backupHistory],
                        backupHistory: []
                    }
                },
                simMode: false,
                simCount: 0
            };
        }
        case 'UNDO': {
            const character = state.currentCharacter;
            if (!character) return state;

            return {
                ...state,
                characters: {
                    ...state.characters,
                    [character]: {
                        ...state.characters[character],
                        history: state.characters[character].history.slice(0, -1)
                    }
                }
            };
        }
        default:
            return state;
    }
}

// Helper: get color from 0 (red) to 120 (green) based on percent
function getProgressColor(pct) {
    // Clamp between 0 and 100
    const percent = Math.max(0, Math.min(100, pct));
    // Hue from 0 (red) to 120 (green)
    const hue = (percent * 1.2); // 0-120
    return `hsl(${hue}, 100%, 45%)`;
}

// Renders a single challenge row
const FieldRow = React.memo(({ challengeName, currentValue, maxValue, gain, matchesToComplete }) => {
    const pct = (currentValue / maxValue) * 100;
    const progressColor = getProgressColor(pct);

    return (
        <TableRow
            sx={{
                backgroundColor: 'rgba(255,255,255,0.07)',
                '&:last-child td, &:last-child th': { border: 0 }
            }}
        >
            <TableCell sx={{ color: '#e0e0e0' }}>{challengeName}</TableCell>
            <TableCell sx={{ color: '#e0e0e0' }}>{formatNumber(currentValue)}</TableCell>
            <TableCell sx={{ color: '#e0e0e0' }}>{formatNumber(maxValue)}</TableCell>
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
                                '& .MuiLinearProgress-bar': {
                                    backgroundColor: progressColor
                                }
                            }}
                        />
                    </Box>
                    <Typography
                        sx={{
                            color: 'white', // Always white for the percentage
                            minWidth: 32,
                            textAlign: 'right',
                            fontWeight: 'bold'
                        }}
                    >
                        {Math.round(pct)}%
                    </Typography>
                </Box>
            </TableCell>
            <TableCell>
                <Typography
                    sx={{
                        color: gain > 0 ? '#4caf50' : '#b0b0b0',
                        fontWeight: gain > 0 ? 'bold' : 'normal',
                        minWidth: 36,
                        fontSize: '0.9rem',
                        textAlign: 'left'
                    }}
                >
                    {gain > 0 ? `+${formatNumber(gain)}` : formatNumber(gain)}
                </Typography>
            </TableCell>
            <TableCell>
                <Typography
                    sx={{
                        color: matchesToComplete > 0 ? '#ffd600' : '#b0b0b0',
                        fontWeight: matchesToComplete > 0 ? 'bold' : 'normal',
                        minWidth: 36,
                        fontSize: '0.9rem',
                        textAlign: 'left'
                    }}
                >
                    {matchesToComplete > 0 && matchesToComplete !== Infinity
                        ? Math.ceil(matchesToComplete)
                        : '–'}
                </Typography>
            </TableCell>
        </TableRow>
    );
});

// Displays overall & per-challenge proficiency
const ProficiencyStats = React.memo(function ProficiencyStats({ stats, previousStats }) {
    const overallPct = (stats.proficiencyCurrent / stats.proficiencyMax) * 100;

    // Calculate gains for each field if previousStats is available
    const gains = [];
    const matchesToComplete = [];
    if (previousStats) {
        for (let i = 0; i < stats.fieldNames.length; i++) {
            const currentValue = stats[`field${i + 1}Current`];
            const previousValue = previousStats[`field${i + 1}Current`];
            const previousMax = previousStats[`field${i + 1}Max`];

            // Handle values that wrap around during level-up
            const gain = computeWrappedDelta(currentValue, previousValue, previousMax);
            gains.push(gain);

            // Predict matches to complete this challenge
            const remaining = stats[`field${i + 1}Max`] - currentValue;
            matchesToComplete.push(gain > 0 ? remaining / gain : Infinity);
        }
    }

    return (
        <>
            {/* Overall proficiency bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ flexGrow: 1, mr: 1 }}>
                    <LinearProgress variant="determinate" value={overallPct} />
                </Box>
                <Typography sx={{ color: 'white', minWidth: 45, textAlign: 'right' }}>
                    {Math.round(overallPct)}%
                </Typography>
            </Box>

            {/* Rank & raw proficiency */}
            <Typography sx={{ mb: 2, color: 'white' }}>
                Rank: {stats.status} | Proficiency:{' '}
                {formatNumber(stats.proficiencyCurrent)} /{' '}
                {formatNumber(stats.proficiencyMax)}
            </Typography>

            {/* Challenge breakdown */}
            <TableContainer
                component={Paper}
                sx={{ mb: 2, bgcolor: 'transparent', boxShadow: 'none' }}
            >
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
                        {stats.fieldNames.map((name, idx) => (
                            <FieldRow
                                key={idx}
                                challengeName={name}
                                currentValue={stats[`field${idx + 1}Current`]}
                                maxValue={stats[`field${idx + 1}Max`]}
                                gain={previousStats ? gains[idx] : 0}
                                matchesToComplete={previousStats ? matchesToComplete[idx] : '–'}
                            />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    );
});

export default function ProficiencyTracker() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { simMode, simCount, currentCharacter, characters } = state;
    const [loading, setLoading] = useState(false);
    const [errorOpen, setErrorOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const canvasRef = useRef(null);
    const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [currentGameIndex, setCurrentGameIndex] = useState(-1);

    // Get current character's data
    const currentCharacterData = useMemo(() =>
        (currentCharacter && characters[currentCharacter]) || initialCharacterData,
        [currentCharacter, characters]
    );

    // Get current character's history
    const history = useMemo(() =>
        currentCharacterData.history || [],
        [currentCharacterData]
    );

    // Filter out simulated games
    const realGames = useMemo(
        () => history.filter(entry => !entry.isSimulated),
        [history]
    );

    // Handle character selection
    const handleCharacterChange = (event) => {
        const character = event.target.value;
        if (character) {
            dispatch({ type: 'INIT_CHARACTER', payload: character });
            dispatch({ type: 'SET_CHARACTER', payload: character });
        }
    };

    // Update navigation to use realGames
    useEffect(() => {
        // When loading, set to latest real game
        setCurrentGameIndex(realGames.length > 0 ? realGames.length - 1 : -1);
    }, [realGames.length]);

    // Keep currentGameIndex at the latest real game during simulation
    useEffect(() => {
        if (simMode) {
            setCurrentGameIndex(realGames.length - 1);
        }
    }, [simMode, realGames.length]);

    // Always keep currentGameIndex at the latest real game while simulating
    useEffect(() => {
        if (simMode && currentGameIndex !== realGames.length - 1) {
            setCurrentGameIndex(realGames.length - 1);
        }
    }, [simMode, realGames.length, currentGameIndex]);

    // Load data from storage
    useEffect(() => {
        localforage.getItem('pt-characters').then(saved => {
            if (saved && typeof saved === 'object') {
                dispatch({ type: 'LOAD', payload: saved });

                // Set index to the latest game if a character is selected
                if (saved.currentCharacter &&
                    saved.characters[saved.currentCharacter]?.history?.length > 0) {
                    const realGamesCount = saved.characters[saved.currentCharacter].history
                        .filter(entry => !entry.isSimulated).length;
                    setCurrentGameIndex(realGamesCount > 0 ? realGamesCount - 1 : -1);
                }
            }
        });
    }, []);

    // Save data to storage
    useEffect(() => {
        localforage.setItem('pt-characters', {
            characters: characters,
            currentCharacter: currentCharacter
        });

        // Update index if we're beyond bounds
        if (currentGameIndex >= realGames.length) {
            setCurrentGameIndex(realGames.length > 0 ? realGames.length - 1 : -1);
        }
    }, [characters, currentCharacter, realGames.length, currentGameIndex]);

    // Debounced save to localforage
    useEffect(() => {
        const timeout = setTimeout(() => {
            localforage.setItem('pt-characters', {
                characters: characters,
                currentCharacter: currentCharacter
            });
        }, 300); // 300ms debounce
        return () => clearTimeout(timeout);
    }, [characters, currentCharacter]);

    // Navigation handlers
    const goToPreviousGame = useCallback(() =>
        currentGameIndex > 0 && setCurrentGameIndex(currentGameIndex - 1),
        [currentGameIndex]
    );

    const goToNextGame = useCallback(() =>
        currentGameIndex < realGames.length - 1 && setCurrentGameIndex(currentGameIndex + 1),
        [currentGameIndex, realGames.length]
    );

    // After capturing a new entry, update the index to show the latest
    const captureProficiency = useCallback(async () => {
        if (!currentCharacter) {
            setErrorMessage('Please select a character first');
            setErrorOpen(true);
            return;
        }

        let stream, video;
        setErrorMessage('');
        setErrorOpen(false);
        setLoading(true);

        try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            video = document.createElement('video');
            video.style.display = 'none';
            document.body.appendChild(video);
            video.srcObject = stream;
            await video.play();
            await new Promise(requestAnimationFrame);

            // Render to hidden canvas
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);

            // Crop & gray before sending
            const cropped = cropImage(canvas, canvas.width, canvas.height);
            const blob = await new Promise(res => cropped.toBlob(res, 'image/png'));
            const form = new FormData();
            form.append('file', blob, `ss_${Date.now()}.png`);

            const resp = await fetch('/api/ocr', {
                method: 'POST',
                cache: 'no-store',
                body: form
            });
            if (!resp.ok) throw new Error(`OCR failed (${resp.status})`);
            const { result } = await resp.json();

            const stats = parseOcrResult(result);
            dispatch({ type: 'CAPTURE', payload: { stats, time: Date.now() } });
            setCurrentGameIndex(realGames.length); // will be the new last index
        } catch (err) {
            console.error('Capture error:', err);
            setErrorMessage(err.message || 'Unknown error');
            setErrorOpen(true);
        } finally {
            // Always cleanup media & DOM nodes
            if (video) {
                video.pause();
                video.srcObject = null;
                video.remove();
            }
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
            setLoading(false);
        }
    }, [currentCharacter, realGames.length]);

    // Compute average gains between history entries
    const computeAverageGains = entries => {
        if (entries.length < 2) return [];
        return FIELD_REWARDS.map((_, idx) => {
            let total = 0;
            for (let i = 1; i < entries.length; i++) {
                const prev = entries[i - 1].stats;
                const curr = entries[i].stats;
                total += computeWrappedDelta(
                    curr[`field${idx + 1}Current`],
                    prev[`field${idx + 1}Current`],
                    prev[`field${idx + 1}Max`]
                );
            }
            return total / (entries.length - 1);
        });
    };

    // Simulate one match's worth of gains
    const getFieldRewardsForRank = (rank) => {
        // 1st item = playtime always 60; rest scale by rank
        switch (rank) {
            case 'Lord':
            case 'Centurion':
                return [60, 50, 50, 50];
            case 'Captain':
                return [60, 40, 40, 40];
            case 'Knight':
                return [60, 25, 25, 25];
            default: // Agent
                return [60, 10, 10, 10];
        }
    }

    const simulateGame = useCallback(() => {
        // Only simulate if a character is selected
        if (!currentCharacter) {
            setErrorMessage('Please select a character first');
            setErrorOpen(true);
            return;
        }

        // Require at least 2 real entries for a valid average
        const realEntries = history.filter(h => !h.isSimulated);
        if (realEntries.length < 2) {
            setErrorMessage('Not enough real matches to calculate an average for simulation');
            setErrorOpen(true);
            return;
        }

        // Don’t simulate if no history or already at Lord
        if (history.length === 0) return;
        const last = history[history.length - 1];
        if (last.stats.status === 'Lord') return;

        // Backup once before first sim step
        if (!simMode) dispatch({ type: 'BACKUP' });

        const snapshot = { ...last.stats };

        // Get rank-based array of field rewards
        const dynamicRewards = getFieldRewardsForRank(snapshot.status);

        // Use computeAverageGains or skip partial proficiency as needed
        const avgGains = computeAverageGains(realEntries);

        const gains = dynamicRewards.map((baseReward, idx) => {
            const jitter = SIM.JITTER_MIN + Math.random() * SIM.JITTER_RANGE;
            // No further multiplier on the first item—its rank scaling is always fixed (60)
            const multiplier = (idx > 0) ? 1 : 1;
            const baseline = avgGains[idx] > 0
                ? avgGains[idx]
                : snapshot[`field${idx + 1}Max`] * SIM.DEFAULT_RATIO;
            return Math.max(1, Math.round(baseline * jitter * multiplier));
        });

        applyChallengeGains(snapshot, gains);

        // Advance time
        const mins = SIM.MINUTES_MIN + Math.floor(Math.random() * SIM.MINUTES_RANGE);
        const nextTime = last.time + mins * 60_000;

        dispatch({ type: 'SIM_STEP', payload: { stats: snapshot, time: nextTime, isSimulated: true } });
    }, [currentCharacter, history, simMode]);

    // Restore pre-simulation history
    const stopSimulation = useCallback(() => {
        dispatch({ type: 'RESTORE' });
    }, []);

    // Undo last capture
    const handleUndo = useCallback(() => {
        if (!currentCharacter) {
            setErrorMessage('Please select a character first');
            setErrorOpen(true);
            return;
        }
        setUndoConfirmOpen(true);
    }, [currentCharacter]);

    const confirmUndo = useCallback(() => {
        dispatch({ type: 'UNDO' });
        setUndoConfirmOpen(false);
    }, []);

    // Clear all data (with confirmation)
    const handleClear = useCallback(() => {
        if (!currentCharacter) {
            setErrorMessage('Please select a character first');
            setErrorOpen(true);
            return;
        }
        setClearConfirmOpen(true);
    }, [currentCharacter]);

    const confirmClear = useCallback(() => {
        dispatch({ type: 'CLEAR' });
        setClearConfirmOpen(false);
    }, []);

    const latestEntry = useMemo(() => history[history.length - 1] || null, [history]);

    // The entry to display
    const currentEntry = useMemo(() => {
        if (!currentCharacter) return null;

        if (simMode) {
            // Show the latest (simulated) entry during simulation
            return history.length > 0 ? history[history.length - 1] : null;
        }
        // Otherwise, show the selected real game
        return realGames.length > 0 && currentGameIndex >= 0 ? realGames[currentGameIndex] : null;
    }, [simMode, history, realGames, currentGameIndex, currentCharacter]);

    // The chart should show all history during simulation, or up to the selected real game otherwise
    const chartHistory = useMemo(() => {
        if (!currentCharacter) return [];

        if (simMode) {
            return history;
        }
        if (!currentEntry) return [];
        // Find the index of the currentEntry in the full history (by timestamp)
        const idx = history.findIndex(e => e.time === currentEntry.time);
        return idx >= 0 ? history.slice(0, idx + 1) : [];
    }, [simMode, history, currentEntry, currentCharacter]);

    // Chart data
    const chartData = useMemo(() => ({
        labels: chartHistory.map(e => new Date(e.time)),
        datasets: [{
            label: 'Proficiency',
            data: chartHistory.map(e => e.stats.proficiencyCurrent),
            borderColor: 'white',
            backgroundColor: 'white',
            fill: false,
            tension: 0.3,
            pointBackgroundColor: 'white'
        }]
    }), [chartHistory]);

    // Chart options
    const chartOptions = useMemo(() => {
        const vals = chartHistory.map(e => e.stats.proficiencyCurrent);
        const ymin = vals.length ? Math.min(...vals) : 0;
        const ymax = vals.length ? Math.max(...vals) : 0;
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        tooltipFormat: 'h:mm a',
                        displayFormats: { minute: 'h:mm a', hour: 'h:mm a' }
                    },
                    ticks: {
                        color: 'white',
                        callback: val => {
                            // Format tick label as "h:mm a"
                            const date = new Date(val);
                            return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.2)' }
                },
                y: {
                    beginAtZero: false,
                    suggestedMin: Math.floor(ymin * 0.9),
                    suggestedMax: Math.ceil(ymax * 1.1),
                    title: { display: true, text: 'Proficiency', color: 'white' },
                    ticks: { color: 'white' },
                    grid: { color: 'rgba(255,255,255,0.2)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { titleColor: 'white', bodyColor: 'white' }
            }
        };
    }, [chartHistory]);

    // Metrics for the currently selected real game
    const metrics = useMemo(() => {
        if (!currentEntry || realGames.length < 2 || currentGameIndex < 1) return null;
        const first = realGames[0];
        const last = currentEntry;
        const profDiff = last.stats.proficiencyCurrent - first.stats.proficiencyCurrent;
        const matches = currentGameIndex;

        // Calculate average match duration (in ms) with break detection
        let avgMatchDurationMs = 0;
        let validIntervals = 0;
        let totalValidTime = 0;
        
        if (realGames.length > 1) {
            const MAX_MATCH_TIME = 20 * 60 * 1000; // 20 minutes in ms - longest reasonable match
            
            for (let i = 1; i <= currentGameIndex; i++) {
                const interval = realGames[i].time - realGames[i - 1].time;
                
                // Only count intervals that are likely actual matches (not breaks)
                if (interval > 0 && interval <= MAX_MATCH_TIME) {
                    totalValidTime += interval;
                    validIntervals++;
                }
            }
            
            // Calculate average based only on valid intervals
            avgMatchDurationMs = validIntervals > 0 
                ? totalValidTime / validIntervals
                : 10 * 60 * 1000; // Default to 10 minutes if no valid intervals
        }
        
        const avgMatchDurationHours = avgMatchDurationMs / 3_600_000; // ms to hours
        const avgMatchDurationMinutes = avgMatchDurationMs / 60_000; // ms to minutes

        // Calculate average points gained per match
        const ptsPerMatch = matches > 0 ? (profDiff / matches).toFixed(1) : '–';
        const remaining = last.stats.proficiencyMax - last.stats.proficiencyCurrent;
        
        // Get current rank for scaling calculations
        const currentRank = last.stats.status;
        
        // Points per challenge completion based on rank
        const getPointsPerCompletion = (rank) => {
            switch(rank) {
                case 'Agent': return 10;
                case 'Knight': return 25;
                case 'Captain': return 40;
                case 'Centurion': 
                case 'Lord': 
                default: return 50;
            }
        };
        
        // Factor in rank-based point scaling
        const pointsPerMinute = 1; // Base playtime points (always 1 pt per minute)
        const pointsPerCompletion = getPointsPerCompletion(currentRank);
        
        // Calculate matches left based on historical performance
        const matchesLeft = ptsPerMatch > 0 && ptsPerMatch !== '–' ? Math.ceil(remaining / ptsPerMatch) : '–';

        // Calculate hours left using actual match duration (in-game time)
        const hoursLeft = (typeof matchesLeft === 'number')
            ? (matchesLeft * avgMatchDurationHours).toFixed(1)
            : '–';

        // For reference, keep ptsPerHour as real time
        const timeDiff = (last.time - first.time) / 3_600_000; // real hours
        const ptsPerHour = timeDiff > 0 ? (profDiff / timeDiff).toFixed(1) : '–';
        const totalGained = profDiff;
        
        // Calculate guaranteed points from playtime
        const guaranteedPointsPerMatch = avgMatchDurationMinutes * pointsPerMinute;
        
        // Calculate remaining points needed
        const pointsNeededForNextRank = remaining;

        return { 
            ptsPerHour, 
            ptsPerMatch, 
            hoursLeft, 
            matchesLeft, 
            totalGained, 
            avgMatchDurationHours,
            validMatchesCount: validIntervals,
            currentRank,
            pointsPerCompletion,
            guaranteedPointsPerMatch: guaranteedPointsPerMatch.toFixed(1),
            pointsNeededForNextRank
        };
    }, [currentEntry, realGames, currentGameIndex]);

    // Reusable confirmation dialog
    const ConfirmDialog = React.memo(({ open, title, message, onCancel, onConfirm, confirmText = 'Confirm' }) => (
        <Dialog open={open} onClose={onCancel}>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent><DialogContentText>{message}</DialogContentText></DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>Cancel</Button>
                <Button color="error" onClick={onConfirm}>{confirmText}</Button>
            </DialogActions>
        </Dialog>
    ));

    const renderCharacterValue = useCallback((selected) => {
        const character = CHARACTERS.find(char => char.name === selected);
        return character ? (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar src={character.icon} alt={character.name} sx={{ width: 24, height: 24, mr: 1 }} />
                {character.name}
            </Box>
        ) : '';
    }, []);

    // Previous entry for comparison
    const previousEntry = useMemo(() => {
        if (!currentEntry) return null;

        // Find the previous entry depending on mode
        if (simMode) {
            const currentIndex = history.findIndex(e => e.time === currentEntry.time);
            return currentIndex > 0 ? history[currentIndex - 1] : null;
        } else {
            return currentGameIndex > 0 ? realGames[currentGameIndex - 1] : null;
        }
    }, [currentEntry, history, realGames, currentGameIndex, simMode]);

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
            {/* Character Selector + Clear button row */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 1 }}>
                <FormControl fullWidth>
                    <InputLabel id="character-select-label" sx={{ color: 'white' }}>Character</InputLabel>
                    <Select
                        labelId="character-select-label"
                        id="character-select"
                        value={currentCharacter || ''}
                        label="Character"
                        onChange={handleCharacterChange}
                        sx={{
                            color: 'white',
                            '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'white' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'white' },
                            '.MuiSvgIcon-root': { color: 'white' }
                        }}
                        MenuProps={{
                            PaperProps: {
                                style: {
                                    maxHeight: 300
                                }
                            }
                        }}
                        renderValue={renderCharacterValue}
                    >
                        {CHARACTERS.map(char => (
                            <MenuItem key={char.name} value={char.name}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Avatar
                                        src={char.icon}
                                        alt={char.name}
                                        sx={{ width: 24, height: 24, mr: 1 }}
                                    />
                                    {char.name}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button
                    variant="outlined"
                    color="error"
                    onClick={handleClear}
                    disabled={!currentCharacter || !history.length}
                    startIcon={<Delete />}
                    sx={{
                        textTransform: 'none',
                        minWidth: 100,
                        maxWidth: 120,
                        px: 1.5,
                        py: 1,
                        ml: 2, // margin-left for spacing
                        height: '56px', // match dropdown height
                        alignSelf: 'stretch'
                    }}
                >
                    Clear
                </Button>
            </Box>

            {/* Controls */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{
                    mb: 3,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    width: '100%',
                    gap: 2,
                    px: 1,
                }}
            >
                {/* Capture Proficiency button */}
                <Button
                    variant="contained"
                    color="primary"
                    onClick={captureProficiency}
                    disabled={
                        loading ||
                        simMode ||
                        !currentCharacter ||
                        currentGameIndex !== realGames.length - 1
                    }
                    startIcon={<AddAPhoto />}
                    sx={{
                        textTransform: 'none',
                        minWidth: 170,
                        px: 2,
                        py: 1.2,
                    }}
                >
                    {loading ? 'Capturing…' : 'Capture Proficiency'}
                </Button>
                {/* Undo Last button */}
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleUndo}
                    disabled={!currentCharacter || history.length < 1 || simMode}
                    startIcon={<Undo />}
                    sx={{
                        textTransform: 'none',
                        minWidth: 170,
                        px: 2,
                        py: 1.2,
                    }}
                >
                    Undo Last
                </Button>
                {/* Simulate Game button */}
                <Button
                    variant="contained"
                    color="primary"
                    onClick={simulateGame}
                    disabled={
                        !currentCharacter ||
                        !history.length ||
                        latestEntry?.stats.status === 'Lord' ||
                        (!simMode && currentGameIndex !== realGames.length - 1)
                    }
                    startIcon={<PlayArrow />}
                    sx={{
                        textTransform: 'none',
                        minWidth: 170,
                        px: 2,
                        py: 1.2,
                    }}
                >
                    Simulate Game{simMode ? ` (${simCount})` : ''}
                </Button>
                {/* Stop Simulation button */}
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={stopSimulation}
                    disabled={!simMode}
                    startIcon={<Stop />}
                    sx={{
                        textTransform: 'none',
                        minWidth: 170,
                        px: 2,
                        py: 1.2,
                    }}
                >
                    Stop Simulation
                </Button>
            </Stack>

            {/* Game navigation controls */}
            {currentCharacter && realGames.length > 0 && (
                <Stack
                    className="noselect"
                    direction="row"
                    spacing={2}
                    sx={{
                        mb: 0.5, // Reduced bottom margin
                        mt: 0.5, // Add a small top margin (or remove for even less space)
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        px: 1, // Add horizontal padding to match action buttons
                        minHeight: 0, // Prevent extra height
                    }}
                >
                    <IconButton
                        onClick={goToPreviousGame}
                        disabled={simMode || currentGameIndex <= 0}
                        sx={{ color: 'white', p: 0.5 }} // Reduce padding
                    >
                        <ChevronLeft />
                    </IconButton>

                    <Typography sx={{ color: 'white', minWidth: '80px', textAlign: 'center', fontSize: '1.1rem' }}>
                        {currentGameIndex + 1} / {realGames.length}
                    </Typography>

                    <IconButton
                        onClick={goToNextGame}
                        disabled={simMode || currentGameIndex >= realGames.length - 1}
                        sx={{ color: 'white', p: 0.5 }} // Reduce padding
                    >
                        <ChevronRight />
                    </IconButton>
                </Stack>
            )}

            {/* Character title display */}
            {/* Removed character name under arrows */}

            {/* Error dialog */}
            <Dialog open={errorOpen} onClose={() => setErrorOpen(false)}>
                <DialogTitle>Error</DialogTitle>
                <DialogContent>
                    <DialogContentText>{errorMessage}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setErrorOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Undo confirmation dialog */}
            <ConfirmDialog
                open={undoConfirmOpen}
                title="Undo Last Capture"
                message="Are you sure you want to undo the last capture? This cannot be undone."
                onCancel={() => setUndoConfirmOpen(false)}
                onConfirm={confirmUndo}
                confirmText="Undo"
            />

            {/* Clear confirmation dialog */}
            <ConfirmDialog
                open={clearConfirmOpen}
                title={`Clear ${currentCharacter} Data`}
                message={`Are you sure you want to clear all history for ${currentCharacter || 'this character'}? This cannot be undone.`}
                onCancel={() => setClearConfirmOpen(false)}
                onConfirm={confirmClear}
                confirmText="Clear"
            />

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Stats & chart */}
            {currentEntry && (
                <>
                    <ProficiencyStats
                        stats={currentEntry.stats}
                        previousStats={previousEntry?.stats}
                    />
                    {metrics && (
                        <Box sx={{ mb: 2, color: 'white' }}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 2,
                                    mb: 1
                                }}
                            >
                                {/* Left column */}
                                <Box>
                                    <Typography>Prof. Per Hour: {metrics.ptsPerHour}</Typography>
                                    <Typography>Prof. Per Match: {metrics.ptsPerMatch}</Typography>
                                    <Typography sx={{ mt: 1 }}>
                                        Total Gained: {formatNumber(metrics.totalGained)}
                                    </Typography>
                                </Box>
                                {/* Right column */}
                                <Box sx={{ textAlign: 'right' }}>
                                    <Typography>Hours Left: {metrics.hoursLeft}</Typography>
                                    <Typography>Matches Left: {metrics.matchesLeft}</Typography>
                                </Box>
                            </Box>
                        </Box>
                    )}
                    {/* Only show chart if there are at least 2 entries in chartHistory */}
                    {chartHistory.length >= 2 && (
                        <Box sx={{ width: '100%', height: 300 }}>
                            <Line data={chartData} options={chartOptions} />
                        </Box>
                    )}
                </>
            )}

            {/* Show instructions if no captures yet */}
            {currentCharacter && history.length === 0 && (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        mb: 3,
                        minHeight: 180, // adjust as needed for vertical centering
                    }}
                >
                    <Typography variant="body1" align="center">
                        Click <b>Capture Proficiency</b> and select your Marvel Rivals game window to begin tracking.
                    </Typography>
                </Box>
            )}

            {/* No character selected message */}
            {!currentCharacter && (
                <Box sx={{ textAlign: 'center', color: 'white', mt: 4 }}>
                    <Typography variant="h6">
                        Please select a character to begin tracking
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
