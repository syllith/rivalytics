// ProficiencyTracker.jsx
import React, {
  useReducer, useState, useRef, useCallback, useMemo, useEffect
} from 'react';
import {
  Box, Button, LinearProgress, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Stack, IconButton, FormControl, InputLabel,
  Select, MenuItem, Avatar
} from '@mui/material';
import {
  Chart as ChartJS, CategoryScale, LinearScale, TimeScale,
  PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import localforage from 'localforage';
import characters from '../../characters.json';
import {
  AddAPhoto, Delete, Undo, PlayArrow, Stop,
  ChevronLeft, ChevronRight
} from '@mui/icons-material';

import {
  formatNumber,
  getMatchesLeftColor,
  getProgressColor,
  getRankCap,
  getNextRank,
  computeWrappedDelta,
  applyChallengeGains,
  cropImage,
  parseOcrResult,
  calculatePlaytimeDuration,
  getFieldRewardsForRank,
  computeAverageGains,
  RANKS,
  FIELD_REWARDS
} from '../../utils.js';

ChartJS.register(
  CategoryScale, LinearScale, TimeScale,
  PointElement, LineElement, Title, Tooltip, Legend
);

const CHARACTERS = characters;
const initialCharacterData = { history: [], backupHistory: [] };

const initialState = {
  characters: {},
  currentCharacter: null,
  simMode: false,
  simCount: 0
};

function reducer(state, action) {
  const cc = state.currentCharacter;
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        characters: action.payload.characters || {},
        currentCharacter: action.payload.currentCharacter
      };
    case 'INIT_CHARACTER':
      return {
        ...state,
        characters: {
          ...state.characters,
          [action.payload]:
            state.characters[action.payload] || { ...initialCharacterData }
        }
      };
    case 'SET_CHARACTER':
      return { ...state, currentCharacter: action.payload };
    case 'CAPTURE':
      if (!cc) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [cc]: {
            ...state.characters[cc],
            history: [...state.characters[cc].history, action.payload]
          }
        }
      };
    case 'BACKUP':
      if (!cc) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [cc]: {
            ...state.characters[cc],
            backupHistory: [...state.characters[cc].history]
          }
        },
        simMode: true,
        simCount: 0
      };
    case 'SIM_STEP':
      if (!cc) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [cc]: {
            ...state.characters[cc],
            history: [
              ...state.characters[cc].history,
              action.payload
            ]
          }
        },
        simCount: state.simCount + 1
      };
    case 'RESTORE':
      if (!cc) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [cc]: {
            ...state.characters[cc],
            history: [...state.characters[cc].backupHistory],
            backupHistory: []
          }
        },
        simMode: false,
        simCount: 0
      };
    case 'UNDO':
      if (!cc) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [cc]: {
            ...state.characters[cc],
            history: state.characters[cc].history.slice(0, -1)
          }
        }
      };
    case 'CLEAR':
      if (!cc) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [cc]: { ...initialCharacterData }
        }
      };
    default:
      return state;
  }
}

const FieldRow = React.memo(({
  challengeName, currentValue, maxValue, gain, matchesToComplete
}) => {
  const pct = (currentValue / maxValue) * 100;
  const color = getProgressColor(pct);

  return (
    <TableRow sx={{ backgroundColor: 'rgba(255,255,255,0.07)',
      '&:last-child td, &:last-child th': { border: 0 } }}>
      <TableCell sx={{ color: '#e0e0e0' }}>{challengeName}</TableCell>
      <TableCell sx={{ color: '#e0e0e0' }}>
        {formatNumber(currentValue)}
      </TableCell>
      <TableCell sx={{ color: '#e0e0e0' }}>
        {formatNumber(maxValue)}
      </TableCell>
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
});

const ProficiencyStats = React.memo(({ stats, previousStats }) => {
  const overallPct = (stats.proficiencyCurrent / stats.proficiencyMax) * 100;
  const gains = [];
  const toComplete = [];

  if (previousStats) {
    stats.fieldNames.forEach((_, i) => {
      const cur = stats[`field${i+1}Current`];
      const prev = previousStats[`field${i+1}Current`];
      const pmax = previousStats[`field${i+1}Max`];
      const g = computeWrappedDelta(cur, prev, pmax);
      gains.push(g);
      toComplete.push(g > 0
        ? (stats[`field${i+1}Max`] - cur) / g
        : Infinity);
    });
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ flexGrow: 1, mr: 1 }}>
          <LinearProgress variant="determinate" value={overallPct} />
        </Box>
        <Typography sx={{ color: 'white', minWidth: 45, textAlign: 'right' }}>
          {Math.round(overallPct)}%
        </Typography>
      </Box>

      <Typography sx={{ mb: 2, color: 'white' }}>
        Rank: {stats.status} | Proficiency:{' '}
        {formatNumber(stats.proficiencyCurrent)} /{' '}
        {formatNumber(stats.proficiencyMax)}
      </Typography>

      <TableContainer component={Paper} sx={{
        mb: 2, bgcolor: 'transparent', boxShadow: 'none'
      }}>
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
                currentValue={stats[`field${idx+1}Current`]}
                maxValue={stats[`field${idx+1}Max`]}
                gain={previousStats ? gains[idx] : 0}
                matchesToComplete={previousStats ? toComplete[idx] : '–'}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
});

const RankProgressionSheet = React.memo(({
  currentStats, averageGains, profPerMatch,
  currentRemainingMatches, currentRemainingHours
}) => {
  const progression = useMemo(() => {
    if (!averageGains?.length || !profPerMatch) return [];
    const matches = [];
    let cum = 0;
    const perMatch = parseFloat(profPerMatch);
    if (perMatch <= 0) return [];

    let idx = RANKS.order.indexOf(currentStats.status) + 1;
    const typicalMins = 12;

    for (; idx < RANKS.order.length; idx++) {
      const rank = RANKS.order[idx];
      const cap = getRankCap(rank);
      let need, m;
      if (idx === RANKS.order.indexOf(currentStats.status) + 1) {
        need = currentStats.proficiencyMax - currentStats.proficiencyCurrent;
        m = currentRemainingMatches;
      } else {
        need = cap;
        m = need / perMatch;
      }
      cum += m;
      matches.push({
        rank,
        profNeeded: Math.round(need),
        cumulativeMatches: Math.ceil(cum),
        cumulativeHours: ((cum * typicalMins) / 60).toFixed(1)
      });
      if (rank === 'Lord') break;
    }
    return matches;
  }, [
    averageGains, currentStats, profPerMatch,
    currentRemainingMatches, currentRemainingHours
  ]);

  if (!progression.length) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{
        color: 'white', mb: 1, textAlign: 'center'
      }}>
        Rank Progression
      </Typography>
      <TableContainer component={Paper} sx={{
        bgcolor: 'transparent', boxShadow: 'none'
      }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#e0e0e0' }}>Rank</TableCell>
              <TableCell sx={{ color: '#e0e0e0' }}>Prof. Needed</TableCell>
              <TableCell sx={{ color: '#e0e0e0' }}>Total Matches</TableCell>
              <TableCell sx={{ color: '#e0e0e0' }}>Total Hours</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {progression.map(r => (
              <TableRow key={r.rank} sx={{
                backgroundColor: 'rgba(255,255,255,0.07)',
                '&:last-child td, &:last-child th': { border: 0 }
              }}>
                <TableCell>{r.rank}</TableCell>
                <TableCell>{formatNumber(r.profNeeded)}</TableCell>
                <TableCell>~{r.cumulativeMatches}</TableCell>
                <TableCell>~{r.cumulativeHours}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
});

export default function ProficiencyTracker() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { simMode, simCount, currentCharacter, characters } = state;
  const [loading, setLoading] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const canvasRef = useRef(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);

  const charData = useMemo(() =>
    (currentCharacter && characters[currentCharacter]) || initialCharacterData,
    [currentCharacter, characters]
  );
  const history = useMemo(() => charData.history || [], [charData]);
  const realGames = useMemo(
    () => history.filter(e => !e.isSimulated),
    [history]
  );

  useEffect(() => {
    setCurrentIdx(realGames.length - 1);
  }, [realGames.length]);

  useEffect(() => {
    if (simMode) setCurrentIdx(realGames.length - 1);
  }, [simMode, realGames.length]);

  useEffect(() => {
    localforage.getItem('pt-characters').then(saved => {
      if (saved?.characters) {
        dispatch({ type: 'LOAD', payload: saved });
        const count = saved.characters[saved.currentCharacter]?.history
          .filter(e => !e.isSimulated).length;
        setCurrentIdx(count - 1);
      }
    });
  }, []);

  useEffect(() => {
    localforage.setItem('pt-characters', {
      characters, currentCharacter
    });
    if (currentIdx >= realGames.length) {
      setCurrentIdx(realGames.length - 1);
    }
  }, [characters, currentCharacter, realGames.length, currentIdx]);

  const handleCharChange = e => {
    const v = e.target.value;
    dispatch({ type: 'INIT_CHARACTER', payload: v });
    dispatch({ type: 'SET_CHARACTER', payload: v });
  };

  const goPrev = useCallback(() => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  }, [currentIdx]);
  const goNext = useCallback(() => {
    if (currentIdx < realGames.length - 1)
      setCurrentIdx(currentIdx + 1);
  }, [currentIdx, realGames.length]);

  const capture = useCallback(async () => {
    if (!currentCharacter) {
      setErrorMessage('Select a character');
      setErrorOpen(true);
      return;
    }
    setErrorOpen(false);
    setLoading(true);
    let stream, video;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      video = document.createElement('video');
      video.style.display = 'none';
      document.body.appendChild(video);
      video.srcObject = stream;
      await video.play();
      await new Promise(requestAnimationFrame);

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const cropped = cropImage(canvas, canvas.width, canvas.height);
      const blob = await new Promise(res =>
        cropped.toBlob(res, 'image/png')
      );
      const form = new FormData();
      form.append('file', blob, `ss_${Date.now()}.png`);
      const resp = await fetch('/api/ocr', {
        method: 'POST', cache: 'no-store', body: form
      });
      if (!resp.ok) throw new Error(`OCR ${resp.status}`);
      const { result } = await resp.json();
      const stats = parseOcrResult(result);
      dispatch({ type: 'CAPTURE', payload: { stats, time: Date.now() } });
      setCurrentIdx(realGames.length);
    } catch (err) {
      setErrorMessage(err.message || 'Error');
      setErrorOpen(true);
    } finally {
      video?.pause();
      video?.remove();
      stream?.getTracks().forEach(t => t.stop());
      setLoading(false);
    }
  }, [currentCharacter, realGames.length]);

  const simulate = useCallback(() => {
    if (!currentCharacter) {
      setErrorMessage('Select a character');
      setErrorOpen(true);
      return;
    }
    const realEntries = history.filter(h => !h.isSimulated);
    if (realEntries.length < 2) {
      setErrorMessage('Not enough data');
      setErrorOpen(true);
      return;
    }
    const last = history[history.length - 1];
    if (last.stats.status === 'Lord') return;
    if (!simMode) dispatch({ type: 'BACKUP' });

    const snap = { ...last.stats };
    const gains = realEntries.slice(1).map((_, i) => {
      const key = `field${i+1}Current`;
      const mkey = `field${i+1}Max`;
      let tot = 0;
      for (let j = 1; j < realEntries.length; j++) {
        tot += computeWrappedDelta(
          realEntries[j].stats[key],
          realEntries[j-1].stats[key],
          realEntries[j-1].stats[mkey]
        );
      }
      const avg = tot / (realEntries.length - 1);
      return Math.max(1, Math.round(avg * (0.8 + Math.random() * 0.4)));
    });
    applyChallengeGains(snap, gains);

    let play = 0;
    for (let j = 1; j < realEntries.length; j++) {
      play += computeWrappedDelta(
        realEntries[j].stats.field1Current,
        realEntries[j-1].stats.field1Current,
        realEntries[j-1].stats.field1Max
      );
    }
    const avg = play / (realEntries.length - 1);
    const min = Math.round(avg * (0.8 + Math.random() * 0.4));
    const next = last.time + min * 60000;

    dispatch({
      type: 'SIM_STEP',
      payload: { stats: snap, time: next, isSimulated: true }
    });
  }, [currentCharacter, history, simMode]);

  const stopSim = useCallback(() => {
    dispatch({ type: 'RESTORE' });
  }, []);

  const confirmUndo = useCallback(() => {
    dispatch({ type: 'UNDO' });
    setUndoOpen(false);
  }, []);

  const confirmClear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    setClearOpen(false);
  }, []);

  const latest = useMemo(
    () => history[history.length - 1] || null,
    [history]
  );

  const currentEntry = useMemo(() => {
    if (simMode) return history[history.length - 1] || null;
    return (currentIdx >= 0 && realGames.length)
      ? realGames[currentIdx]
      : null;
  }, [simMode, history, realGames, currentIdx]);

  const chartHistory = useMemo(() => {
    if (simMode) return history;
    if (!currentEntry) return [];
    const idx = history.findIndex(e => e.time === currentEntry.time);
    return idx >= 0 ? history.slice(0, idx + 1) : [];
  }, [simMode, history, currentEntry]);

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

  const chartOptions = useMemo(() => {
    const vals = chartHistory.map(e => e.stats.proficiencyCurrent);
    const yMin = vals.length ? Math.min(...vals) : 0;
    const yMax = vals.length ? Math.max(...vals) : 0;
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: 'minute', tooltipFormat: 'h:mm a',
            displayFormats: { minute: 'h:mm a', hour: 'h:mm a' }},
          ticks: {
            color: 'white',
            callback: v => new Date(v)
              .toLocaleTimeString([], {
                hour: 'numeric', minute: '2-digit', hour12: true
              })
          },
          grid: { color: 'rgba(255,255,255,0.2)' }
        },
        y: {
          beginAtZero: false,
          suggestedMin: Math.floor(yMin * 0.9),
          suggestedMax: Math.ceil(yMax * 1.1),
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

  const metrics = useMemo(() => {
    if (!currentEntry) return null;

    const realCalc = simMode
      ? history.filter(h => !h.isSimulated)
      : realGames.slice(0, currentIdx + 1);

    if (realCalc.length < 2) return null;
    const first = realCalc[0].stats;
    const last = realCalc[realCalc.length - 1].stats;

    const realOnly = realCalc.filter(g => !g.isSimulated);
    let play = 0;
    for (let j = 1; j < realOnly.length; j++) {
      play += computeWrappedDelta(
        realOnly[j].stats.field1Current,
        realOnly[j-1].stats.field1Current,
        realOnly[j-1].stats.field1Max
      );
    }
    const realCount = realOnly.length - 1;
    const avgMins = realCount > 0 ? play / realCount : 12;
    const usage = Math.min(1, avgMins / 12);

    const avgGains = [];
    let totalProjected = 0;
    for (let i = 0; i < 4; i++) {
      let tot = 0;
      for (let j = 1; j < realOnly.length; j++) {
        const p = computeWrappedDelta(
          realOnly[j].stats[`field${i+1}Current`],
          realOnly[j-1].stats[`field${i+1}Current`],
          realOnly[j-1].stats[`field${i+1}Max`]
        );
        tot += p;
      }
      const avgCapture = realCount > 0 ? tot / realCount : 0;
      avgGains.push(avgCapture);
      const avgFull = usage > 0 ? avgCapture / usage : 0;
      const fraction = last[`field${i+1}Max`]
        ? avgFull / last[`field${i+1}Max`]
        : 0;
      totalProjected += fraction * FIELD_REWARDS[i];
    }

    let totalProf = 0;
    const allCalc = simMode ? history : realCalc;
    for (let j = 1; j < allCalc.length; j++) {
      const prev = allCalc[j-1].stats;
      const curr = allCalc[j].stats;
      totalProf += curr.status !== prev.status
        ? (prev.proficiencyMax - prev.proficiencyCurrent) +
          curr.proficiencyCurrent
        : curr.proficiencyCurrent - prev.proficiencyCurrent;
    }

    let effective = totalProf;
    for (let i = 0; i < 4; i++) {
      const cur = last[`field${i+1}Current`];
      const max = last[`field${i+1}Max`];
      const reward = FIELD_REWARDS[i];
      effective += (cur / max) * reward;
    }

    const effPerMatch = effective / (allCalc.length - 1);
    let remaining = last.proficiencyMax - last.proficiencyCurrent;
    for (let i = 0; i < 4; i++) {
      const cur = last[`field${i+1}Current`];
      const max = last[`field${i+1}Max`];
      const reward = FIELD_REWARDS[i];
      remaining -= (cur / max) * reward;
    }

    const estMatches = effPerMatch > 0
      ? Math.max(0, remaining / effPerMatch)
      : Infinity;
    const estMins = isFinite(estMatches)
      ? estMatches * 12
      : Infinity;

    return {
      totalGained: totalProf,
      ptsPerMatch: totalProjected.toFixed(1),
      avgMatchDurationMinutes: avgMins.toFixed(1),
      matchesLeft: isFinite(estMatches) ? Math.ceil(estMatches) : '–',
      hoursLeft: isFinite(estMins)
        ? (estMins / 60).toFixed(1)
        : '–',
      averageGains: avgGains,
      exactMatchesLeft: isFinite(estMatches) ? estMatches : 0,
      exactHoursLeft: isFinite(estMins) ? estMins / 60 : 0
    };
  }, [currentEntry, realGames, currentIdx, history, simMode]);

  useEffect(() => {
    if (errorOpen) {
      const t = setTimeout(() => setErrorOpen(false), 5000);
      return () => clearTimeout(t);
    }
  }, [errorOpen]);

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

  const renderChar = useCallback(sel => {
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
  }, []);

  const prevEntry = useMemo(() => {
    if (!currentEntry) return null;
    if (simMode) {
      const idx = history.findIndex(e => e.time === currentEntry.time);
      return idx > 0 ? history[idx - 1] : null;
    }
    return currentIdx > 0 ? realGames[currentIdx - 1] : null;
  }, [currentEntry, history, realGames, currentIdx, simMode]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
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
            onChange={handleCharChange}
            sx={{
              color: 'white',
              '.MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.5)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'white'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'white'
              },
              '.MuiSvgIcon-root': { color: 'white' }
            }}
            MenuProps={{
              PaperProps: { style: { maxHeight: 300 } }
            }}
            renderValue={renderChar}
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
        <Button
          variant="outlined"
          color="error"
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
            alignSelf: 'stretch'
          }}
        >
          Clear
        </Button>
      </Box>

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
      </Stack>

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
          <IconButton
            onClick={goPrev}
            disabled={simMode || currentIdx <= 0}
            sx={{ color: 'white', p: 0.5 }}
          >
            <ChevronLeft />
          </IconButton>
          <Typography sx={{
            color: 'white',
            minWidth: '80px',
            textAlign: 'center',
            fontSize: '1.1rem'
          }}>
            {currentIdx + 1} / {realGames.length}
          </Typography>
          <IconButton
            onClick={goNext}
            disabled={simMode || currentIdx >= realGames.length - 1}
            sx={{ color: 'white', p: 0.5 }}
          >
            <ChevronRight />
          </IconButton>
        </Stack>
      )}

      <Dialog open={errorOpen} onClose={() => setErrorOpen(false)}>
        <DialogTitle>Error</DialogTitle>
        <DialogContent>
          <DialogContentText>{errorMessage}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={undoOpen}
        title="Undo Last Capture"
        message="Are you sure? This cannot be undone."
        onCancel={() => setUndoOpen(false)}
        onConfirm={confirmUndo}
        confirmText="Undo"
      />

      <ConfirmDialog
        open={clearOpen}
        title={`Clear ${currentCharacter} Data`}
        message={`All history will be lost. Confirm?`}
        onCancel={() => setClearOpen(false)}
        onConfirm={confirmClear}
        confirmText="Clear"
      />

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {currentEntry && (
        <>
          <ProficiencyStats
            stats={currentEntry.stats}
            previousStats={prevEntry?.stats}
          />
          {metrics && (
            <Box sx={{ mb: 2, color: 'white' }}>
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                mb: 1,
                gap: 2
              }}>
                <Box>
                  <Typography>
                    Prof. Per Match: ~{metrics.ptsPerMatch}
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
            </Box>
          )}

          {metrics?.averageGains && (
            <RankProgressionSheet
              currentStats={currentEntry.stats}
              averageGains={metrics.averageGains}
              profPerMatch={metrics.ptsPerMatch}
              currentRemainingMatches={metrics.exactMatchesLeft}
              currentRemainingHours={metrics.exactHoursLeft}
            />
          )}

          {chartHistory.length >= 2 && (
            <Box sx={{ width: '100%', height: 300 }}>
              <Line data={chartData} options={chartOptions} />
            </Box>
          )}
        </>
      )}

      {currentCharacter && !history.length && (
        <Box sx={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(30,32,40,0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 3, color: 'white', mb: 3,
          minHeight: 180, maxWidth: 500, mx: 'auto',
          px: 3, py: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.25)'
        }}>
          <Typography variant="h6" align="center" sx={{ mb: 1, fontWeight: 'bold' }}>
            How to Track Proficiency
          </Typography>
          <Typography variant="body2" align="center" sx={{ mb: 2, color: '#b0b8c1' }}>
            After each game:
          </Typography>
          <Box component="ol" sx={{
            pl: 3, textAlign: 'left', width: '100%',
            color: '#e0e0e0', '& li': { mb: 1.2, fontSize: '1.05rem' },
            '& b': { color: '#ffd600' }
          }}>
            <li>Go to your hero's proficiency screen.</li>
            <li>Ensure <b>fullscreen</b> mode.</li>
            <li>Click <b>Capture Proficiency</b> and share entire screen.</li>
            <li>Wait for capture to complete.</li>
            <li>Repeat after every match.</li>
          </Box>
        </Box>
      )}

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
