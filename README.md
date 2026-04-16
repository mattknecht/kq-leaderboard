# KQ Leaderboard Overlay

A live leaderboard overlay for Killer Queen arcade, powered by [HiveMind](https://kqhivemind.com) and [kq.style](https://kq.style).
Thanks to Abby for Hivemind and Kevin J for building the leaderboard server.

Tracks cumulative stats across games at your venue and displays a cycling leaderboard overlay for use in OBS or a browser source.

```
KQ Cabinet → HiveMind → bridge.js → kq.style → index.html (OBS overlay)
```

---

## Requirements

- [Node.js](https://nodejs.org) (v18 or newer)
- The `ws` package — run `npm install` in this folder
- Your cabinet ID(s) from [kqhivemind.com](https://kqhivemind.com)
- Players must be signed in to HiveMind on the cabinet for their stats to be tracked

---

## Setup

### 1. Configure bridge.js

Open `bridge.js` and edit the configuration block at the top:

```js
const CABINET_IDS = [1, 2, 3];    // your HiveMind cabinet ID(s)
const SCENE       = "myscene";   // a unique name for your venue's leaderboard
```

`SCENE` can be anything — it creates a leaderboard namespace on kq.style. Pick something unique to your venue so it doesn't mix with other scenes.

### 2. Configure index.html

Open `index.html` and make sure `SCENE` matches what you set in `bridge.js`:

```js
const SCENE = "myscene"; // can pull stats from any scene that exists, probably going to just be what you have in bridge.js
```

### 3. Run the bridge

```bash
npm install
node bridge.js
```

Leave this running during your event. It will automatically reconnect if the connection drops.

### 4. Add the overlay to OBS

Add `index.html` as a **Browser Source** in OBS. Set width to `400` and height to `300`. The overlay will cycle through leaderboard categories automatically.

---

## Configuration options

### bridge.js

| Option | Default | Description |
|--------|---------|-------------|
| `CABINET_IDS` | — | HiveMind cabinet ID(s) to listen to. Single number or array. |
| `SCENE` | — | Unique scene name for your leaderboard. Must match `index.html`. |
| `SEND_CASUAL_GAMES` | `true` | Include casual (non-match) games in stats. |
| `SEND_TOURNAMENT_GAMES` | `true` | Include tournament match games in stats. |
| `SKIP_WARMUP` | `true` | Ignore warmup games within a match. |
| `SKIP_BONUS_MAPS` | `true` | Ignore bonus map games. |
| `LOG_CONNECTIONS` | `true` | Log connect/disconnect/reconnect events. |
| `LOG_GAME_EVENTS` | `true` | Log game-end events and skip reasons. |
| `LOG_PLAYER_DATA` | `false` | Log full mapped player stats per game (verbose). |
| `LOG_PAYLOAD` | `false` | Log the raw JSON payload sent to kq.style (verbose). |

### index.html

| Option | Default | Description |
|--------|---------|-------------|
| `SCENE` | — | Must match `SCENE` in `bridge.js`. |
| `STATS` | — | Array of leaderboard categories to cycle through. Edit to reorder or remove. |
| `DISPLAY_MS` | `6000` | How long each leaderboard is shown (milliseconds). |
| `FADE_MS` | `800` | Fade transition duration (milliseconds). |

---

## Leaderboard categories

| Label | What it tracks |
|-------|----------------|
| Regicide | Queen kills made while playing as queen |
| Usurper | Queen kills made while playing as a warrior |
| Top Shareholder | Berries deposited into the hive |
| Marksman | Berries kicked into the hive |
| Trailblazer | Snail distance moved |
| Tastiest Treat | Deaths by snail |
| Bump Ninja | Bumping an enemy who is killed within 2 seconds |

---

## Finding your cabinet ID

1. Go to [kqhivemind.com](https://kqhivemind.com)
2. Navigate to your cabinet's page
3. The ID is in the URL: `kqhivemind.com/cabinet/59/` → ID is `59`

---

## Notes

- Stats are **cumulative** — they build up across all games sent to your scene
- To reset the leaderboard, contact **@lucidsheep** on the KQ Discord
- Bonus maps are skipped by default as they skew stats
- Only players signed in to HiveMind will appear on the leaderboard
- Both bridge.js and index.html auto-reconnect if the connection drops
