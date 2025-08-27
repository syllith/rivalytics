import { createTheme } from '@mui/material';

export const custom = createTheme({
    palette: {
        mode: 'dark',
        background: {
            // Let the global CSS gradient show through
            default: 'transparent',
            // Slightly translucent surfaces
            paper: 'rgba(18, 18, 18, 0.55)',
            card: 'rgba(18, 18, 18, 0.55)',
        },
        text: {
            primary: '#e0e0e0',
        },
    },
    typography: {
        fontFamily: 'Lexend, Open Sans, Bebas, Montserrat, Muli, Kolker, Arial',
        button: {
            textTransform: 'none',
        },
    },
    components: {
        // Remove automatic uppercase from buttons and tabs
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: 'rgba(18, 18, 18, 0.55)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: 'rgba(18, 18, 18, 0.5)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    width: 230,
                    backgroundColor: 'rgba(18, 18, 18, 0.6)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.08)'
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(18, 18, 18, 0.6)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    '&.Mui-selected': {
                        backgroundColor: 'rgba(255,255,255,0.06)',
                    },
                },
            },
        },
        // Keep existing table tweaks
        MuiTableCell: {
            styleOverrides: {
                head: {
                    fontWeight: 600,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(255,255,255,0.07)',
                    '&:last-child td, &:last-child th': { border: 0 },
                },
            },
        },
    },
});