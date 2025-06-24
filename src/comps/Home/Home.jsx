// Home.jsx
import React, { useState, useEffect } from 'react';
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
import Autocomplete from '@mui/material/Autocomplete';
import CloseIcon from '@mui/icons-material/Close';
import * as themes from '../../themes';
import Proficiency from '../Proficiency/Proficiency';
import Hero from '../Hero/Hero';
import Matches from '../Matches/Matches';
import Ranked from '../Ranked/Ranked';

export default function Home() {
    const [tab, setTab] = useState('proficiency');
    // Initialize username from localStorage
    const [username, setUsername] = useState(
        localStorage.getItem('rivalytics-username') || ''
    );
    const [loading, setLoading] = useState(false);
    const [heroData, setHeroData] = useState(null);
    const [matchesData, setMatchesData] = useState(null);
    const [rankedData, setRankedData] = useState(null);
    const [recentUsernames, setRecentUsernames] = useState(
        JSON.parse(localStorage.getItem('rivalytics-recents') || '[]')
    );
    const [lastLoadedUsername, setLastLoadedUsername] = useState('');
    const [error, setError] = useState('');
    const [hasFetchedFor, setHasFetchedFor] = useState('');
    const [usernameNotFound, setUsernameNotFound] = useState(false);

    // Save username to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('rivalytics-username', username);
    }, [username]);

    // Whenever username is non-empty, attempt to load from localStorage
    useEffect(() => {
        if (!username) return;
        const stored = localStorage.getItem(`rivalytics-data:${username}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            setHeroData(parsed.heroData);
            setMatchesData(parsed.matchesData);
            setRankedData(parsed.rankedData);
        }
    }, [username]);

    const addRecentUsername = name => {
        if (!name) return;
        let recents = JSON.parse(localStorage.getItem('rivalytics-recents') || '[]');
        recents = [name, ...recents.filter(u => u !== name)].slice(0, 8);
        localStorage.setItem('rivalytics-recents', JSON.stringify(recents));
        setRecentUsernames(recents);
    };

    const removeRecentUsername = name => {
        const recents = recentUsernames.filter(u => u !== name);
        localStorage.setItem('rivalytics-recents', JSON.stringify(recents));
        setRecentUsernames(recents);
    };

    const clearAllRecents = () => {
        localStorage.removeItem('rivalytics-recents');
        setRecentUsernames([]);
    };

    // On mount, load data from localStorage if existing
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

    async function fetchAllDataForUser(user) {
        try {
            // Fetch data from APIs
            const [heroJson, matchesJson, rankedJson] = await Promise.all([
                fetch(`/api/rivals/${user}/career`).then(res => res.json()),
                fetch(`/api/rivals/${user}/matches`).then(res => res.json()),
                fetch(`/api/rivals/${user}/ranked`).then(res => res.json()),
            ]);

            // Store results in state
            setHeroData(heroJson);
            setMatchesData(matchesJson);
            setRankedData(rankedJson);

            // Save results to localStorage
            localStorage.setItem(
                `rivalytics-data:${user}`,
                JSON.stringify({
                    heroData: heroJson,
                    matchesData: matchesJson,
                    rankedData: rankedJson,
                })
            );

            addRecentUsername(user);
        } catch {
            setHeroData(null);
            setMatchesData(null);
            setRankedData(null);
            throw new Error('Failed to fetch data');
        }
    }

    const fetchAll = async () => {
        if (!username) return;
        setLoading(true);
        setError('');
        setHeroData(null);
        setMatchesData(null);
        setRankedData(null);
        setHasFetchedFor(username);
        setUsernameNotFound(false);

        try {
            // Fetch hero data
            const heroRes = await fetch(`/api/rivals/${username}/career`);
            const heroJson = await heroRes.json();
            setHeroData(heroJson);

            // Wait 0.25 second before next fetch
            await new Promise(res => setTimeout(res, 250));

            // Fetch matches data
            const matchesRes = await fetch(`/api/rivals/${username}/matches`);
            const matchesJson = await matchesRes.json();
            setMatchesData(matchesJson);

            // Wait 0.25 second before next fetch
            await new Promise(res => setTimeout(res, 250));

            // Fetch ranked data
            const rankedRes = await fetch(`/api/rivals/${username}/ranked`);
            const rankedJson = await rankedRes.json();
            setRankedData(rankedJson);

            // Check if all are empty
            if (
                (!heroJson?.data || heroJson.data.length === 0) &&
                (!matchesJson?.data || !matchesJson.data.matches || matchesJson.data.matches.length === 0) &&
                (!rankedJson?.data || !rankedJson.data.history || !rankedJson.data.history.data || rankedJson.data.history.data.length === 0)
            ) {
                setHeroData(null);
                setMatchesData(null);
                setRankedData(null);
                setLastLoadedUsername(username);
                setLoading(false);
                setUsernameNotFound(true); // Set red box
                return;
            }

            addRecentUsername(username);
            setLastLoadedUsername(username);
            setError('');
            setUsernameNotFound(false);
        } catch {
            setHeroData(null);
            setMatchesData(null);
            setRankedData(null);
            setError('Failed to load data. Please try again.');
            setLastLoadedUsername(username);
            setUsernameNotFound(false);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (tab === 'proficiency') return;
        const params = new URLSearchParams(window.location.search);
        const urlUsername = params.get('username');
        if (urlUsername && urlUsername !== lastLoadedUsername) {
            setUsername(urlUsername);
        }
        // eslint-disable-next-line
    }, []);

    const autocompleteOptions = recentUsernames.length
        ? [...recentUsernames, 'CLEAR_ALL']
        : [];

    return (
        <ThemeProvider theme={themes.custom}>
            <Container
                maxWidth="lg"
                disableGutters
                sx={{ p: 4, height: '100vh', boxSizing: 'border-box' }}
            >
                <Box sx={{ height: '100%', maxHeight: '100vh', overflowY: 'auto' }}>
                    <Paper
                        sx={{
                            p: { xs: 2, sm: 2 },
                            width: '100%',
                            maxWidth: 1200,
                            mx: 'auto',
                            bgcolor: 'rgba(28,30,34,0.98)',
                            borderRadius: 4,
                            boxShadow: '0 8px 32px 0 rgba(0,0,0,0.28)',
                            minHeight: '80vh',
                            border: '1.5px solid rgba(255,255,255,0.07)',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            boxSizing: 'border-box',
                        }}
                    >
                        {/* Logo */}
                        <Box
                            sx={{
                                fontFamily: '"Kolker", sans-serif',
                                fontSize: { xs: 50, sm: 65 },
                                textAlign: 'center',
                                mb: 2,
                                mt: 1,
                                color: 'white',
                                userSelect: 'none',
                                textShadow: '0 2px 8px #000a',
                            }}
                        >
                            Rivalytics
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                            <ToggleButtonGroup
                                value={tab}
                                exclusive
                                onChange={(_, v) => v && setTab(v)}
                            >
                                <ToggleButton value="proficiency">Proficiency</ToggleButton>
                                <ToggleButton value="hero">Heros</ToggleButton>
                                <ToggleButton value="matches">Matches</ToggleButton>
                                <ToggleButton value="ranked">Ranked</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        {/* Only show username/autocomplete when NOT on proficiency tab */}
                        {tab !== 'proficiency' && (
                            <Box display="flex" mb={2} alignItems="center" justifyContent="center">
                                <Autocomplete
                                    freeSolo
                                    options={autocompleteOptions}
                                    getOptionLabel={option =>
                                        option === 'CLEAR_ALL' ? '' : option
                                    }
                                    value={username}
                                    onInputChange={(_, newValue, reason) => {
                                        if (reason === 'input' || reason === 'clear') {
                                            setUsername(newValue);
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
                                                        fetchAll();
                                                    }
                                                }
                                            }}
                                        />
                                    )}
                                />
                            </Box>
                        )}
                        {/* End username/autocomplete hiding on proficiency tab */}

                        <Box sx={{ flex: 1, minWidth: 0, width: '100%', overflow: 'hidden' }}>
                            {renderTabContent(tab, heroData, matchesData, rankedData, username, loading, error)}
                        </Box>
                    </Paper>
                </Box>
            </Container>
        </ThemeProvider>
    );
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderTabContent(tab, heroData, matchesData, rankedData, username, loading, error) {
    if (tab === 'proficiency') return <Proficiency />;
    if (tab === 'hero' && heroData) return <Hero rawData={heroData} username={capitalizeFirst(username)} loading={loading} />;
    if (tab === 'matches' && matchesData) return <Matches rawData={matchesData} username={capitalizeFirst(username)} loading={loading} />;
    if (tab === 'ranked' && rankedData) return <Ranked rawData={rankedData} username={capitalizeFirst(username)} loading={loading} />;
    if (tab !== 'proficiency' && !loading && !error && !heroData && !matchesData && !rankedData) {
        return <Box sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>No data loaded.</Box>;
    }
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4 }}>
                <CircularProgress />
            </Box>
        );
    }
    return null;
}
