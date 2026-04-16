// bridge.js — run this with Node.js during the tournament
// Listens to HiveMind for game end events and forwards stats to kq.style

// ── Configuration ─────────────────────────────────────────────────────────────
const CABINET_IDS = [59, 28];        // HiveMind cabinet IDs to listen to
const SCENE       = "kqslc";         // kq.style scene name to send stats to

// ── Filters ───────────────────────────────────────────────────────────────────
const SEND_CASUAL_GAMES     = true;   // send stats from casual (non-match) games
const SEND_TOURNAMENT_GAMES = false;  // send stats from tournament match games
const SKIP_WARMUP           = true;   // ignore warmup games within a match
const SKIP_BONUS_MAPS       = true;   // ignore bonus map games

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_CONNECTIONS   = true;  // log when connecting/disconnecting/reconnecting
const LOG_GAME_EVENTS   = true;  // log when a game ends and whether it's skipped
// Debugging logs below — be careful enabling these during a tournament, they can be very verbose!
const LOG_PLAYER_DATA   = false; // log the full mapped player stats for each game
const LOG_PAYLOAD       = false; // log the raw JSON payload sent to kq.style

// ── WebSocket URLs ────────────────────────────────────────────────────────────
const HIVEMIND_WS = "wss://kqhivemind.com/ws/gamestate";
const KQSTYLE_WS  = "wss://kq.style/beehive";

// ── Internals ─────────────────────────────────────────────────────────────────
const WebSocket = require("ws");
const https = require("https");

const log  = (enabled, ...args) => { if (enabled) console.log(...args); };
const warn = (...args) => console.warn(...args);
const err  = (...args) => console.error(...args);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

let kqStyle;
const sendQueue = [];

function flushQueue() {
  while (sendQueue.length > 0 && kqStyle?.readyState === WebSocket.OPEN) {
    const payload = sendQueue.shift();
    kqStyle.send(payload);
    log(LOG_CONNECTIONS, "[kq.style] Sent queued game stats");
  }
}

function connectKqStyle() {
  kqStyle = new WebSocket(KQSTYLE_WS);
  kqStyle.on("open",  () => { log(LOG_CONNECTIONS, "[kq.style] Connected"); flushQueue(); });
  kqStyle.on("close", () => { log(LOG_CONNECTIONS, "[kq.style] Disconnected — reconnecting in 3s..."); setTimeout(connectKqStyle, 3000); });
  kqStyle.on("error", (e) => err("[kq.style] Error:", e.message));
}

function connectHivemind() {
  const hm = new WebSocket(HIVEMIND_WS);

  hm.on("open", () => {
    log(LOG_CONNECTIONS, "[HiveMind] Connected");
    CABINET_IDS.forEach((id) => {
      hm.send(JSON.stringify({ type: "subscribe", cabinet_id: id }));
    });
    log(LOG_CONNECTIONS, `[HiveMind] Subscribed to cabinets: ${CABINET_IDS.join(", ")}`);
  });

  hm.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === "cabinetOffline") return;
    if (data.type !== "gameend") return;
    if (!CABINET_IDS.includes(data.cabinet_id)) return;

    const gameId = data.game_id;
    log(LOG_GAME_EVENTS, `[HiveMind] Game ended: ${gameId} on cab ${data.cabinet_id}`);

    (async () => {
      try {
        const game = await fetchJson(`https://kqhivemind.com/api/game/game/${gameId}/`);
        const isTournament = game.current_match != null;
        const isWarmup     = game.current_match?.is_warmup === true;

        if (SKIP_BONUS_MAPS && game.map_name?.startsWith("Bonus")) {
          log(LOG_GAME_EVENTS, `[HiveMind] Skipping bonus map game ${gameId} (${game.map_name})`);
          return;
        }
        if (isWarmup && SKIP_WARMUP) {
          log(LOG_GAME_EVENTS, `[HiveMind] Skipping warmup game ${gameId}`);
          return;
        }
        if (!isTournament && !SEND_CASUAL_GAMES) {
          log(LOG_GAME_EVENTS, `[HiveMind] Skipping casual game ${gameId}`);
          return;
        }
        if (isTournament && !SEND_TOURNAMENT_GAMES) {
          log(LOG_GAME_EVENTS, `[HiveMind] Skipping tournament game ${gameId}`);
          return;
        }

        const stats = await fetchJson(`https://kqhivemind.com/api/game/game/${gameId}/stats/`);
        const byPlayer = stats.by_player ?? {};
        const humanPlayers = new Set(stats.human_players ?? []);
        const signedIn = stats.signed_in ?? {};

        // by_player is keyed by stat name, then player_id: by_player[stat][player_id] = value
        const stat = (statName, playerId) => byPlayer[statName]?.[playerId] ?? 0;

        const players = [...humanPlayers]
          .filter((id) => signedIn[id])
          .map((id) => ({
            id:                    String(signedIn[id].id),
            name:                  signedIn[id].name,
            kills_military:        stat("military_kills", id) - stat("queen_kills", id),
            kills_queen:           stat("queen_kills",            id),
            kills_queen_aswarrior: stat("kills_as_queen", id) > 0 ? 0 : stat("queen_kills", id),
            kills_queen_asqueen:   stat("kills_as_queen", id) > 0 ? stat("queen_kills", id) : 0,
            kills_all:             stat("kills",                  id),
            berries:               stat("berries",                id),
            berries_kicked:        stat("berries_kicked",         id),
            snail:                 stat("snail_distance",         id),
            deaths:                stat("deaths",                 id),
            warrior_uptime:        stat("warrior_uptime",         id) / 1000,
            warrior_ratio:         0,
            warrior_deaths:        stat("military_deaths",        id),
            warrior_life:          0,
            snail_deaths:          stat("eaten_by_snail",         id),
            jason_points:          0,
            bump_assists:          stat("bump_assists",           id),
            drone_kills_withberry: 0,
          }));

        log(LOG_PLAYER_DATA, "[HiveMind] Mapped players:", JSON.stringify(players, null, 2));

        if (players.length === 0) {
          log(LOG_GAME_EVENTS, `[HiveMind] No signed-in players for game ${gameId} — skipping`);
          return;
        }

        log(LOG_GAME_EVENTS, `[HiveMind] Forwarding ${players.length} players for game ${gameId}`);

        const payload = JSON.stringify({ scene: SCENE, type: "gameEnd", leaderboard: "", players });
        log(LOG_PAYLOAD, "[kq.style] Sending payload:", payload);

        if (kqStyle?.readyState === WebSocket.OPEN) {
          kqStyle.send(payload);
          log(LOG_GAME_EVENTS, "[kq.style] Stats sent");
        } else {
          sendQueue.push(payload);
          warn(`[kq.style] Not connected — queued game stats (${sendQueue.length} in queue)`);
        }
      } catch (e) {
        err(`[HiveMind] Error processing game ${gameId}:`, e.message);
      }
    })();
  });

  hm.on("close", () => { log(LOG_CONNECTIONS, "[HiveMind] Disconnected — reconnecting in 3s..."); setTimeout(connectHivemind, 3000); });
  hm.on("error", (e) => err("[HiveMind] Error:", e.message));
}

connectKqStyle();
connectHivemind();
