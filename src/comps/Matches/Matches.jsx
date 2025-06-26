import React, { useState, useEffect } from 'react'
import {
    Box,
    Table,
    TableContainer,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Paper,
    Typography
} from '@mui/material'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';

// Converts an array of match objects into a table (header + rows) for display
function matchesToTable(matches) {
    const header = [
        "Date/Time", "Map", "Mode", "Result", "Kills", "Deaths", "Damage", "Duration", "K/D"
    ]
    const rows = matches.map(match => {
        const meta = match.metadata;
        // Find the 'overview' segment for stats
        const overview = match.segments.find(seg => seg.type === "overview");
        const stats = overview?.stats || {};
        return [
            // Format date and time for display
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
            // Capitalize first letter of result (e.g. 'Win', 'Loss')
            (overview?.metadata?.result || "-").replace(/^./, c => c.toUpperCase()),
            stats.kills?.displayValue ?? "-",
            stats.deaths?.displayValue ?? "-",
            stats.totalHeroDamage?.displayValue ?? "-",
            // Format duration as mm:ss
            stats.timePlayed?.displayValue?.replace("m ", ":").replace("s", "") ?? "-",
            stats.kdRatio?.displayValue ?? "-"
        ];
    });
    return [header, ...rows];
}

// Calculates win rate (%) from the table rows
function calculateWinRate(matches) {
    const totalMatches = matches.length;
    const wins = matches.filter(match => {
        const result = (match[3] || "").toLowerCase();
        return result === "win";
    }).length;
    return totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(2) : "0.00";
}

export default function Matches({ rawData }) {
    // --- State: Table data and sorting ---
    // Table rows (header + data)
    const [table, setTable] = useState(() => {
        const saved = localStorage.getItem('matches-table')
        return saved ? JSON.parse(saved) : []
    })
    // Column to sort by
    const [sortCol, setSortCol] = useState(() => {
        const saved = localStorage.getItem('matches-sortCol')
        return saved ? Number(saved) : 0
    })
    // Sort direction ('asc' or 'desc')
    const [sortDir, setSortDir] = useState(() => {
        return localStorage.getItem('matches-sortDir') || 'asc'
    })

    // Persist table to localStorage when it changes
    useEffect(() => {
        if (table.length > 0) {
            localStorage.setItem('matches-table', JSON.stringify(table))
        }
    }, [table])

    // Persist sortCol and sortDir to localStorage when they change
    useEffect(() => {
        localStorage.setItem('matches-sortCol', sortCol)
    }, [sortCol])

    useEffect(() => {
        localStorage.setItem('matches-sortDir', sortDir)
    }, [sortDir])

    // Parse and process rawData into table rows whenever rawData changes
    useEffect(() => {
        if (!rawData || !rawData.data || !rawData.data.matches) {
            setTable([])
            return
        }
        setTable(matchesToTable(rawData.data.matches))
    }, [rawData])

    // Memoized sorted table rows (excluding header)
    const sortedRows = React.useMemo(() => {
        if (table.length <= 1) return [];
        const rows = [...table.slice(1)];
        rows.sort((a, b) => {
            const aVal = a[sortCol];
            const bVal = b[sortCol];
            // Try numeric sort, fallback to string
            const aNum = parseFloat(String(aVal).replace(/[^0-9.-]+/g, ""));
            const bNum = parseFloat(String(bVal).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
            }
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return rows;
    }, [table, sortCol, sortDir]);

    // Calculate win rate for display
    const winRate = table.length > 1 ? calculateWinRate(table.slice(1)) : "0.00";

    return (
        <Box pt={2}>
            {/* Only show table if there is data */}
            {table.length > 0 && (
                <>
                    <Typography
                        variant="body2"
                        sx={{
                            textAlign: 'right',
                            color: '#fff',
                            mb: 1,
                            fontSize: '0.85rem'
                        }}
                    >
                        Win Rate: {winRate}%
                    </Typography>
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
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                color: '#fff',
                                                backgroundColor: 'rgba(255,255,255,0.04)',
                                                borderBottom: '1px solid rgba(255,255,255,0.12)'
                                            }}
                                            padding="none"
                                            onClick={() => {
                                                // Toggle sort direction or change sort column
                                                if (sortCol === i) {
                                                    setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                                                } else {
                                                    setSortCol(i);
                                                    setSortDir('asc');
                                                }
                                            }}
                                        >
                                            <Box display="flex" alignItems="center">
                                                {h}
                                                {sortCol === i && (
                                                    sortDir === 'asc'
                                                        ? <ArrowDropUpIcon fontSize="small" />
                                                        : <ArrowDropDownIcon fontSize="small" />
                                                )}
                                            </Box>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedRows.map((row, ri) => {
                                    // Color rows based on match result
                                    const result = (row[3] || "").toLowerCase();
                                    let bgColor;
                                    if (result === "win") bgColor = "rgba(56, 183, 80, 0.18)";
                                    else if (result === "loss" || result === "lose") bgColor = "rgba(220, 38, 38, 0.18)";
                                    else if (result === "disconnect" || result === "left" || result === "left early") bgColor = "rgba(120,120,120,0.18)";
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
                </>
            )}
            {/* Show message if no data loaded */}
            {(!rawData || table.length === 0) && (
                <Box sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>
                    No match data loaded.
                </Box>
            )}
        </Box>
    )
}
