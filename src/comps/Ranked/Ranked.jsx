import React, { useState, useEffect, useMemo } from 'react'
import {
    Box, Typography,
    Table, TableContainer, TableHead, TableRow, TableCell, TableBody, Paper, ToggleButton, ToggleButtonGroup
} from '@mui/material'
import {
    Chart as ChartJS, CategoryScale, LinearScale, TimeScale, PointElement, LineElement,
    Title, Tooltip, Legend
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Line } from 'react-chartjs-2'

// Register Chart.js components for chart rendering
ChartJS.register(
    CategoryScale, LinearScale, TimeScale, PointElement, LineElement,
    Title, Tooltip, Legend
)

// Parses ranked history data into a table (header + rows), including gain/loss calculation
function parseRankedTable(rawData) {
    if (!rawData || !rawData.data || !rawData.data.history || !rawData.data.history.data) return []
    const entries = rawData.data.history.data
    const header = ['Date', 'Rank', 'Score', 'Display Value', 'Gain'] // Add "Gain" column to header
    const rows = entries.map((rec, index) => {
        const [tsRaw, infoRaw] = rec
        const d = new Date(tsRaw)
        const date = d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        })
        const time = d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
        const val = infoRaw.value || infoRaw.Value || []
        const rank = typeof val[0] === 'string' ? val[0] : String(val[0] || '')
        const score = String(val[1] || '')
        const disp = infoRaw.displayValue || infoRaw.DisplayValue || ''
        // The last (oldest) row has no gain value since there is no previous entry to compare
        const gain = index === entries.length - 1 ? '' : 0 // Placeholder for "Gain" column
        return [`${date} ${time}`, rank, score, disp, gain]
    })

    // Calculate gain/loss for each row (difference in score from the next/older row)
    // Data from API is in reverse chronological order (newest first)
    for (let i = 0; i < rows.length - 1; i++) {
        const currScore = Number(String(rows[i][2]).replace(/,/g, '')) || 0
        const nextScore = Number(String(rows[i + 1][2]).replace(/,/g, '')) || 0
        rows[i][4] = currScore - nextScore
    }

    return [header, ...rows]
}

export default function Ranked({ rawData }) {
    // --- State: Table data and time frame filter ---
    // Table rows (header + data)
    const [table, setTable] = useState(() => {
        const saved = localStorage.getItem('ranked-table')
        return saved ? JSON.parse(saved) : []
    })
    // Time frame filter for chart/table (all, month, week)
    const [timeFrame, setTimeFrame] = useState('all')

    // Persist table to localStorage when it changes
    useEffect(() => {
        if (table.length > 0) {
            localStorage.setItem('ranked-table', JSON.stringify(table))
        }
    }, [table])

    // Parse and process rawData into table rows whenever rawData changes
    useEffect(() => {
        if (!rawData) {
            setTable([])
            return
        }
        setTable(parseRankedTable(rawData))
    }, [rawData])

    // Filter table data based on selected time frame
    const filteredTable = useMemo(() => {
        if (table.length <= 1) return table
        if (timeFrame === 'all') return table

        const now = new Date()
        let cutoff
        if (timeFrame === 'month') {
            cutoff = new Date(now)
            cutoff.setMonth(now.getMonth() - 1)
        } else if (timeFrame === 'week') {
            cutoff = new Date(now)
            cutoff.setDate(now.getDate() - 7)
        } else if (timeFrame === '3days') {
            cutoff = new Date(now)
            cutoff.setDate(now.getDate() - 3)
        } else if (timeFrame === '2days') {
            cutoff = new Date(now)
            cutoff.setDate(now.getDate() - 2)
        } else if (timeFrame === '1day') {
            cutoff = new Date(now)
            cutoff.setDate(now.getDate() - 1)
        }

        // Keep header + rows newer than cutoff
        return [
            table[0],
            ...table.slice(1).filter(row => {
                const dateObj = new Date(row[0])
                return dateObj >= cutoff
            })
        ]
    }, [table, timeFrame])

    // Prepare data for the rank score chart
    const chartData = useMemo(() => {
        if (filteredTable.length <= 1) return { labels: [], datasets: [] }
        const dataPoints = filteredTable.slice(1).map(row => {
            const dateStr = row[0]
            const dateObj = new Date(dateStr)
            const scoreStr = row[2]
            const score = parseInt(scoreStr.replace(/,/g, ''), 10) || 0
            return { date: dateObj, score }
        })
        dataPoints.sort((a, b) => a.date - b.date)
        return {
            labels: dataPoints.map(point => point.date),
            datasets: [{
                label: 'Rank Score',
                data: dataPoints.map(point => point.score),
                borderColor: 'white',
                backgroundColor: 'white',
                fill: false,
                tension: 0, // remove curve smoothing
                stepped: 'before', // step style aligned with point, keeps right edge flush
                pointBackgroundColor: 'white'
            }]
        }
    }, [filteredTable])

    // Chart.js options for the rank score chart
    const chartOptions = useMemo(() => {
        // Extract score values from currently filtered table (so axis zooms with timeframe)
        const scores = filteredTable.slice(1).map(row => {
            const scoreStr = row[2]
            return parseInt(scoreStr.replace(/,/g, ''), 10) || 0
        })
        const ymin = scores.length ? Math.min(...scores) : 0
        const ymax = scores.length ? Math.max(...scores) : 0
        let range = ymax - ymin
        // If all scores equal (range 0), fabricate a tiny range to show a flat line meaningfully
        if (range === 0) range = Math.max(50, Math.round(ymax * 0.01) || 25)
        // Tighter padding than before: 2% of range or minimum 10
        const pad = Math.max(range * 0.02, 10)
        const suggestedMin = Math.max(0, ymin - pad)
        const suggestedMax = ymax + pad

        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        tooltipFormat: 'MMM d, yyyy h:mm a',
                        displayFormats: { 
                            day: 'MMM d',
                            hour: 'MMM d, h:mm a' 
                        }
                    },
                    ticks: {
                        color: 'white',
                        autoSkip: true,
                        maxRotation: 45
                    },
                    grid: { color: 'rgba(255,255,255,0.2)' }
                },
                y: {
                    beginAtZero: false,
                    suggestedMin,
                    suggestedMax,
                    title: { display: true, text: 'Rank Score', color: 'white' },
                    ticks: { color: 'white' },
                    grid: { color: 'rgba(255,255,255,0.2)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleColor: 'white',
                    bodyColor: 'white',
                    callbacks: {
                        title: (tooltipItems) => {
                            const date = new Date(tooltipItems[0].parsed.x);
                            return date.toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            });
                        }
                    }
                }
            }
        }
    }, [filteredTable])

    return (
        <Box pt={2}>
            {/* --- Time range filter buttons --- */}
            {table.length > 0 && (
                <Box mb={2}>
                    <ToggleButtonGroup
                        value={timeFrame}
                        exclusive
                        onChange={(_, val) => val && setTimeFrame(val)}
                        size="small"
                        sx={{
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: 2,
                            mb: 1
                        }}
                    >
                        <ToggleButton value="all" sx={{ color: 'white', fontWeight: 'bold' }}>All</ToggleButton>
                        <ToggleButton value="month" sx={{ color: 'white', fontWeight: 'bold' }}>Last Month</ToggleButton>
                        <ToggleButton value="week" sx={{ color: 'white', fontWeight: 'bold' }}>Last Week</ToggleButton>
                        <ToggleButton value="3days" sx={{ color: 'white', fontWeight: 'bold' }}>3 Days</ToggleButton>
                        <ToggleButton value="2days" sx={{ color: 'white', fontWeight: 'bold' }}>2 Days</ToggleButton>
                        <ToggleButton value="1day" sx={{ color: 'white', fontWeight: 'bold' }}>1 Day</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            )}

            {/* --- Chart above the table --- */}
            {filteredTable.length > 1 && (
                <Box
                    sx={{
                        width: '100%',
                        height: 300,
                        mt: 3,
                        mb: 2,
                        p: 2,
                        borderRadius: 2,
                    }}
                >
                    <Line data={chartData} options={chartOptions} />
                </Box>
            )}

            {/* --- Table rendering --- */}
            {table.length > 0 && (
                <TableContainer
                    component={Paper}
                    sx={{ mb: 2, borderRadius: 2 }}
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
                            {table.slice(1).map((row, ri, arr) => {
                                // Color rows based on score change (gain/loss)
                                const currScore = Number(String(row[2]).replace(/,/g, '')) || 0
                                const nextRow = arr[ri + 1]
                                const nextScore = nextRow ? Number(String(nextRow[2]).replace(/,/g, '')) || 0 : currScore

                                let bgColor
                                if (nextRow) {
                                    if (currScore > nextScore) bgColor = "rgba(56, 183, 80, 0.18)" // green (score went up)
                                    else if (currScore < nextScore) bgColor = "rgba(220, 38, 38, 0.18)" // red (score went down)
                                    else bgColor = "rgba(120,120,120,0.13)" // grey (no change)
                                } else {
                                    bgColor = "rgba(120,120,120,0.13)" // last row, no comparison
                                }

                                return (
                                    <TableRow
                                        key={ri}
                                        sx={{
                                            height: '28px',
                                            backgroundColor: bgColor
                                        }}
                                    >
                                        {row.map((cell, ci) => {
                                            let cellColor = '#e0e0e0'
                                            if (ci === 4) { // "Gain" column
                                                const gain = Number(cell)
                                                if (gain > 0) cellColor = '#38b750' // green for gain
                                                else if (gain < 0) cellColor = '#dc2626' // red for loss
                                                else if (gain === 0) cellColor = '#aaa' // grey for no change
                                            }

                                            return (
                                                <TableCell
                                                    key={ci}
                                                    sx={{
                                                        fontSize: '0.75rem',
                                                        px: 0.25,
                                                        py: 0.25,
                                                        color: cellColor,
                                                        borderBottom: '1px solid rgba(255,255,255,0.07)'
                                                    }}
                                                    padding="none"
                                                >
                                                    {/* Format Score with commas; for Gain, leave blank cell empty instead of 0 */}
                                                    {ci === 2
                                                        ? Number(cell).toLocaleString('en-US')
                                                        : ci === 4
                                                            ? (cell === '' || cell === null || cell === undefined
                                                                ? ''
                                                                : Number(cell).toLocaleString('en-US'))
                                                            : cell}
                                                </TableCell>
                                            )
                                        })}
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            {/* Show message if no data loaded */}
            {(!rawData || table.length === 0) && (
                <Box sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>
                    No ranked data loaded.
                </Box>
            )}
        </Box>
    )
}
