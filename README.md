# Rivalytics

Rivalytics is a React-based tracker for Marvel Rivals player data. It aggregates career, match, and ranked statistics into four built-in views—Proficiency, Heroes, Matches, and Ranked—and presents them in a unified, theme-driven interface.

Running Instance: https://rivalytics.digi-safe.co/

---

## Features

### Proficiency Tracker
- **Screen-capture + OCR** of in-game proficiency  
- Per-challenge progress, gains, and “matches left” predictions  
- Undo, Clear, Simulation mode, and time-series charting  
- History persisted via LocalForage  

![Proficiency Tracker](https://skydrive.digi-safe.co/files/Marvel%20Rivals/rivalytics/proficiency.jpg)

### Hero Stats
- Consolidates per-hero career segments (hours, KDA, damage/heal rates, win%, effectiveness)  
- Sortable table with short-number formatting  
- Remembers sort state and table layout in localStorage  

![Hero Stats](https://skydrive.digi-safe.co/files/Marvel%20Rivals/rivalytics/heros.jpg)

### Match History
- Normalizes timestamps, scores, and outcomes  
- Color-coded rows for wins, losses, and disconnects  
- Persists last view in localStorage  

![Match History](https://skydrive.digi-safe.co/files/Marvel%20Rivals/rivalytics/matches.jpg)

### Ranked Progress
- Fetches historical SR snapshots (date/time, rank, score)  
- “All / Last Month / Last Week” filters + live line chart  
- Highlights gains/drops via green/red row backgrounds  

![Ranked Progress](https://skydrive.digi-safe.co/files/Marvel%20Rivals/rivalytics/ranked.jpg)

---

## Core Principles

1. **Modular & Extensible**  
   - Self-contained tab components; new views plug in via `renderTabContent()`  
2. **Offline-First & Persistent**  
   - Caches API results, recent usernames, and settings in localStorage/LocalForage  
3. **Responsive, Theme-Driven UI**  
   - Built on Material-UI with a custom dark theme; mobile-friendly layouts  
4. **Accurate & Predictive Analytics**  
   - OCR parsing with rollover handling; simulation uses historical averages + jitter  
   - Charts and metrics (pts/hour, matches left) derived from real timestamps  
5. **User-Centered Controls**  
   - Autocomplete of recent usernames with “clear all” and per-entry remove  
   - Confirmation dialogs for destructive actions; loading spinners and error feedback  

---

*Rivalytics* turns raw API feeds and on-screen captures into actionable insights, letting you track and predict your Marvel Rivals progression with minimal friction.
