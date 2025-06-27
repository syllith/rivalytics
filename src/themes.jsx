import { createTheme } from '@mui/material';

export const custom = createTheme({
    palette: {
        mode: 'dark',
        background: {
            default: '#373737',
            paper: '#121212',
            card: '#121212',
        },
        text: {
            primary: '#e0e0e0',
        },
    },
    typography: {
        fontFamily: 'Lexend, Open Sans, Bebas, Montserrat, Muli, Kolker, Arial',
    },
    components: {
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    width: 230,
                    backgroundColor: '#212121',
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    '&.Mui-selected': {
                        backgroundColor: '#373737',
                    },
                },
            },
        },
        // Only keep these if you want a custom look:
        MuiTableCell: {
            styleOverrides: {
                head: {
                    fontWeight: 600,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                },
                // Remove 'root: { color: ... }' as palette.text.primary handles it
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