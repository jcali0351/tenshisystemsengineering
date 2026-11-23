#!/usr/bin/env python3
"""Tenshi game leaderboards: stores finished runs from the homepage games and serves the leaderboard pages.

Runs on the server as the systemd service "tenshi-scores" (see tools/server/setup.sh), listening on 127.0.0.1:9126.
Caddy sends https://tenshisystems.com/api/scores here. Python standard library only; data in SQLite.

    POST /api/scores   {"game": "arcade"|"station"|"undercity", "name": "...", "time": seconds, ...game stats}
    GET  /api/scores?game=arcade&period=all|month|week|today&sort=score&limit=50
         -> {"game", "period", "sort", "rows": [...], "totals": {"runs", "players", "seconds", "best"}}

The score is worked out here from the run's stats (the browser can't set it directly), and every number is checked
against what a real run could reach. Protection: same-origin check, size limit, a per-IP rate limit (40 runs an hour),
a name filter. Nothing personal is stored: the name the player typed, their stats and the date. IP addresses are only
kept in memory for the rate limit.
"""
import json
import os
import re
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("SCORES_PORT", "9126"))
DB = Path(os.environ.get("SCORES_DB", "/srv/tenshi/data/scores/scores.db"))
ORIGINS = {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://tenshisystems.com,https://www.tenshisystems.com").split(",") if o.strip()}
MAX_BODY = 4096
RATE, RATE_WINDOW = 40, 3600

# Each game: its stats (name -> (lowest, highest)), how the score is made from them, and the columns a board can sort by.
GAMES = {
    "arcade": {
        "stats": {"level": (1, 500), "hits": (0, 200000), "combo": (1, 999), "bosses": (0, 5000)},
        "score": lambda s: s["points"],
        "extra": {"points": (0, 50_000_000)},
        "sorts": ["score", "time", "level", "hits", "combo", "bosses"],
    },
    "station": {
        "stats": {"won": (0, 1), "kills": (0, 100000), "waves": (0, 2000)},
        "score": lambda s: s["kills"] * 10 + s["waves"] * 150 + (5000 + max(0, 3600 - s["time"]) * 2 if s["won"] else 0),
        "extra": {},
        "sorts": ["score", "time", "kills", "waves", "won"],
    },
    "undercity": {
        "stats": {"won": (0, 1), "level": (1, 999), "floor": (1, 999), "gold": (0, 100_000_000), "kills": (0, 1_000_000), "ascensions": (0, 999)},
        "score": lambda s: s["level"] * 100 + s["floor"] * 250 + s["gold"] // 10 + s["kills"] * 5 + s["ascensions"] * 2500 + (5000 if s["won"] else 0),
        "extra": {},
        "sorts": ["score", "time", "level", "floor", "kills", "gold", "won"],
    },
}
PERIODS = {"all": None, "month": 30 * 86400, "week": 7 * 86400, "today": 86400}
NAME_RE = re.compile(r"[^A-Za-z0-9 _.\-'!?]")
BLOCK = re.compile(r"fuck|shit|cunt|nigg|fag|bitch|whore|slut|rape|nazi|hitler|kkk|dick|cock|pussy|penis|vagina|porn|sex", re.I)

_hits, _lock, _db_lock = {}, threading.Lock(), threading.Lock()


def db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def init():
    with _db_lock, db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY, game TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL,
            time INTEGER NOT NULL, stats TEXT NOT NULL, at INTEGER NOT NULL)""")
        con.execute("CREATE INDEX IF NOT EXISTS runs_game_score ON runs (game, score DESC)")
        con.execute("CREATE INDEX IF NOT EXISTS runs_game_at ON runs (game, at)")


def rate_ok(ip):
    now = time.time()
    with _lock:
        hits = [t for t in _hits.get(ip, []) if now - t < RATE_WINDOW]
        ok = len(hits) < RATE
        if ok:
            hits.append(now)
        _hits[ip] = hits
        return ok


def clean_name(v):
    v = NAME_RE.sub("", str(v or "")).strip()[:16]
    if not v or BLOCK.search(v.replace(" ", "")):
        return None
    return v


def as_int(v, lo, hi):
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def take_run(body):
    game = GAMES.get(body.get("game"))
    if not game:
        return None, "unknown game"
    name = clean_name(body.get("name"))
    if not name:
        return None, "please choose a different name"
    secs = as_int(body.get("time"), 5, 86400 * 3)
    if secs is None:
        return None, "run too short"
    stats = {"time": secs}
    for key, (lo, hi) in {**game["stats"], **game["extra"]}.items():
        n = as_int(body.get(key, lo), lo, hi)
        if n is None:
            return None, f"bad {key}"
        stats[key] = n
    # What a real run can reach in the time it took.
    if body["game"] == "arcade" and stats["points"] > secs * 2500 + 5000:
        return None, "score out of range"
    if body["game"] == "station" and stats["kills"] > secs * 8 + 50:
        return None, "kills out of range"
    if body["game"] == "undercity" and (stats["kills"] > secs * 4 + 50 or stats["floor"] > stats["level"] * 3 + 10 + stats["ascensions"] * 10):
        return None, "stats out of range"
    score = int(game["score"](stats))
    stats.pop("points", None)
    return {"game": body["game"], "name": name, "score": score, "time": secs, "stats": stats}, None


def board(q):
    game = (q.get("game") or ["arcade"])[0]
    if game not in GAMES:
        return 400, {"error": "unknown game"}
    period = (q.get("period") or ["all"])[0]
    period = period if period in PERIODS else "all"
    sort = (q.get("sort") or ["score"])[0]
    sort = sort if sort in GAMES[game]["sorts"] else "score"
    try:
        limit = max(1, min(100, int((q.get("limit") or ["50"])[0])))
    except ValueError:
        limit = 50
    since = int(time.time()) - PERIODS[period] if PERIODS[period] else 0
    order = {"score": "score DESC", "time": "time DESC"}.get(sort, f"CAST(json_extract(stats, '$.{sort}') AS INTEGER) DESC, score DESC")
    with _db_lock, db() as con:
        rows = con.execute(f"SELECT name, score, time, stats, at FROM runs WHERE game = ? AND at >= ? ORDER BY {order}, at ASC LIMIT ?",
                           (game, since, limit)).fetchall()
        t = con.execute("SELECT COUNT(*) runs, COUNT(DISTINCT lower(name)) players, COALESCE(SUM(time), 0) seconds, COALESCE(MAX(score), 0) best "
                        "FROM runs WHERE game = ? AND at >= ?", (game, since)).fetchone()
    out = [{"name": r["name"], "score": r["score"], "time": r["time"], "at": r["at"], **json.loads(r["stats"])} for r in rows]
    return 200, {"game": game, "period": period, "sort": sort, "rows": out, "totals": dict(t)}


class Handler(BaseHTTPRequestHandler):
    server_version = "tenshi-scores"

    def log_message(self, *a):
        pass

    def reply(self, code, data, cache=0):
        b = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", f"public, max-age={cache}" if cache else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(b)

    def ip(self):
        return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()

    def do_GET(self):
        u = urlparse(self.path)
        if u.path.rstrip("/") != "/api/scores":
            return self.reply(404, {"error": "not found"})
        code, data = board(parse_qs(u.query))
        self.reply(code, data, cache=10)

    def do_POST(self):
        if urlparse(self.path).path.rstrip("/") != "/api/scores":
            return self.reply(404, {"error": "not found"})
        origin = self.headers.get("Origin", "")
        if origin and origin not in ORIGINS:
            return self.reply(403, {"error": "forbidden"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self.reply(413, {"error": "too large"})
        try:
            body = json.loads(self.rfile.read(n))
            assert isinstance(body, dict)
        except Exception:
            return self.reply(400, {"error": "bad request"})
        if not rate_ok(self.ip()):
            return self.reply(429, {"error": "too many runs, try again later"})
        run, err = take_run(body)
        if err:
            return self.reply(400, {"error": err})
        now = int(time.time())
        with _db_lock, db() as con:
            con.execute("INSERT INTO runs (game, name, score, time, stats, at) VALUES (?, ?, ?, ?, ?, ?)",
                        (run["game"], run["name"], run["score"], run["time"], json.dumps(run["stats"]), now))
            rank = con.execute("SELECT COUNT(*) + 1 FROM runs WHERE game = ? AND score > ?", (run["game"], run["score"])).fetchone()[0]
        self.reply(200, {"ok": True, "score": run["score"], "rank": rank})


if __name__ == "__main__":
    init()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
