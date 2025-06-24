import { createTheme } from '@mui/material';

export const custom = createTheme({
    palette: {
        mode: 'dark',
        background: {
            default: '#373737',
            paper: '#121212',
            card: '#121212',
        },
    },
    typography: {
        fontFamily: 'Lexend, Open Sans, Arial',
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
    },
});