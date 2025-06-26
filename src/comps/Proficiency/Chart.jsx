import { useMemo } from 'react';
import { Box } from '@mui/material';
import { Line } from 'react-chartjs-2';

/**
 * Chart component for rendering proficiency graph.
 * @param {Object[]} chartHistory - Array of history entries with .time and .stats.proficiencyCurrent
 */
export default function Chart({ chartHistory }) {
    const chartData = useMemo(() => ({
        labels: chartHistory.map(e => new Date(e.time)),
        datasets: [{
            label: 'Proficiency',
            data: chartHistory.map(e => e.stats.proficiencyCurrent),
            borderColor: 'white',
            backgroundColor: 'white',
            fill: false,
            tension: 0.3,
            pointBackgroundColor: 'white'
        }]
    }), [chartHistory]);

    const chartOptions = useMemo(() => {
        const vals = chartHistory.map(e => e.stats.proficiencyCurrent);
        const yMin = vals.length ? Math.min(...vals) : 0;
        const yMax = vals.length ? Math.max(...vals) : 0;
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute', tooltipFormat: 'h:mm a',
                        displayFormats: { minute: 'h:mm a', hour: 'h:mm a' }
                    },
                    ticks: {
                        color: 'white',
                        callback: v => new Date(v)
                            .toLocaleTimeString([], {
                                hour: 'numeric', minute: '2-digit', hour12: true
                            })
                    },
                    grid: { color: 'rgba(255,255,255,0.2)' }
                },
                y: {
                    beginAtZero: false,
                    suggestedMin: Math.floor(yMin * 0.9),
                    suggestedMax: Math.ceil(yMax * 1.1),
                    title: { display: true, text: 'Proficiency', color: 'white' },
                    ticks: { color: 'white' },
                    grid: { color: 'rgba(255,255,255,0.2)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { titleColor: 'white', bodyColor: 'white' }
            }
        };
    }, [chartHistory]);

    if (!chartHistory || chartHistory.length < 2) return null;
    return (
        <Box sx={{ width: '100%', height: 300 }}>
            <Line data={chartData} options={chartOptions} />
        </Box>
    );
}
