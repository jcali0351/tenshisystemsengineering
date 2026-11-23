// The game leaderboards (leaderboard-arcade.html, leaderboard-station-defense.html, leaderboard-undercity.html).
// Reads https://tenshisystems.com/api/scores (tools/server/scores_service.py) and keeps itself up to date every 30 seconds.
// The page says which game it is with <main data-board="arcade|station|undercity">.
(function () {
  const host = document.querySelector("[data-board]");
  if (!host) return;
  const GAME = host.dataset.board;
  const API = "/api/scores";
  const fmtInt = n => Number(n || 0).toLocaleString("en-US");
  const fmtTime = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(x).padStart(2, "0")}`; };
  const fmtLong = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${fmtInt(h)}h ${m}m` : `${m}m ${s % 60}s`; };
  const ago = t => { const d = Date.now() / 1000 - t; return d < 90 ? "just now" : d < 3600 ? Math.round(d / 60) + " min ago" : d < 86400 ? Math.round(d / 3600) + " h ago" : d < 86400 * 30 ? Math.round(d / 86400) + " d ago" : new Date(t * 1000).toLocaleDateString(); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const result = r => r.won ? '<span class="lb-tag lb-win">Victory</span>' : '<span class="lb-tag">Fallen</span>';

  // Columns per game: [sort key or "", heading, cell]
  const COLS = {
    arcade: [
      ["score", "Score", r => `<b>${fmtInt(r.score)}</b>`], ["level", "Level", r => r.level], ["hits", "Hits", r => fmtInt(r.hits)],
      ["combo", "Best combo", r => "x" + r.combo], ["bosses", "Bosses", r => r.bosses], ["time", "Time played", r => fmtTime(r.time)],
    ],
    station: [
      ["score", "Score", r => `<b>${fmtInt(r.score)}</b>`], ["won", "Result", result], ["kills", "Aliens destroyed", r => fmtInt(r.kills)],
      ["waves", "Waves", r => r.waves], ["time", "Time played", r => fmtTime(r.time)],
    ],
    undercity: [
      ["score", "Score", r => `<b>${fmtInt(r.score)}</b>`], ["won", "Result", result], ["level", "Level", r => r.level],
      ["floor", "Deepest circle", r => r.floor], ["kills", "Kills", r => fmtInt(r.kills)], ["gold", "Gold", r => fmtInt(r.gold)],
      ["time", "Time played", r => fmtTime(r.time)],
    ],
  }[GAME];

  const me = (() => { try { return (localStorage.getItem("tenshi-player-name") || "").toLowerCase(); } catch (e) { return ""; } })();
  let period = "all", sort = "score", timer = 0;

  host.querySelector(".lb-head-row").innerHTML = `<th scope="col">#</th><th scope="col">Player</th>` +
    COLS.map(([key, label]) => `<th scope="col"><button type="button" data-sort="${key}">${label}</button></th>`).join("") + `<th scope="col">When</th>`;
  const body = host.querySelector(".lb-rows"), status = host.querySelector(".lb-status");

  async function load(quiet) {
    if (!quiet) status.textContent = "Loading…";
    try {
      const r = await fetch(`${API}?game=${GAME}&period=${period}&sort=${sort}&limit=50`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.status);
      render(data);
      status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · refreshes every 30 seconds`;
    } catch (e) {
      status.textContent = "The leaderboard couldn't be reached just now. It will try again in 30 seconds.";
    }
    clearTimeout(timer); timer = setTimeout(() => load(true), 30000);
  }

  function render({ rows, totals }) {
    const t = host.querySelector(".lb-totals");
    t.querySelector('[data-t="runs"]').textContent = fmtInt(totals.runs);
    t.querySelector('[data-t="players"]').textContent = fmtInt(totals.players);
    t.querySelector('[data-t="seconds"]').textContent = fmtLong(totals.seconds);
    t.querySelector('[data-t="best"]').textContent = fmtInt(totals.best);
    host.querySelectorAll("[data-sort]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sort === sort));
    body.innerHTML = rows.length ? rows.map((r, i) => `<tr class="${i < 3 ? "lb-top lb-top" + (i + 1) : ""}${me && r.name.toLowerCase() === me ? " lb-me" : ""}">
        <td class="lb-rank">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td><td class="lb-name">${esc(r.name)}</td>
        ${COLS.map(([, , cell]) => `<td>${cell(r)}</td>`).join("")}<td class="lb-when">${ago(r.at)}</td></tr>`).join("")
      : `<tr><td colspan="${COLS.length + 3}" class="lb-empty">No runs ${period === "all" ? "yet" : "in this period"}. Be the first: play, then post your run at the end.</td></tr>`;
  }

  host.querySelector(".lb-periods").addEventListener("click", e => {
    const b = e.target.closest("[data-period]"); if (!b) return;
    period = b.dataset.period;
    host.querySelectorAll("[data-period]").forEach(x => x.setAttribute("aria-pressed", x === b));
    load();
  });
  host.querySelector(".lb-head-row").addEventListener("click", e => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    sort = b.dataset.sort; load();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(true); });
  load();
})();
