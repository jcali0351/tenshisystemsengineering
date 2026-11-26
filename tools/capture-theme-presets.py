#!/usr/bin/env python3
"""
Render the same sample CMS homepage in each of the five theme presets, in light and
dark, and save optimized WebP screenshots to img/themes/.

Run from the repository folder (needs Google Chrome and the CMS Python packages):

    TENSHI_DATA=/tmp/tenshi-theme-shots platform/.venv or:
    /workspace/cms-venv/bin/python tools/capture-theme-presets.py

Uses a throw-away TENSHI_DATA folder (never the live cms_data). Nothing is deployed.
"""
from __future__ import annotations

import http.server
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLATFORM = ROOT / "platform"
SHOT_DIR = ROOT / "img" / "themes"

# Set before importing cms.
DATA = Path(os.environ.get("TENSHI_DATA") or tempfile.mkdtemp(prefix="tenshi-theme-shots-"))
os.environ["TENSHI_DATA"] = str(DATA)
sys.path.insert(0, str(PLATFORM))

from PIL import Image  # noqa: E402

from cms import db, demo, render, sites, theme  # noqa: E402
from cms import config  # noqa: E402

WIDTH, HEIGHT = 1440, 900
WEBP_WIDTH = 1440
WEBP_QUALITY = 82
PORT = int(os.environ.get("THEME_SHOT_PORT", "8765"))


def serve(folder: Path):
    directory = str(folder)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=directory, **kwargs)

        def log_message(self, *args):
            pass

    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Quiet)
    httpd.allow_reuse_address = True
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def chrome_shot(url: str, dest_png: Path):
    dest_png.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={WIDTH},{HEIGHT}",
        "--virtual-time-budget=8000",
        f"--screenshot={dest_png}",
        url,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
    if not dest_png.exists() or dest_png.stat().st_size < 1000:
        raise RuntimeError(f"Chrome did not write a screenshot to {dest_png}")


def to_webp(png: Path, webp: Path):
    im = Image.open(png).convert("RGB")
    if im.size[0] != WEBP_WIDTH:
        ratio = WEBP_WIDTH / im.size[0]
        im = im.resize((WEBP_WIDTH, max(1, round(im.size[1] * ratio))), Image.Resampling.LANCZOS)
    webp.parent.mkdir(parents=True, exist_ok=True)
    im.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
    return im.size


def main():
    print(f"CMS data: {DATA}", flush=True)
    config.ensure_folders()
    db.setup()
    site = demo.make_demo()
    if site is None:
        site = db.one("SELECT * FROM sites WHERE subdomain = 'ridgeline-builders'")
    if not site:
        raise SystemExit("demo site was not created")
    sid = site["id"]
    print(f"Sample site id={sid} subdomain={site['subdomain']}", flush=True)

    work = Path(tempfile.mkdtemp(prefix="theme-builds-"))
    httpd = serve(work)
    time.sleep(0.2)
    raw = work / "_raw"
    raw.mkdir(exist_ok=True)
    SHOT_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    try:
        for pid, preset in theme.PRESETS.items():
            for mode in ("light", "dark"):
                data = theme.clean({**preset, "preset": pid, "mode": mode})
                db.run("UPDATE sites SET theme_json = ?, updated_at = ? WHERE id = ?",
                       db.dumps(data), db.now(), sid)
                out = work / f"{pid}-{mode}"
                if out.exists():
                    shutil.rmtree(out)
                render.build_to(sites.get(sid), out, "export")
                index = out / "index.html"
                if not index.exists():
                    raise SystemExit(f"missing index.html in {out}")
                png = raw / f"{pid}-{mode}.png"
                url = f"http://127.0.0.1:{PORT}/{pid}-{mode}/index.html"
                print(f"Capture {pid} {mode} <- {url}", flush=True)
                chrome_shot(url, png)
                webp = SHOT_DIR / f"{pid}-{mode}.webp"
                size = to_webp(png, webp)
                kb = webp.stat().st_size // 1024
                print(f"  wrote {webp.relative_to(ROOT)} {size[0]}x{size[1]} {kb} KB", flush=True)
                results.append((pid, mode, webp, size, kb))
    finally:
        httpd.shutdown()

    print(f"\n{len(results)} screenshots in {SHOT_DIR}")
    for pid, mode, webp, size, kb in results:
        print(f"  {pid}-{mode}: {size[0]}x{size[1]} {kb} KB")


if __name__ == "__main__":
    main()
