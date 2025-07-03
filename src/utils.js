// src/utils.js
import localforage from 'localforage';

// RANKS: Defines the order, proficiency caps, and multipliers for each rank.
export const RANKS = {
    order: ['Agent', 'Knight', 'Captain', 'Centurion', 'Lord'],
    caps: { Agent: 500, Knight: 1200, Captain: 2000, Centurion: 2400, Lord: 2400 },
    multipliers: { Agent: 1.3, Knight: 1.35, Captain: 1.4, Centurion: 1.45, Lord: 1.55 }
};

// FIELD_REWARDS: Points awarded for completing each challenge field (in order)
export const FIELD_REWARDS = [60, 40, 25, 20];

// SIM: Simulation parameters for generating synthetic match data
export const SIM = {
    JITTER_MIN: 0.85,         // Minimum random multiplier for simulating gains
    JITTER_RANGE: 0.3,        // Range for random jitter
    DEFAULT_RATIO: 0.16,      // Default ratio for sim mode
    MINUTES_MIN: 5,           // Minimum match duration (minutes)
    MINUTES_RANGE: 11         // Range for match duration (minutes)
};

// formatNumber: Format a number with commas for readability
export const formatNumber = n => n.toLocaleString();

// getMatchesLeftColor: Returns a color code based on matches left (for UI display)
export function getMatchesLeftColor(matches) {
    if (matches === '–' || matches === Infinity) return '#b0b0b0'; // Gray for unknown/infinite
    if (matches <= 2) return '#4caf50'; // Green for low
    if (matches <= 5) return '#ffd600'; // Yellow for medium
    return '#f44336'; // Red for high
}

// getProgressColor: Returns a color (HSL) based on percent progress (0-100)
export function getProgressColor(pct) {
    const percent = Math.max(0, Math.min(100, pct));
    const hue = percent * 1.2; // 0 = red, 100 = green
    return `hsl(${hue},100%,45%)`;
}

// getRankCap: Returns the proficiency cap for a given rank
export const getRankCap = rank =>
    RANKS.caps[rank];

// getVisibleCharacters: Returns characters that are not hidden, with fallback to all characters
export const getVisibleCharacters = async (allCharacters) => {
    try {
        const hiddenCharacters = await localforage.getItem('pt-hidden-characters');
        if (!hiddenCharacters || !Array.isArray(hiddenCharacters)) {
            return allCharacters;
        }
        
        const hiddenSet = new Set(hiddenCharacters);
        const visible = allCharacters.filter(char => !hiddenSet.has(char.name));
        
        // Always return at least one character to prevent empty dropdown
        return visible.length > 0 ? visible : [allCharacters[0]];
    } catch (error) {
        console.error('Failed to load hidden characters:', error);
        return allCharacters;
    }
};

// RANK_INDEX: Precomputed map for fast rank index lookup
const RANK_INDEX = RANKS.order.reduce((acc, rank, idx) => {
    acc[rank] = idx;
    return acc;
}, {});

// getNextRank: Returns the next rank after the current, or current if at max
export function getNextRank(current) {
    const idx = RANK_INDEX[current];
    return idx < RANKS.order.length - 1
        ? RANKS.order[idx + 1]
        : current;
}

// computeWrappedDelta: Computes the positive difference between two values, wrapping at max (for fields that reset)
export function computeWrappedDelta(cur, prev, prevMax) {
    // Handles wrap-around (e.g., 23/25 -> 2/25 means +4, not -21)
    return ((cur - prev + prevMax) % prevMax + prevMax) % prevMax;
}

// applyChallengeGains: Applies challenge field gains to a stats object, handling field rollover and rank up
export function applyChallengeGains(stats, gains) {
    gains.forEach((gain, i) => {
        if (!gain) return; // Skip if no gain for this field
        const curKey = `field${i + 1}Current`;
        const maxKey = `field${i + 1}Max`;
        stats[curKey] += gain;
        // If field progress exceeds max, handle rollover and award proficiency
        if (stats[curKey] >= stats[maxKey]) {
            const completed = Math.floor(stats[curKey] / stats[maxKey]);
            stats[curKey] = stats[curKey] % stats[maxKey];
            stats.proficiencyCurrent += FIELD_REWARDS[i] * completed;
        }
    });

    // Check for rank up if proficiency exceeds cap
    let cap = getRankCap(stats.status);
    while (stats.proficiencyCurrent >= cap) {
        stats.proficiencyCurrent -= cap;
        const prevStatus = stats.status;
        stats.status = getNextRank(stats.status);
        if (stats.status !== prevStatus) {
            cap = getRankCap(stats.status);
        }
        // If rank didn't change, cap remains the same and loop will break
        else {
            break;
        }
    }
    stats.proficiencyMax = cap;
}

// cropImage: Crops a region of a source canvas based on fixed fractions (for proficiency screen)
export function cropImage(srcCanvas, sw, sh) {
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
    tmp.getContext('2d')
        .drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);

    return tmp;
}

// Helper: Find a nearby label for a challenge field
function findNearbyLabel(texts, idx, PAIR_RX, STATUS_RX) {
    const candidates = [texts[idx - 1], texts[idx - 2], texts[idx + 1], texts[idx + 2]];
    return candidates.find(c => c && !PAIR_RX.test(c) && !STATUS_RX.test(c) && !/proficiency/i.test(c) && c.length > 2)
        ?.replace(/^CO\s*/i, '').trim() || '';
}

// Helper: Clean OCR text by fixing common misreadings
function cleanOcrText(text) {
    return text
        // Common OCR errors: O -> 0, l/I -> 1, S -> 5, etc.
        .replace(/\bO\b/g, '0')              // Standalone O becomes 0
        .replace(/(?<=\s|^)O(?=\/|\d)/g, '0') // O before slash or digit becomes 0
        .replace(/(?<=\/|^\d*)O(?=\s|$)/g, '0') // O after slash or digits becomes 0
        .replace(/\bl\b/g, '1')              // Standalone l becomes 1
        .replace(/\bI\b/g, '1')              // Standalone I becomes 1
        .replace(/\bS\b(?=\d)/g, '5')        // S before digit becomes 5
        .replace(/\bZ\b/g, '2')              // Standalone Z becomes 2
        .trim();
}

// parseOcrResult: Parses OCR results into a stats object with rank, proficiency, and challenge fields
export function parseOcrResult(items) {
    const texts = items.map(({ text }) => cleanOcrText(text.trim()));
    const STATUS_RX = /\b(Agent|Knight|Captain|Centurion|Lord)\b/i;
    const PAIR_RX = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/;

    // Extract rank from OCR text
    const rawStatus = texts.find(t => STATUS_RX.test(t))?.match(STATUS_RX)?.[1];
    if (!rawStatus) throw new Error('Failed to parse rank');
    const status = rawStatus[0].toUpperCase() + rawStatus.slice(1).toLowerCase();

    // Extract overall proficiency (current/max)
    const profText = texts.find(t => /proficiency/i.test(t) && PAIR_RX.test(t));
    if (!profText) {
        // If standard parsing fails, try to find proficiency text and apply additional cleaning
        const proficiencyText = texts.find(t => /proficiency/i.test(t));
        if (proficiencyText) {
            throw new Error(`Failed to parse overall proficiency. Found: "${proficiencyText}"`);
        }
        throw new Error('Failed to parse overall proficiency');
    }
    const [, curStr, maxStr] = profText.match(PAIR_RX);
    const proficiencyCurrent = parseInt(curStr.replace(/,/g, ''), 10);
    const proficiencyMax = parseInt(maxStr.replace(/,/g, ''), 10);

    // Extract challenge field pairs (current/max for each field)
    const profIndex = texts.indexOf(profText);
    const nnIndices = texts
        .map((t, i) => PAIR_RX.test(t) ? i : -1)
        .filter(i => i >= 0 && i !== profIndex)
        .slice(0, 4);
    if (nnIndices.length < 4) throw new Error('Failed to parse challenges');

    const challenges = nnIndices.map(idx => {
        const match = texts[idx].match(PAIR_RX);
        const cur = match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
        const max = match ? parseInt(match[2].replace(/,/g, ''), 10) : 0;
        // Use helper to find a nearby label for the challenge name
        const name = findNearbyLabel(texts, idx, PAIR_RX, STATUS_RX);
        return { name, cur, max };
    });

    // Build stats object with all parsed values in a single loop
    const stats = { status, proficiencyCurrent, proficiencyMax, fieldNames: [] };
    challenges.forEach(({ name, cur, max }, i) => {
        stats[`field${i + 1}Current`] = cur;
        stats[`field${i + 1}Max`] = max;
        stats.fieldNames.push(name);
    });

    return stats;
}

// Helper: Calculate total wrapped delta for a field across history
function getFieldDelta(history, fieldIdx) {
    let total = 0;
    for (let j = 1; j < history.length; j++) {
        const prevStats = history[j - 1].stats;
        const currStats = history[j].stats;
        const curVal = currStats[`field${fieldIdx + 1}Current`];
        const prevVal = prevStats[`field${fieldIdx + 1}Current`];
        const prevMax = prevStats[`field${fieldIdx + 1}Max`];
        total += computeWrappedDelta(curVal, prevVal, prevMax);
    }
    return total;
}

// Helper: Calculate partial field progress for a stats object
function getPartialFieldProgress(stats) {
    let sum = 0;
    for (let i = 0; i < FIELD_REWARDS.length; i++) {
        const cur = stats[`field${i + 1}Current`];
        const max = stats[`field${i + 1}Max`];
        if (!max) continue; // Skip if max is zero or falsy
        sum += (cur / max) * FIELD_REWARDS[i];
    }
    return sum;
}

// calculateProficiencyMetrics: Computes match averages, projected gains, and time-to-complete for proficiency
export function calculateProficiencyMetrics({ history, currentEntry, currentIdx, simMode, FIELD_REWARDS, now }) {
    if (!currentEntry) return null;

    // Only use real (non-simulated) games for calculations
    const realGames = history.filter(e => !e.isSimulated);
    // If simMode, use all real games; otherwise, up to currentIdx
    const realCalc = simMode ? realGames : realGames.slice(0, currentIdx + 1);
    if (realCalc.length < 2) return null;

    const first = realCalc[0].stats;
    const last = realCalc[realCalc.length - 1].stats;
    const realCount = realCalc.length - 1;

    // Calculate average match duration (field1 is assumed to be minutes)
    const avgMins = getFieldDelta(realCalc, 0) / realCount;

    // Usage: ratio of average minutes to 12 (normal match duration)
    const usage = Math.min(1, avgMins / 12);
    const avgGains = [];
    let totalProjected = 0;
    // Calculate average gain per field and projected proficiency per match
    for (let i = 0; i < FIELD_REWARDS.length; i++) {
        const avg = getFieldDelta(realCalc, i) / realCount;
        avgGains.push(avg);
        const fraction = last[`field${i + 1}Max`] ? avg / usage / last[`field${i + 1}Max`] : 0;
        totalProjected += fraction * FIELD_REWARDS[i];
    }

    // Calculate total proficiency gained (including rank-ups)
    let totalProf = 0;
    const allCalc = simMode ? history : realCalc;
    for (let j = 1; j < allCalc.length; j++) {
        const prev = allCalc[j - 1].stats;
        const curr = allCalc[j].stats;
        totalProf += curr.status !== prev.status
            ? (prev.proficiencyMax - prev.proficiencyCurrent) + curr.proficiencyCurrent
            : curr.proficiencyCurrent - prev.proficiencyCurrent;
    }

    // Calculate proficiency gained from real matches only (for accurate per-match calculation)
    let realTotalProf = 0;
    for (let j = 1; j < realCalc.length; j++) {
        const prev = realCalc[j - 1].stats;
        const curr = realCalc[j].stats;
        realTotalProf += curr.status !== prev.status
            ? (prev.proficiencyMax - prev.proficiencyCurrent) + curr.proficiencyCurrent
            : curr.proficiencyCurrent - prev.proficiencyCurrent;
    }

    // Calculate effective proficiency (including partial field progress)
    let effective = totalProf + getPartialFieldProgress(currentEntry.stats);
    // Calculate average proficiency per match using only real proficiency gained
    const actualProfPerMatch = realTotalProf / realCount;
    // Calculate remaining proficiency needed (use current entry for accurate sim calculations)
    let remaining = currentEntry.stats.proficiencyMax - currentEntry.stats.proficiencyCurrent;

    // Estimate matches and hours left to complete current rank
    const estMatches = actualProfPerMatch > 0 ? Math.max(0, remaining / actualProfPerMatch) : Infinity;
    const estMins = isFinite(estMatches) ? estMatches * 12 : Infinity;

    // Calculate proficiency gained in the last 24 hours
    const currentTime = now || Date.now();
    const last24Hours = currentTime - (24 * 60 * 60 * 1000); // 24 hours ago
    let prof24Hours = 0;
    
    // Find entries within the last 24 hours
    const recent24hEntries = realCalc.filter(entry => entry.time >= last24Hours);
    if (recent24hEntries.length >= 2) {
        // Calculate proficiency gained in last 24 hours
        const earliest24h = recent24hEntries[0];
        const latest24h = recent24hEntries[recent24hEntries.length - 1];
        
        // Calculate raw proficiency difference
        let prof24hRaw = latest24h.stats.proficiencyCurrent - earliest24h.stats.proficiencyCurrent;
        
        // Account for rank-ups within 24 hours
        for (let k = 1; k < recent24hEntries.length; k++) {
            const prevEntry = recent24hEntries[k - 1];
            const currEntry = recent24hEntries[k];
            if (currEntry.stats.status !== prevEntry.stats.status) {
                // Rank up occurred - add the proficiency from completing previous rank
                prof24hRaw += (prevEntry.stats.proficiencyMax - prevEntry.stats.proficiencyCurrent);
            }
        }
        prof24Hours = prof24hRaw;
    }

    // Calculate projected completion date
    let projectedDate = null;
    if (isFinite(estMins) && estMins > 0) {
        const completionTime = currentTime + (estMins * 60 * 1000); // Convert minutes to milliseconds
        projectedDate = new Date(completionTime);
    }

    return {
        totalGained: totalProf, // Total proficiency gained
        ptsPerMatch: actualProfPerMatch.toFixed(1), // Actual proficiency per match (based on real gains)
        avgMatchDurationMinutes: avgMins.toFixed(1), // Average match duration
        matchesLeft: isFinite(estMatches) ? Math.ceil(estMatches) : '–', // Estimated matches left
        hoursLeft: isFinite(estMins) ? (estMins / 60).toFixed(1) : '–', // Estimated hours left
        averageGains: avgGains, // Average gain per field
        exactMatchesLeft: estMatches, // Exact matches left (float)
        exactHoursLeft: estMins / 60, // Exact hours left (float)
        prof24Hours: prof24Hours, // Proficiency gained in last 24 hours
        projectedCompletionDate: projectedDate // Projected completion date for next rank
    };
}

// getRealChallengeAverages: Returns average field gains and match duration for real (non-sim) matches
export function getRealChallengeAverages(history) {
    const real = history.filter(h => !h.isSimulated);
    if (real.length < 2) return null;

    const result = {
        avgGains: Array(FIELD_REWARDS.length).fill(0),
        avgMinutes: 0
    };
    result.avgMinutes = getFieldDelta(real, 0) / (real.length - 1);
    for (let i = 0; i < FIELD_REWARDS.length; i++) {
        result.avgGains[i] = getFieldDelta(real, i) / (real.length - 1);
    }
    return result;
}

// initialCharacterData: Template for a new character's proficiency history
export const initialCharacterData = { history: [], backupHistory: [] };

// initialState: Initial state for proficiency tracking (multiple characters, sim mode, etc)
export const initialState = {
    characters: {},
    currentCharacter: null,
    simMode: false,
    simCount: 0
};

// proficiencyReducer: Handles all proficiency state changes (for useReducer)
export function proficiencyReducer(state, action) {
    const cc = state.currentCharacter;
    // Helper to update current character
    const updateCharacter = (updater) => {
        if (!cc) return state;
        return {
            ...state,
            characters: {
                ...state.characters,
                [cc]: updater(state.characters[cc])
            }
        };
    };
    switch (action.type) {
        case 'LOAD':
            // Load all characters and set current
            return {
                ...state,
                characters: action.payload.characters || {},
                currentCharacter: action.payload.currentCharacter
            };
        case 'INIT_CHARACTER':
            // Initialize a new character if not present
            return {
                ...state,
                characters: {
                    ...state.characters,
                    [action.payload]:
                        state.characters[action.payload] || { ...initialCharacterData }
                }
            };
        case 'SET_CHARACTER':
            // Switch to a different character
            return { ...state, currentCharacter: action.payload };
        case 'CAPTURE':
            // Add a new history entry for the current character
            return updateCharacter(charData => ({
                ...charData,
                history: [...charData.history, action.payload]
            }));
        case 'BACKUP':
            // Backup current history and enter sim mode
            if (!cc) return state;
            return {
                ...updateCharacter(charData => ({
                    ...charData,
                    backupHistory: [...charData.history]
                })),
                simMode: true,
                simCount: 0
            };
        case 'SIM_STEP':
            // Add a simulated match entry
            return {
                ...updateCharacter(charData => ({
                    ...charData,
                    history: [...charData.history, action.payload]
                })),
                simCount: state.simCount + 1
            };
        case 'RESTORE':
            // Restore from backup and exit sim mode
            if (!cc) return state;
            return {
                ...updateCharacter(charData => ({
                    ...charData,
                    history: [...charData.backupHistory],
                    backupHistory: []
                })),
                simMode: false,
                simCount: 0
            };
        case 'UNDO':
            // Remove the last match entry
            return updateCharacter(charData => ({
                ...charData,
                history: charData.history.slice(0, -1)
            }));
        case 'CLEAR':
            // Clear all history for the current character
            return updateCharacter(() => ({ ...initialCharacterData }));
        default:
            return state;
    }
}

// captureProficiency: Captures the proficiency screen, crops it, sends to OCR, and parses the result
export async function captureProficiency(canvasRef) {
    let stream, video;
    try {
        // Request screen capture from user
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        video = document.createElement('video');
        video.style.display = 'none';
        // No need to append video to the DOM
        video.srcObject = stream;
        // Start playing immediately
        video.play();
        // Wait for video to be ready, but with a timeout (5 seconds)
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Screen capture timed out'));
            }, 5000);
            video.onloadeddata = () => {
                clearTimeout(timeout);
                resolve();
            };
        });

        // Draw the captured video frame to the canvas
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        // Crop the image to the relevant region
        const cropped = cropImage(canvas, canvas.width, canvas.height);
        // Convert cropped image to PNG blob
        const blob = await new Promise(res =>
            cropped.toBlob(res, 'image/png')
        );
        // Remove video from DOM as soon as it's no longer needed
        video.pause();
        video.remove();
        video = null;
        // Prepare form data for OCR API
        const form = new FormData();
        form.append('file', blob, `ss_${Date.now()}.png`);
        // Send image to OCR endpoint
        const resp = await fetch('/api/ocr', {
            method: 'POST', cache: 'no-store', body: form
        });
        if (!resp.ok) throw new Error(`OCR ${resp.status}`);
        // Parse OCR result and convert to stats object
        const { result } = await resp.json();
        const stats = parseOcrResult(result);
        return stats;
    } finally {
        // Always clean up video and stream resources
        video?.pause();
        video?.remove();
        stream?.getTracks().forEach(t => t.stop());
    }
}
