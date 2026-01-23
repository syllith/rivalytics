# Rivalytics

**Rivalytics** is a proficiency and stat tracking tool for Marvel Rivals. It provides insights into your game performance, helping you track progress, analyze hero effectiveness, review match history, and monitor ranked performance—all through a clean interface.

Try it here: https://rivalytics.oblivonix.com/

## Features

### 🛡️ Proficiency Tracking

* **Capture & Analyze**: Screenshot your in-game proficiency screen. Rivalytics extracts data to populate a table, perfect for checking progress mid-game.
* **Detailed Game History**: Easily step through past matches to see exactly when you gained proficiency points, helping identify the most rewarding challenges for your playstyle or chosen character.
* **Smart Predictions**: Estimates the number of matches remaining until your next rank-up or challenge completion.
* **Challenge Insights**: Clearly tracks proficiency points gained from each challenge per match.
* **Game Simulations**: Simulate future matches based on your historical performance for informed predictions.

> **Privacy**: Rivalytics asks for user consent before capturing the screen, captures only necessary information, and never stores personal or sensitive data. See /src/comps/Proficiency/Proficiency.jsx for more information.

![Proficiency Tracker](https://skydrive.oblivonix.com/files/Marvel%20Rivals/rivalytics/proficiency.jpg)

---

### 🎯 Hero Analytics

* **Hero Performance Summary**: Track metrics like hours played, kills, deaths, assists, damage, healing, and win percentages.
* **Effectiveness Rating**: Provides a comprehensive effectiveness score to help you quickly understand hero performance:

```
Effectiveness = (Win% × 40) + (KDA × 20) + (Damage per Match / 1000 × 6) + (Heal per Match / 1000 × 4) + (Damage per Min / 100 × 4) + (Heal per Min / 100 × 2) + (Accuracy × 10) + (Headshot% × 10) + (Survival Kills per Match × 5) − (Damage Taken per Match / 1000 × 5)
```

* **Sortable Table**: Easily sort your hero data to quickly compare performances across your roster.

![Hero Stats](https://skydrive.oblivonix.com/files/Marvel%20Rivals/rivalytics/heros.jpg)

---

### 📜 Match History

* **Quick Insights**: Get a clear overview of your recent matches, including results, scores, and timestamps.
* **Color-coded Results**: Quickly identify wins, losses, and disconnects through intuitive color-coding.
* **Sortable Entries**: Effortlessly sort match data to find patterns in your gameplay.

![Match History](https://skydrive.oblivonix.com/files/Marvel%20Rivals/rivalytics/matches.jpg)

---

### 📈 Ranked Progress

* **Progress Charting**: Visualize your Skill Rating (SR) over time with interactive charts.
* **Time-range Filters**: Use filters such as "All," "Last Month," and "Last Week" to review performance trends.
* **Visual Gains/Losses**: Clearly highlighted gains and drops make tracking rank changes straightforward.

![Ranked Progress](https://skydrive.oblivonix.com/files/Marvel%20Rivals/rivalytics/ranked.jpg)

---

## Security & Privacy

* **User Consent**: Users explicitly authorize each screen capture.
* **Minimal Data Capture**: Only the necessary screen area is captured, minimizing privacy concerns.
* **Transparent Notifications**: Browser notifications clearly indicate when the screen is being recorded.
* **No Data Storage**: Rivalytics does not store any captured images or personal data.

---

## Developer Information

For developers interested in contributing or running Rivalytics locally:

### Installation

```bash
git clone https://github.com/syllith/rivalytics.git
cd rivalytics
npm install
npm run dev
```

Local instance will be available at `http://localhost:5173`.

---

### Discord Bot Commands (Overview)

The repository includes a Discord bot (see `/bot` directory) that provides quick in-channel summaries.

Key command notes:

* `!matches <username>` – Shows ranked history deltas plus ONLY recent **competitive** matches. As of latest changes, non-competitive / casual / custom / practice modes are excluded (no relaxed fallback). This ensures data reflects strictly ranked performance context.
* Filtering logic lives in `bot/utils.js` (`isCompetitiveMode`) and is intentionally strict: it matches explicit `competitive|ranked|tournament` modes and ignores `unknown|custom|practice|training`.
* If a user has zero recent competitive matches, the matches section will simply be omitted while ranked history still displays.

Future enhancements (ideas):
* Optional flag to relax filtering when fewer than N competitive matches exist.
* Pagination for more than 10 competitive matches.
* Per-match RS delta overlay if API exposes reliable mapping.

---

### 👁️ Watchlist Automation (Discord Bot)

The bot now supports an automated watchlist feature that periodically posts combined `!matches` and `!scrims` reports for tracked users into a designated channel.

Commands:
* `!watch <username> [minutes]` – Add a user to the watchlist with optional custom interval (default: 30 minutes).
* `!unwatch <username>` – Remove a user from this server's watchlist.
* `!watchlist` – Display all currently watched users for this server, their intervals, and last run times.

Configuration (environment variables in `.env`):
* `WATCHLIST_INTERVAL_MINUTES` – Default interval between automated report posts (default: `30` minutes).
* `WATCHLIST_CHANNEL_NAME` – Name of the text channel where updates will be posted (default: `watchlist`).

Persistence:
* State is stored in `bot/watchlist.json` so restarts preserve the list (each entry tracks `username`, `addedAt`, `lastRun`, `intervalMinutes`, and `guildId`).

Behavior:
* Each server maintains its own watchlist. Players are associated with the server where they were added.
* Notifications are sent to each server's own `#watchlist` channel.
* On each interval, the bot posts two messages per user: one from `!matches` (ranked + recent competitive) followed by one from `!scrims` (scrim/unknown mode matches).
* Each user is run independently; failures for one user do not block others.
* A small initial delay triggers an early run shortly after startup so you don't wait a full interval.
* Per-user custom intervals are supported (e.g., `!watch player123 60` for hourly updates).

---
