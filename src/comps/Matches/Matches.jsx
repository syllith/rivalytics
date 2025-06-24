import React, { useState, useEffect } from 'react'
import {
    Box,
    Table,
    TableContainer,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Paper
} from '@mui/material'

function matchesToTable(matches) {
    const header = [
        "Date/Time", "Map", "Mode", "Result", "Kills", "Deaths", "Damage", "Duration", "K/D"
    ]
    const rows = matches.map(match => {
        const meta = match.metadata;
        // Find the "overview" segment for player stats
        const overview = match.segments.find(seg => seg.type === "overview");
        const stats = overview?.stats || {};
        return [
            // Format: M/D/YYYY h:mm AM/PM (no comma)
            (() => {
                const d = new Date(meta.timestamp);
                const date = d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric'
                });
                const time = d.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                return `${date} ${time}`;
            })(),
            meta.mapName,
            meta.mapModeName,
            (overview?.metadata?.result || "-").replace(/^./, c => c.toUpperCase()),
            stats.kills?.displayValue ?? "-",
            stats.deaths?.displayValue ?? "-",
            stats.totalHeroDamage?.displayValue ?? "-",
            stats.timePlayed?.displayValue?.replace("m ", ":").replace("s", "") ?? "-",
            stats.kdRatio?.displayValue ?? "-"
        ];
    });
    return [header, ...rows];
}

export default function Matches({ rawData }) {
    const [table, setTable] = useState(() => {
        const saved = localStorage.getItem('matches-table')
        return saved ? JSON.parse(saved) : []
    })

    // Save table to localStorage when it changes
    useEffect(() => {
        if (table.length > 0) {
            localStorage.setItem('matches-table', JSON.stringify(table))
        }
    }, [table])

    // Parse rawData when it changes
    useEffect(() => {
        if (!rawData || !rawData.data || !rawData.data.matches) {
            setTable([])
            return
        }
        setTable(matchesToTable(rawData.data.matches))
    }, [rawData])

    return (
        <Box pt={2}>
            {/* No username field or button here */}
            {table.length > 0 && (
                <TableContainer
                    component={Paper}
                    sx={{
                        mb: 2,
                        bgcolor: 'rgba(30,30,40,0.92)',
                        boxShadow: 'none',
                        borderRadius: 2,
                        border: '1px solid rgba(255,255,255,0.07)'
                    }}
                >
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {table[0].map((h, i) => (
                                    <TableCell
                                        key={i}
                                        sx={{
                                            fontSize: '0.75rem',
                                            px: 0.25,
                                            py: 0.25,
                                            color: '#fff',
                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                            borderBottom: '1px solid rgba(255,255,255,0.12)'
                                        }}
                                        padding="none"
                                    >
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {table.slice(1).map((row, ri) => {
                                // Determine row color based on result
                                const result = (row[3] || "").toLowerCase();
                                let bgColor;
                                if (result === "win") bgColor = "rgba(56, 183, 80, 0.18)"; // green
                                else if (result === "loss" || result === "lose") bgColor = "rgba(220, 38, 38, 0.18)"; // red
                                else if (result === "disconnect" || result === "left" || result === "left early") bgColor = "rgba(120,120,120,0.18)"; // grey
                                else bgColor = ri % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)';

                                return (
                                    <TableRow
                                        key={ri}
                                        sx={{
                                            height: '28px',
                                            backgroundColor: bgColor
                                        }}
                                    >
                                        {row.map((cell, ci) =>
                                            <TableCell
                                                key={ci}
                                                sx={{
                                                    fontSize: '0.75rem',
                                                    px: 0.25,
                                                    py: 0.25,
                                                    color: '#e0e0e0',
                                                    borderBottom: '1px solid rgba(255,255,255,0.07)'
                                                }}
                                                padding="none"
                                            >
                                                {cell}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            {(!rawData || table.length === 0) && (
                <Box sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>
                    No match data loaded.
                </Box>
            )}
        </Box>
    )
}
