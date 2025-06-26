import { Box, Typography } from '@mui/material';

export default function Instructions() {
    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,32,40,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 3, mb: 3,
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
                '& li': { mb: 1.2, fontSize: '1.05rem' },
                '& b': { color: '#ffd600' }
            }}>
                <li>Go to your hero's proficiency screen.</li>
                <li>Ensure <b>fullscreen</b> mode.</li>
                <li>Click <b>Capture Proficiency</b> and share entire screen.</li>
                <li>Wait for capture to complete.</li>
                <li>Repeat after every match.</li>
            </Box>
        </Box>
    );
}
