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

// Register Chart.js components
ChartJS.register(
    CategoryScale, LinearScale, TimeScale, PointElement, LineElement,
    Title, Tooltip, Legend
)

function parseRankedTable(rawData) {
    if (!rawData || !rawData.data || !rawData.data.history || !rawData.data.history.data) return []
    const entries = rawData.data.history.data
    const header = ['Date', 'Rank', 'Score', 'Display Value']
    const rows = entries.map(rec => {
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
        return [`${date} ${time}`, rank, score, disp]
    })
    return [header, ...rows]
}

export default function Ranked({ rawData }) {
    const [table, setTable] = useState(() => {
        const saved = localStorage.getItem('ranked-table')
        return saved ? JSON.parse(saved) : []
    })
    const [timeFrame, setTimeFrame] = useState('all')

    // Save table to localStorage when it changes
    useEffect(() => {
        if (table.length > 0) {
            localStorage.setItem('ranked-table', JSON.stringify(table))
        }
    }, [table])

    // Parse rawData when it changes
    useEffect(() => {
        if (!rawData) {
            setTable([])
            return
        }
        setTable(parseRankedTable(rawData))
    }, [rawData])

    // Filter table data based on timeFrame
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

    // Process table data for chart
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
                tension: 0.3,
                pointBackgroundColor: 'white'
            }]
        }
    }, [filteredTable])

    // Chart options
    const chartOptions = useMemo(() => {
        // Extract score values to determine y-axis range
        const scores = table.slice(1).map(row => {
            const scoreStr = row[2]
            return parseInt(scoreStr.replace(/,/g, ''), 10) || 0
        })
        
        const ymin = scores.length ? Math.min(...scores) : 0
        const ymax = scores.length ? Math.max(...scores) : 0
        
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
                    suggestedMin: Math.max(0, Math.floor(ymin * 0.9)),
                    suggestedMax: Math.ceil(ymax * 1.1),
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
    }, [table])

    return (
        <Box pt={2}>
            {/* Conditionally render time range buttons */}
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
                    </ToggleButtonGroup>
                </Box>
            )}

            {/* Chart above the table */}
            {filteredTable.length > 1 && (
                <Box
                    sx={{
                        width: '100%',
                        height: 300,
                        mt: 3,
                        mb: 2,
                        p: 2,
                        bgcolor: 'rgba(30,30,40,0.92)',
                        boxShadow: 'none',
                        borderRadius: 2,
                        border: '1px solid rgba(255,255,255,0.07)'
                    }}
                >
                    <Line data={chartData} options={chartOptions} />
                </Box>
            )}

            {/* Table rendering */}
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
                            {table.slice(1).map((row, ri, arr) => {
                                const currScore = Number(String(row[2]).replace(/,/g, '')) || 0;
                                const nextRow = arr[ri + 1];
                                const nextScore = nextRow ? Number(String(nextRow[2]).replace(/,/g, '')) || 0 : currScore;

                                let bgColor;
                                if (nextRow) {
                                    if (currScore > nextScore) bgColor = "rgba(56, 183, 80, 0.18)"; // green (score went up)
                                    else if (currScore < nextScore) bgColor = "rgba(220, 38, 38, 0.18)"; // red (score went down)
                                    else bgColor = "rgba(120,120,120,0.13)"; // grey (no change)
                                } else {
                                    bgColor = "rgba(120,120,120,0.13)"; // last row, no comparison
                                }

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
                                                {/* Format the Score column (index 2) with commas */}
                                                {ci === 2
                                                    ? (Number(cell).toLocaleString('en-US'))
                                                    : cell}
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
                    No ranked data loaded.
                </Box>
            )}
        </Box>
    )
}
