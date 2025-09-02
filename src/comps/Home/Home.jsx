// Home.jsx
import { useState, useEffect } from 'react';
import {
    ToggleButton,
    ToggleButtonGroup,
    Box,
    Paper,
    Container,
    TextField,
    CircularProgress,
    ListItemButton,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Autocomplete from '@mui/material/Autocomplete';
import CloseIcon from '@mui/icons-material/Close';
import * as themes from '../../themes';
import Proficiency from '../Proficiency/Proficiency';
import Hero from '../Hero/Hero';
import Matches from '../Matches/Matches';
import Ranked from '../Ranked/Ranked';
import Composition from '../Composition/Composition';

// Capitalizes the first letter of a string (for display purposes)
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Renders the content for the selected tab, handling loading and error states
function renderTabContent({ tab, heroData, matchesData, rankedData, username, loading, error }) {
    if (tab === 'proficiency') return <Proficiency />;
    if (tab === 'hero' && heroData) return <Hero rawData={heroData} username={capitalizeFirst(username)} loading={loading} />;
    if (tab === 'matches' && matchesData) return <Matches rawData={matchesData} username={capitalizeFirst(username)} loading={loading} />;
    if (tab === 'ranked' && rankedData) return <Ranked rawData={rankedData} username={capitalizeFirst(username)} loading={loading} />;
    if (tab === 'composition') return <Composition />;
    // Show a message if no data is loaded and not loading or error
    if (tab !== 'proficiency' && !loading && !error && !heroData && !matchesData && !rankedData) {
        return <Box sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>No data loaded.</Box>;
    }
    // Show a loading spinner if data is being fetched
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4 }}>
                <CircularProgress />
            </Box>
        );
    }
    return null;
}

export default function Home() {
    // --- State Management ---
    // Current selected tab
    const [tab, setTab] = useState('proficiency');
    // Username (persisted in localStorage)
    const [username, setUsername] = useState(
        localStorage.getItem('rivalytics-username') || ''
    );
    // Loading state for API calls
    const [loading, setLoading] = useState(false);
    // Data for each tab
    const [heroData, setHeroData] = useState(null);
    const [matchesData, setMatchesData] = useState(null);
    const [rankedData, setRankedData] = useState(null);
    // List of recent usernames (persisted in localStorage)
    const [recentUsernames, setRecentUsernames] = useState(
        JSON.parse(localStorage.getItem('rivalytics-recents') || '[]')
    );
    // Last username for which data was loaded
    const [lastLoadedUsername, setLastLoadedUsername] = useState('');
    // Error message for API failures
    const [error, setError] = useState('');
    // Flag for username not found (for error display)
    const [usernameNotFound, setUsernameNotFound] = useState(false);
    // Last fetch time for the current username
    const [lastFetchTime, setLastFetchTime] = useState(() => {
        if (!username) return null;
        return localStorage.getItem(`rivalytics-lastfetch:${username}`);
    });

    // --- Effects: Persist username to localStorage whenever it changes ---
    useEffect(() => {
        localStorage.setItem('rivalytics-username', username);
    }, [username]);

    // --- Effects: Load cached data from localStorage when username changes ---
    useEffect(() => {
        if (!username) return;
        const stored = localStorage.getItem(`rivalytics-data:${username}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            setHeroData(parsed.heroData);
            setMatchesData(parsed.matchesData);
            setRankedData(parsed.rankedData);
        }
        // Update last fetch time from localStorage
        setLastFetchTime(localStorage.getItem(`rivalytics-lastfetch:${username}`));
    }, [username]);

    // --- Add a username to the recent usernames list and persist ---
    const addRecentUsername = name => {
        if (!name) return;
        let recents = JSON.parse(localStorage.getItem('rivalytics-recents') || '[]');
        recents = [name, ...recents.filter(u => u !== name)].slice(0, 8);
        localStorage.setItem('rivalytics-recents', JSON.stringify(recents));
        setRecentUsernames(recents);
    };

    // --- Remove a username from the recent usernames list and persist ---
    const removeRecentUsername = name => {
        const recents = recentUsernames.filter(u => u !== name);
        localStorage.setItem('rivalytics-recents', JSON.stringify(recents));
        setRecentUsernames(recents);
    };

    // --- Clear all recent usernames from localStorage and state ---
    const clearAllRecents = () => {
        localStorage.removeItem('rivalytics-recents');
        setRecentUsernames([]);
    };

    // --- On mount: Load cached data for the current username (if any) ---
    useEffect(() => {
        if (!username) return;

        const storedData = localStorage.getItem(`rivalytics-data:${username}`);
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            setHeroData(parsedData.heroData);
            setMatchesData(parsedData.matchesData);
            setRankedData(parsedData.rankedData);
            setLastLoadedUsername(username); // Mark as loaded to prevent unnecessary API calls
        }
    }, [username]); // Runs whenever username changes

    // --- Fetch all data (hero, matches, ranked) for a username from the API ---
    const fetchAll = async (currentUsername = username) => {
        if (!currentUsername) return;
        setLoading(true);
        setError('');
        setHeroData(null);
        setMatchesData(null);
        setRankedData(null);
        setUsernameNotFound(false);

        try {
            // Fetch all data in parallel
            const [heroRes, matchesRes, rankedRes] = await Promise.all([
                fetch(`/api/rivals/${currentUsername}/career`),
                fetch(`/api/rivals/${currentUsername}/matches`),
                fetch(`/api/rivals/${currentUsername}/ranked`)
            ]);
            const [heroJson, matchesJson, rankedJson] = await Promise.all([
                heroRes.json(),
                matchesRes.json(),
                rankedRes.json()
            ]);

            // Check if all are empty before updating state
            const isHeroEmpty = !heroJson?.data || heroJson.data.length === 0;
            const isMatchesEmpty = !matchesJson?.data || !matchesJson.data.matches || matchesJson.data.matches.length === 0;
            const isRankedEmpty = !rankedJson?.data || !rankedJson.data.history || !rankedJson.data.history.data || rankedJson.data.history.data.length === 0;

            if (isHeroEmpty && isMatchesEmpty && isRankedEmpty) {
                setHeroData(null);
                setMatchesData(null);
                setRankedData(null);
                setLastLoadedUsername(currentUsername);
                setLoading(false);
                setUsernameNotFound(true);
                // Remove any previously cached data for this username
                localStorage.removeItem(`rivalytics-data:${currentUsername}`);
                localStorage.removeItem(`rivalytics-lastfetch:${currentUsername}`);
                setLastFetchTime(null);
                return;
            }

            // Cache the fetched data in localStorage
            localStorage.setItem(
                `rivalytics-data:${currentUsername}`,
                JSON.stringify({ heroData: heroJson, matchesData: matchesJson, rankedData: rankedJson })
            );
            // Store the fetch time
            const now = new Date().toISOString();
            localStorage.setItem(`rivalytics-lastfetch:${currentUsername}` , now);
            setLastFetchTime(now);

            setHeroData(heroJson);
            setMatchesData(matchesJson);
            setRankedData(rankedJson);
            addRecentUsername(currentUsername);
            setLastLoadedUsername(currentUsername);
            setError('');
            setUsernameNotFound(false);
        } catch {
            setHeroData(null);
            setMatchesData(null);
            setRankedData(null);
            setError('Failed to load data. Please try again.');
            setLastLoadedUsername(currentUsername);
            setUsernameNotFound(false);
        }
        setLoading(false);
    };

    // --- On initial load: Check for username in URL params and set it ---
    useEffect(() => {
        // Handle URL parameters only on initial load
        if (tab === 'proficiency') return;
        const params = new URLSearchParams(window.location.search);
        const urlUsername = params.get('username');
        if (urlUsername && urlUsername !== lastLoadedUsername) {
            setUsername(urlUsername);
        }
        // eslint-disable-next-line
    }, []);

    // --- Prepare options for the autocomplete dropdown ---
    const autocompleteOptions = recentUsernames.length
        ? [...recentUsernames, 'CLEAR_ALL']
        : [];

    // --- Main Render ---
    return (
        <ThemeProvider theme={themes.custom}>
            <CssBaseline />
            <Container
                maxWidth="lg"
                disableGutters
                sx={{ p: 4, height: '100vh', boxSizing: 'border-box' }}
            >
                <Box sx={{ height: '100%', maxHeight: '100vh', overflowY: 'auto' }}>
                    <Paper
                        sx={{
                            pt: 1.5,
                            px: { xs: 2, sm: 2 },
                            pb: { xs: 2, sm: 2 },
                            width: '100%',
                            maxWidth: 1320,
                            mx: 'auto',
                            borderRadius: 4,
                            minHeight: '80vh',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            boxSizing: 'border-box',
                        }}
                    >
                        {/* --- App Logo --- */}
            <Box
                            sx={{
                                fontFamily: '"Kolker", sans-serif',
                                fontSize: { xs: 50, sm: 65 },
                                textAlign: 'center',
                                mt: 0.5,
                                mb: 0.5,
                                py: 0,
                                lineHeight: 1,
                                color: 'white',
                                userSelect: 'none',
                                textShadow: '0 2px 8px #000a',
                            }}
                        >
                            Rivalytics
                        </Box>
                        {/* --- Tab Selector --- */}
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                            <ToggleButtonGroup
                                value={tab}
                                exclusive
                                onChange={(_, v) => v && setTab(v)}
                            >
                                <ToggleButton value="proficiency" sx={{ textTransform: 'none' }}>Proficiency</ToggleButton>
                                <ToggleButton value="hero" sx={{ textTransform: 'none' }}>Heros</ToggleButton>
                                <ToggleButton value="matches" sx={{ textTransform: 'none' }}>Matches</ToggleButton>
                                <ToggleButton value="ranked" sx={{ textTransform: 'none' }}>Ranked</ToggleButton>
                                <ToggleButton value="composition" sx={{ textTransform: 'none' }}>Composition</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

            {/* --- Username Autocomplete (hidden on proficiency and composition tabs) --- */}
            {tab !== 'proficiency' && tab !== 'composition' && (
                            <Box display="flex" mb={2} alignItems="center" justifyContent="center" flexDirection="column">
                                <Autocomplete
                                    freeSolo
                                    options={autocompleteOptions}
                                    getOptionLabel={option =>
                                        option === 'CLEAR_ALL' ? '' : option
                                    }
                                    value={username}
                                    onChange={(_, newValue) => {
                                        if (newValue === 'CLEAR_ALL') {
                                            clearAllRecents();
                                            return;
                                        }
                                        if (newValue) {
                                            setUsername(newValue);
                                            fetchAll(newValue); // Explicitly call fetchAll with the new value
                                        }
                                    }}
                                    sx={{ mr: 2, width: 280 }}
                                    renderOption={(props, option) => {
                                        const { key, ...rest } = props;
                                        if (option === 'CLEAR_ALL') {
                                            return (
                                                <li key={key} {...rest}>
                                                    <ListItemButton
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            clearAllRecents();
                                                        }}
                                                        disableRipple
                                                        sx={{
                                                            justifyContent: 'center',
                                                            color: 'error.main',
                                                            backgroundColor: 'transparent !important',
                                                            fontWeight: 500,
                                                            fontSize: 14,
                                                            '&:hover': {
                                                                backgroundColor: 'transparent',
                                                            },
                                                        }}
                                                    >
                                                        Clear All
                                                    </ListItemButton>
                                                </li>
                                            );
                                        }
                                        return (
                                            <li key={key} {...rest} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between'
                                            }}>
                                                <span>{option}</span>
                                                <CloseIcon
                                                    fontSize="small"
                                                    sx={{ ml: 1, cursor: 'pointer', color: 'grey.500' }}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        removeRecentUsername(option);
                                                    }}
                                                />
                                            </li>
                                        );
                                    }}
                                    renderInput={params => (
                                        <TextField
                                            {...params}
                                            label="Username"
                                            error={usernameNotFound}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (username && !loading) {
                                                        fetchAll(username); // Explicitly call fetchAll with the current username
                                                    }
                                                }
                                            }}
                                        />
                                    )}
                                />
                                {/* Last fetch time label */}
                                {lastFetchTime && (
                                    <Box mt={1} sx={{ color: '#aaa', fontSize: 13, textAlign: 'center' }}>
                                        {(() => {
                                            const d = new Date(lastFetchTime);
                                            let hours = d.getHours();
                                            const minutes = d.getMinutes();
                                            const ampm = hours >= 12 ? 'PM' : 'AM';
                                            hours = hours % 12;
                                            hours = hours ? hours : 12; // the hour '0' should be '12'
                                            const month = d.getMonth() + 1;
                                            const day = d.getDate();
                                            const year = d.getFullYear();
                                            return `Last Updated: ${month}/${day}/${year} ${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
                                        })()}
                                    </Box>
                                )}
                            </Box>
                        )}
                        {/* --- End Username Autocomplete --- */}

                        {/* --- Main Tab Content --- */}
                        <Box sx={{ flex: 1, minWidth: 0, width: '100%', overflow: 'hidden' }}>
                            {renderTabContent({ tab, heroData, matchesData, rankedData, username, loading, error })}
                        </Box>
                    </Paper>
                </Box>
            </Container>
        </ThemeProvider>
    );
}
