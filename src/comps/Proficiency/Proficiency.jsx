// ProficiencyTracker.jsx
import React, {
    useReducer, useState, useRef, useMemo, useEffect
} from 'react';
import {
    Box, Button, Typography,
    Dialog, DialogTitle, DialogContent, DialogContentText,
    DialogActions, Stack, IconButton, FormControl, InputLabel,
    Select, MenuItem, Avatar
} from '@mui/material';
import {
    Chart as ChartJS, CategoryScale, LinearScale, TimeScale,
    PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import localforage from 'localforage';
import characters from '../../characters.json';
import {
    AddAPhoto, Delete, Undo, PlayArrow, Stop,
    ChevronLeft, ChevronRight, FileUpload, FileDownload
} from '@mui/icons-material';
import { alpha } from '@mui/material';
import CustomTooltip from '../Tooltip.jsx';

import {
    applyChallengeGains,
    FIELD_REWARDS,
    calculateProficiencyMetrics,
    getRealChallengeAverages,
    proficiencyReducer as reducer,
    initialState,
    initialCharacterData,
    captureProficiency
} from '../../utils.js';
import Chart from './Chart.jsx';
import RankProgression from './RankProgression.jsx';
import Challenges from './Challenges.jsx';
import Instructions from './Instructions.jsx';

// Register Chart.js components for chart rendering
ChartJS.register(
    CategoryScale, LinearScale, TimeScale,
    PointElement, LineElement, Title, Tooltip, Legend
);

const CHARACTERS = characters;

// Confirmation dialog for destructive actions (undo, clear)
const ConfirmDialog = React.memo(({
    open, title, message, onCancel, onConfirm, confirmText = 'Confirm'
}) => (
    <Dialog open={open} onClose={onCancel}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
            <DialogContentText>{message}</DialogContentText>
        </DialogContent>
        <DialogActions>
            <Button onClick={onCancel}>Cancel</Button>
            <Button color="error" onClick={onConfirm}>{confirmText}</Button>
        </DialogActions>
    </Dialog>
));

// Dialog for displaying messages (both success and error)
const MessageDialog = ({ open, message, isSuccess, onClose }) => (
    <Dialog open={open} onClose={onClose}>
        <DialogTitle>{isSuccess ? 'Success' : 'Error'}</DialogTitle>
        <DialogContent>
            <DialogContentText>
                {message}
            </DialogContentText>
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose}>Close</Button>
        </DialogActions>
    </Dialog>
);

export default function ProficiencyTracker() {
    // --- State and refs ---
    const [state, dispatch] = useReducer(reducer, initialState);
    const { simMode, simCount, currentCharacter, characters } = state;
    const [loading, setLoading] = useState(false); // For capture button
    const [messageOpen, setMessageOpen] = useState(false); // Message dialog visibility
    const [message, setMessage] = useState(''); // Message dialog content
    const [isSuccess, setIsSuccess] = useState(false); // Whether message is success or error
    const canvasRef = useRef(null); // Ref for hidden canvas
    const [undoOpen, setUndoOpen] = useState(false); // Undo confirmation dialog
    const [clearOpen, setClearOpen] = useState(false); // Clear confirmation dialog
    const [currentIdx, setCurrentIdx] = useState(-1); // Index of current real game
    // --- Import/Export handlers ---
    const fileInputRef = useRef(null);
    // Export proficiency data as JSON (real data only, no sim)
    const handleExport = () => {
        // Deep copy and filter out simulated entries from all characters
        const filteredCharacters = Object.fromEntries(
            Object.entries(characters).map(([char, data]) => [
                char,
                {
                    ...data,
                    history: Array.isArray(data.history)
                        ? data.history.filter(e => !e.isSimulated)
                        : [],
                    backupHistory: [] // Don't export backup/sim data
                }
            ])
        );
        const data = { characters: filteredCharacters, currentCharacter };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rivalytics-backup.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    };
    // Import proficiency data from JSON
    const handleImport = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const data = JSON.parse(evt.target.result);
                if (data.characters && typeof data.characters === 'object') {
                    dispatch({ type: 'LOAD', payload: data });
                    setMessage('Import successful!');
                    setIsSuccess(true);
                    setMessageOpen(true);
                } else {
                    throw new Error('Invalid data format');
                }
            } catch (err) {
                setMessage('Import failed: ' + (err.message || 'Invalid file'));
                setIsSuccess(false);
                setMessageOpen(true);
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be re-imported if needed
        e.target.value = '';
    };

    // --- Memoized derived data: history, realGames, latest entry ---
    const {
        history,
        realGames,
        latest
    } = useMemo(() => {
        // Get current character's data or fallback to initial
        const charData = (currentCharacter && characters[currentCharacter]) || initialCharacterData;
        const history = charData.history || [];
        // Only real (non-simulated) games
        const realGames = history.filter(e => !e.isSimulated);
        // Most recent entry (real or simulated)
        const latest = history[history.length - 1] || null;
        return { charData, history, realGames, latest };
    }, [currentCharacter, characters]);

    // --- Effect: When sim mode is enabled, always show the latest entry ---
    useEffect(() => {
        if (simMode) setCurrentIdx(realGames.length - 1);
    }, [simMode, realGames.length]);

    // --- Effect: On mount, load saved data from localforage and set currentIdx ---
    useEffect(() => {
        let mounted = true;
        localforage.getItem('pt-characters').then(saved => {
            if (!mounted) return;
            if (saved?.characters) {
                dispatch({ type: 'LOAD', payload: saved });
                // Set currentIdx to last real game for loaded character
                const count = saved.characters[saved.currentCharacter]?.history?.filter(e => !e.isSimulated).length;
                setCurrentIdx((count ?? 1) - 1);
            }
        });
        return () => { mounted = false; };
    }, []);

    // --- Effect: Persist character data to localforage on change ---
    useEffect(() => {
        localforage.setItem('pt-characters', {
            characters, currentCharacter
        });
    }, [characters, currentCharacter]);

    // --- Effect: Keep currentIdx in sync with simMode and realGames ---
    useEffect(() => {
        if (simMode) {
            // In sim mode, always point to the latest entry
            setCurrentIdx(realGames.length - 1);
        } else if (currentIdx >= realGames.length) {
            // If currentIdx is out of bounds, move to last real game
            setCurrentIdx(realGames.length - 1);
        } else if (!simMode && currentCharacter) {
            // If no real games, set to -1; else, ensure currentIdx is valid
            if (realGames.length > 0 && (currentIdx === -1 || currentIdx > realGames.length - 1)) {
                setCurrentIdx(realGames.length - 1);
            } else if (realGames.length === 0) {
                setCurrentIdx(-1);
            }
        }
    }, [simMode, realGames.length, currentCharacter]);

    // --- Effect: When currentCharacter changes, set currentIdx to latest real game ---
    useEffect(() => {
        if (!currentCharacter) return;
        const charData = characters[currentCharacter] || initialCharacterData;
        const realGames = (charData.history || []).filter(e => !e.isSimulated);
        setCurrentIdx(realGames.length > 0 ? realGames.length - 1 : -1);
    }, [currentCharacter]);

    // --- Navigation handlers for previous/next real game ---
    const goPrev = () => {
        if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
    };
    const goNext = () => {
        if (currentIdx < realGames.length - 1)
            setCurrentIdx(currentIdx + 1);
    };

    // --- Handler: Capture proficiency from canvas and add to history ---
    const capture = async () => {
        setMessageOpen(false);
        setLoading(true);
        try {
            const stats = await captureProficiency(canvasRef);
            dispatch({ type: 'CAPTURE', payload: { stats, time: Date.now() } });
            setCurrentIdx(realGames.length);
        } catch (err) {
            setMessage(err.message || 'Error');
            setIsSuccess(false);
            setMessageOpen(true);
        } finally {
            setLoading(false);
        }
    };

    // --- Handler: Simulate a game using average real game stats ---
    const simulate = () => {
        const realStats = getRealChallengeAverages(history);
        if (!realStats) {
            setMessage('Not enough data');
            setIsSuccess(false);
            setMessageOpen(true);
            return;
        }
        const last = history.at(-1);
        if (last.stats.status === 'Lord') return; // Already maxed
        if (!simMode) dispatch({ type: 'BACKUP' }); // Backup before sim
        const snap = { ...last.stats };
        // Apply random gain based on real averages
        const gains = realStats.avgGains.map(avg =>
            Math.max(1, Math.round(avg * (0.8 + Math.random() * 0.4)))
        );
        applyChallengeGains(snap, gains);
        // Simulate time progression
        const min = Math.round(realStats.avgMinutes * (0.8 + Math.random() * 0.4));
        const next = last.time + min * 60000;
        dispatch({
            type: 'SIM_STEP',
            payload: { stats: snap, time: next, isSimulated: true }
        });
    };

    // --- Handler: Stop simulation and restore real data ---
    const stopSim = () => dispatch({ type: 'RESTORE' });
    // --- Handler: Confirm undo last entry ---
    const confirmUndo = () => { dispatch({ type: 'UNDO' }); setUndoOpen(false); };
    // --- Handler: Confirm clear all data for character ---
    const confirmClear = () => { dispatch({ type: 'CLEAR' }); setClearOpen(false); };

    // --- Memoized: Get current entry, chart history, and previous entry ---
    const { currentEntry, chartHistory, prevEntry } = useMemo(() => {
        let currentEntry;
        if (simMode) {
            // In sim mode, always use the latest entry
            currentEntry = history[history.length - 1] || null;
        } else {
            // In real mode, use the selected real game
            currentEntry = (currentIdx >= 0 && realGames.length)
                ? realGames[currentIdx]
                : null;
        }
        // Chart history: all for sim, or up to current for real
        let chartHistory = [];
        if (simMode) {
            chartHistory = history;
        } else if (currentEntry) {
            const idx = history.findIndex(e => e.time === currentEntry.time);
            chartHistory = idx >= 0 ? history.slice(0, idx + 1) : [];
        }
        // Previous entry for comparison
        let prevEntry = null;
        if (currentEntry) {
            if (simMode) {
                const idx = history.findIndex(e => e.time === currentEntry.time);
                prevEntry = idx > 0 ? history[idx - 1] : null;
            } else {
                prevEntry = currentIdx > 0 ? realGames[currentIdx - 1] : null;
            }
        }
        return { currentEntry, chartHistory, prevEntry };
    }, [simMode, history, currentIdx, realGames]);

    // --- Memoized: Calculate proficiency metrics for current view ---
    const metrics = useMemo(() =>
        calculateProficiencyMetrics({
            history, currentEntry, currentIdx, simMode, FIELD_REWARDS
        }),
        [currentEntry, currentIdx, history, simMode]
    );

    // --- Effect: Auto-close message dialog after 5 seconds ---
    useEffect(() => {
        if (messageOpen) {
            const t = setTimeout(() => setMessageOpen(false), 5000);
            return () => clearTimeout(t);
        }
    }, [messageOpen]);

    // --- Render: Character select dropdown item ---
    function renderChar(sel) {
        const c = CHARACTERS.find(ch => ch.name === sel);
        return c ? (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar
                    src={c.icon}
                    alt={c.name}
                    sx={{ width: 24, height: 24, mr: 1 }}
                />
                {c.name}
            </Box>
        ) : '';
    }

    // --- Handler: When user selects a new character ---
    function handleCharacterChange(e) {
        const v = e.target.value;
        dispatch({ type: 'INIT_CHARACTER', payload: v });
        dispatch({ type: 'SET_CHARACTER', payload: v });
    }

    // --- Main render ---
    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
            {/* Character selection and clear button */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, mt: 1 }}>
                <FormControl fullWidth>
                    <InputLabel
                        id="character-select-label"
                        sx={{ color: 'white' }}
                    >
                        Character
                    </InputLabel>
                    <Select
                        labelId="character-select-label"
                        id="character-select"
                        value={currentCharacter || ''}
                        label="Character"
                        onChange={handleCharacterChange}
                        MenuProps={{
                            PaperProps: { style: { maxHeight: 300 } }
                        }}
                        renderValue={renderChar}
                        sx={{
                            color: 'white',
                            '.MuiOutlinedInput-notchedOutline': {
                                borderColor: theme => theme.palette.primary.main
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: theme => theme.palette.primary.dark
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: theme => theme.palette.primary.main
                            },
                            '.MuiSvgIcon-root': { color: 'white' }
                        }}
                    >
                        {CHARACTERS.map(c => (
                            <MenuItem key={c.name} value={c.name}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Avatar
                                        src={c.icon}
                                        alt={c.name}
                                        sx={{ width: 24, height: 24, mr: 1 }}
                                    />
                                    {c.name}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {/* Clear button with CustomTooltip */}
                <CustomTooltip
                    content="Clears all the proficiency data for currently selected character"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="outlined"
                        onClick={() => setClearOpen(true)}
                        disabled={!currentCharacter || !history.length}
                        startIcon={<Delete />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 100,
                            maxWidth: 120,
                            px: 1.5, py: 1,
                            ml: 2,
                            height: '56px',
                            alignSelf: 'stretch',
                            borderColor: theme => theme.palette.error.light,
                            color: theme => theme.palette.error.light,
                            '&:hover': {
                                borderColor: theme => theme.palette.error.main,
                                backgroundColor: theme =>
                                    alpha(theme.palette.error.main, 0.08)
                            }
                        }}
                    >
                        Clear
                    </Button>
                </CustomTooltip>

                {/* Export button with CustomTooltip */}
                <CustomTooltip
                    content="Downloads a copy of all proficiency data, useful for importing into other browsers or computers"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleExport}
                        startIcon={<FileDownload />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 100,
                            maxWidth: 120,
                            px: 1.5, py: 1,
                            ml: 2,
                            height: '56px',
                            alignSelf: 'stretch'
                        }}
                    >
                        Export
                    </Button>
                </CustomTooltip>
                {/* Import button with CustomTooltip */}
                <CustomTooltip
                    content="Imports a Rivalytics backup file, exported from another browser or PC"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="outlined"
                        color="primary"
                        component="label"
                        startIcon={<FileUpload />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 100,
                            maxWidth: 120,
                            px: 1.5, py: 1,
                            ml: 2,
                            height: '56px',
                            alignSelf: 'stretch'
                        }}
                    >
                        Import
                        <input
                            type="file"
                            accept="application/json"
                            hidden
                            ref={fileInputRef}
                            onChange={handleImport}
                        />
                    </Button>
                </CustomTooltip>
            </Box>

            {/* Main action buttons */}
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
                    px: 1
                }}
            >
                {/* Capture Proficiency button with CustomTooltip */}
                <CustomTooltip
                    content="Captures a screenshot of the game. be sure to share the entire screen Rivals is running on"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={capture}
                        disabled={
                            loading || simMode ||
                            !currentCharacter ||
                            currentIdx !== realGames.length - 1
                        }
                        startIcon={<AddAPhoto />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 170,
                            px: 2, py: 1.2
                        }}
                    >
                        {loading ? 'Capturing…' : 'Capture Proficiency'}
                    </Button>
                </CustomTooltip>
                {/* Undo Last button with CustomTooltip */}
                <CustomTooltip
                    content="Deletes only the last capture Useful if you took one by mistake"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => setUndoOpen(true)}
                        disabled={!currentCharacter || !history.length || simMode}
                        startIcon={<Undo />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 170,
                            px: 2, py: 1.2
                        }}
                    >
                        Undo Last
                    </Button>
                </CustomTooltip>
                {/* Simulate Game button with CustomTooltip */}
                <CustomTooltip
                    content="Uses your average stats to simulate a game. Continously clicking simulates more games"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={simulate}
                        disabled={
                            !currentCharacter ||
                            !history.length ||
                            latest?.stats.status === 'Lord' ||
                            (!simMode && currentIdx !== realGames.length - 1)
                        }
                        startIcon={<PlayArrow />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 170,
                            px: 2, py: 1.2
                        }}
                    >
                        Simulate Game{simMode ? ` (${simCount})` : ''}
                    </Button>
                </CustomTooltip>
                {/* Stop Simulation button with CustomTooltip */}
                <CustomTooltip
                    content="Ends simulation mode, only showing you real stats you captured yourself"
                    delay={[1000, 0]}
                    placement="top"
                >
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={stopSim}
                        disabled={!simMode}
                        startIcon={<Stop />}
                        sx={{
                            textTransform: 'none',
                            minWidth: 170,
                            px: 2, py: 1.2
                        }}
                    >
                        Stop Simulation
                    </Button>
                </CustomTooltip>
            </Stack>

            {/* Navigation for real games (not in sim mode) */}
            {currentCharacter && realGames.length > 0 && (
                <Stack
                    className="noselect"
                    direction="row"
                    spacing={2}
                    sx={{
                        mb: 0.5, mt: 0.5,
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        px: 1
                    }}
                >
                    {/* Left arrow navigation with CustomTooltip */}
                    <CustomTooltip
                        content="Navigates back in your capture history"
                        delay={[1000, 0]}
                        placement="top"
                    >
                        <IconButton
                            onClick={goPrev}
                            disabled={simMode || currentIdx <= 0}
                            sx={{ color: 'white', p: 0.5 }}
                        >
                            <ChevronLeft />
                        </IconButton>
                    </CustomTooltip>
                    <Typography sx={{
                        color: 'white',
                        minWidth: '80px',
                        textAlign: 'center',
                        fontSize: '1.1rem'
                    }}>
                        {currentIdx + 1} / {realGames.length}
                    </Typography>
                    {/* Right arrow navigation with CustomTooltip */}
                    <CustomTooltip
                        content="Navigates forward in your capture history"
                        delay={[1000, 0]}
                        placement="top"
                    >
                        <IconButton
                            onClick={goNext}
                            disabled={simMode || currentIdx >= realGames.length - 1}
                            sx={{ color: 'white', p: 0.5 }}
                        >
                            <ChevronRight />
                        </IconButton>
                    </CustomTooltip>
                </Stack>
            )}

            {/* Error dialog for user feedback */}
            <MessageDialog
                open={messageOpen}
                message={message}
                isSuccess={isSuccess}
                onClose={() => setMessageOpen(false)}
            />

            {/* Undo confirmation dialog */}
            <ConfirmDialog
                open={undoOpen}
                title="Undo Last Capture"
                message="Are you sure? This cannot be undone."
                onCancel={() => setUndoOpen(false)}
                onConfirm={confirmUndo}
                confirmText="Undo"
            />

            {/* Clear confirmation dialog */}
            <ConfirmDialog
                open={clearOpen}
                title={`Clear ${currentCharacter} Data`}
                message={`All history will be lost. Confirm?`}
                onCancel={() => setClearOpen(false)}
                onConfirm={confirmClear}
                confirmText="Clear"
            />

            {/* Hidden canvas for proficiency capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Main content: challenges, progression, chart */}
            {currentEntry && (
                <>
                    <Challenges
                        stats={currentEntry.stats}
                        previousStats={prevEntry?.stats}
                        metrics={metrics}
                    />
                    {metrics?.averageGains && (
                        <RankProgression
                            currentStats={currentEntry.stats}
                            averageGains={metrics.averageGains}
                            profPerMatch={metrics.ptsPerMatch}
                            currentRemainingMatches={metrics.exactMatchesLeft}
                            currentRemainingHours={metrics.exactHoursLeft}
                        />
                    )}
                    <Chart chartHistory={chartHistory} />
                </>
            )}

            {/* Show instructions if no data for selected character */}
            {currentCharacter && !history.length && (
                <Instructions />
            )}

            {/* Prompt to select a character if none selected */}
            {!currentCharacter && (
                <Box sx={{ textAlign: 'center', mt: 4 }}>
                    <Typography variant="h6">
                        Please select a character to begin tracking
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
