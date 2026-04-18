// debug-hivemind.js — observe raw HiveMind WebSocket messages for a set of cabinets
// Run with: node debug-hivemind.js
// Does NOT send anything to kq.style.
//
// Useful for verifying:
//   - "match" events arrive before "gameend" (they do — cabinet state is always current at game end)
//   - warmup detection: current_match.is_warmup is set at match_selected time, stays true through the warmup game
//   - tournament detection: match_type="tournament" + current_match != null is reliable; API tournament_match field is not (can be null for real tournament games)
//   - bonus/beginner maps: API returns "Beginner" / "Beginner Pt2" (not "Bonus*"), WS uses "map_beginner" / "map_beginner_part2"
//   - matchstats and matchend message types carry full bracket/match context after a match completes

const CABINET_IDS = [];
const HIVEMIND_WS = "wss://kqhivemind.com/ws/gamestate";

const WebSocket = require("ws");
const https = require("https");

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

const hm = new WebSocket(HIVEMIND_WS);

hm.on("open", () => {
  console.log("[HiveMind] Connected — listening for all messages (not sending anything)\n");
  CABINET_IDS.forEach((id) => {
    hm.send(JSON.stringify({ type: "subscribe", cabinet_id: id }));
  });
  console.log(`[HiveMind] Subscribed to cabinets: ${CABINET_IDS.join(", ")}\n`);
});

hm.on("message", (raw) => {
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  if (data.type === "cabinetOffline") return;
  if (!CABINET_IDS.includes(data.cabinet_id)) return;

  console.log(`[HiveMind] Message type: ${data.type}`);
  console.log(JSON.stringify(data, null, 2));

  // If it's a game end, also fetch the full game and stats
  if (data.type === "gameend") {
    const gameId = data.game_id;
    console.log(`[WS] current_match=${JSON.stringify(data.current_match)}`);
    console.log(`\n[HiveMind] Fetching game details for ${gameId}...`);
    fetchJson(`https://kqhivemind.com/api/game/game/${gameId}/`).then((game) => {
      console.log(`[Game ${gameId}] match=${JSON.stringify(game.match)} tournament_match=${JSON.stringify(game.tournament_match)} qp_match=${JSON.stringify(game.qp_match)} map_name=${game.map_name}`);
    }).catch(console.error);
  }

  console.log("─".repeat(60) + "\n");
});

hm.on("close", () => console.log("[HiveMind] Disconnected"));
hm.on("error", (e) => console.error("[HiveMind] Error:", e.message));
