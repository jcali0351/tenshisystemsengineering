// Posting finished runs to the game leaderboards (window.TenshiScores), shared by the three homepage games.
// The server (tools/server/scores_service.py, /api/scores) works out the score from the stats and ranks the run.
// The pages: leaderboard-arcade.html, leaderboard-station-defense.html, leaderboard-undercity.html.
(function () {
  if (window.TenshiScores) return;
  const BOARDS = { arcade: "leaderboard-arcade.html", station: "leaderboard-station-defense.html", undercity: "leaderboard-undercity.html" };
  const base = (document.querySelector('script[src*="neon-scores.js"]')?.src || "").replace(/sandbox\/neon-scores\.js.*$/, "");
  const url = game => base + BOARDS[game];
  const getName = () => { try { return localStorage.getItem("tenshi-player-name") || ""; } catch (e) { return ""; } };
  const setName = n => { try { localStorage.setItem("tenshi-player-name", n); } catch (e) { /* storage blocked */ } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function post(game, name, stats) {
    const r = await fetch(base + "api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, name, ...stats }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "the leaderboard couldn't be reached");
    return data;
  }

  // A small "post your run" form for a game's end screen. stats: { time (seconds), ...that game's numbers }.
  function panel(game, stats) {
    const el = document.createElement("div");
    el.className = "ts-post";
    const tooShort = !stats || stats.time < 5;
    el.innerHTML = tooShort
      ? `<a class="ts-board" href="${url(game)}">🏆 LEADERBOARD</a>`
      : `<form class="ts-form"><label>NAME FOR THE LEADERBOARD <input maxlength="16" autocomplete="nickname" spellcheck="false" required value="${esc(getName())}"></label><button type="submit">POST RUN</button></form>
         <p class="ts-msg" aria-live="polite"></p><a class="ts-board" href="${url(game)}">🏆 VIEW LEADERBOARD</a>`;
    const form = el.querySelector("form");
    if (form) {
      // Keys typed here belong to the form, not to the game's shortcuts.
      for (const t of ["keydown", "keyup", "keypress"]) form.addEventListener(t, e => e.stopPropagation());
      form.addEventListener("submit", async e => {
        e.preventDefault(); e.stopPropagation();
        const name = form.querySelector("input").value.trim(), msg = el.querySelector(".ts-msg"), btn = form.querySelector("button");
        if (!name) return;
        btn.disabled = true; msg.textContent = "Posting…";
        try {
          const res = await post(game, name, stats);
          setName(name); form.remove();
          msg.innerHTML = `Posted! Score ${Number(res.score).toLocaleString("en-US")} · <b>#${res.rank}</b> all time.`;
        } catch (err) { btn.disabled = false; msg.textContent = "Couldn't post: " + err.message + "."; }
      });
    }
    return el;
  }

  window.TenshiScores = { post, panel, url, getName, setName };
})();
