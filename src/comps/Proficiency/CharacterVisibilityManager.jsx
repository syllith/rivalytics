import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, FormControlLabel, Checkbox, Box, Avatar, Typography
} from '@mui/material';
import localforage from 'localforage';
import characters from '../../characters.json';

const CharacterVisibilityManager = ({ open, onClose }) => {
    const [hiddenCharacters, setHiddenCharacters] = useState(new Set());
    const [loading, setLoading] = useState(true);

    // Load hidden characters from localforage on mount
    useEffect(() => {
        const loadHiddenCharacters = async () => {
            try {
                const saved = await localforage.getItem('pt-hidden-characters');
                if (saved && Array.isArray(saved)) {
                    setHiddenCharacters(new Set(saved));
                }
            } catch (error) {
                console.error('Failed to load hidden characters:', error);
            } finally {
                setLoading(false);
            }
        };

        if (open) {
            loadHiddenCharacters();
        }
    }, [open]);

    // Save hidden characters to localforage
    const saveHiddenCharacters = async (newHiddenSet) => {
        try {
            await localforage.setItem('pt-hidden-characters', Array.from(newHiddenSet));
        } catch (error) {
            console.error('Failed to save hidden characters:', error);
        }
    };

    // Toggle character visibility
    const toggleCharacterVisibility = (characterName) => {
        setHiddenCharacters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(characterName)) {
                newSet.delete(characterName);
            } else {
                newSet.add(characterName);
            }
            saveHiddenCharacters(newSet);
            return newSet;
        });
    };

    // Show all characters
    const showAllCharacters = () => {
        const emptySet = new Set();
        setHiddenCharacters(emptySet);
        saveHiddenCharacters(emptySet);
    };

    // Hide all characters (except keep at least one visible)
    const hideAllCharacters = () => {
        if (characters.length <= 1) return;
        
        const allButFirst = new Set(characters.slice(1).map(c => c.name));
        setHiddenCharacters(allButFirst);
        saveHiddenCharacters(allButFirst);
    };

    const visibleCount = characters.length - hiddenCharacters.size;

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: '#1a1a1a',
                    color: 'white'
                }
            }}
        >
            <DialogTitle sx={{ color: 'white' }}>
                Manage Character Visibility
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: '#b0b0b0', mb: 2 }}>
                        Hide characters you don't use from the character dropdown.<br />
                        {visibleCount} / {characters.length} characters visible.
                    </Typography>
                    
                    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={showAllCharacters}
                            disabled={hiddenCharacters.size === 0}
                            sx={{ textTransform: 'none' }}
                        >
                            Show All
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={hideAllCharacters}
                            disabled={hiddenCharacters.size >= characters.length - 1}
                            sx={{ textTransform: 'none' }}
                        >
                            Hide All
                        </Button>
                    </Box>
                </Box>

                {loading ? (
                    <Typography>Loading...</Typography>
                ) : (
                    <Box sx={{ maxHeight: 400, overflowY: 'auto', overflowX: 'hidden' }}>
                        {characters.map((character) => (
                            <FormControlLabel
                                key={character.name}
                                control={
                                    <Checkbox
                                        checked={!hiddenCharacters.has(character.name)}
                                        onChange={() => toggleCharacterVisibility(character.name)}
                                        sx={{ 
                                            color: 'white',
                                            '&.Mui-checked': {
                                                color: theme => theme.palette.primary.main
                                            }
                                        }}
                                        disabled={
                                            // Prevent hiding the last visible character
                                            !hiddenCharacters.has(character.name) && 
                                            hiddenCharacters.size >= characters.length - 1
                                        }
                                    />
                                }
                                label={
                                    <Box sx={{ 
                                        display: 'flex', 
                                        alignItems: 'center',
                                        opacity: hiddenCharacters.has(character.name) ? 0.5 : 1
                                    }}>
                                        <Avatar
                                            src={character.icon}
                                            alt={character.name}
                                            sx={{ width: 24, height: 24, mr: 1 }}
                                        />
                                        <Typography sx={{ color: 'white' }}>
                                            {character.name}
                                        </Typography>
                                    </Box>
                                }
                                sx={{ 
                                    display: 'flex',
                                    width: '100%',
                                    margin: 0,
                                    padding: 1,
                                    borderRadius: 1,
                                    '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)'
                                    }
                                }}
                            />
                        ))}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} sx={{ color: 'white' }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CharacterVisibilityManager;
