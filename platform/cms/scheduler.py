"""
scheduler.py: publish on time. A blog post or page with a publish time goes live by itself: once a minute this checks
every live site for posts and pages whose time has come since its last deployment, and publishes the site again.
(Before, a scheduled post waited for the next manual Publish.) Off with TENSHI_SCHEDULER=0 (the tests turn it off).
"""

from __future__ import annotations

import logging
import os
import threading
import time

from . import db

LOG = logging.getLogger("tenshi.scheduler")
_started = False


def due(now: str | None = None) -> list[int]:
    """Live sites with a post or page that became due after their current deployment was made."""
    now = now or db.now()
    out = []
    for s in db.all("SELECT s.id, b.created_at AS built FROM sites s JOIN builds b ON b.id = s.current_build_id WHERE s.status = 'live'"):
        if db.one("SELECT 1 AS x FROM posts WHERE site_id = ? AND status = 'published' AND published_at > ? AND published_at <= ? LIMIT 1",
                  s["id"], s["built"], now) or \
           db.one("SELECT 1 AS x FROM pages WHERE site_id = ? AND publish_at != '' AND publish_at > ? AND publish_at <= ? LIMIT 1",
                  s["id"], s["built"], now):
            out.append(s["id"])
    return out


def run_once() -> list[int]:
    from . import sites
    done = []
    for site_id in due():
        try:
            sites.deploy(site_id, "Published on schedule")
            done.append(site_id)
        except Exception:  # noqa: BLE001 - one site's problem never stops the others
            LOG.exception("scheduled publish of site %s failed", site_id)
    return done


def _loop():
    while True:
        time.sleep(60)
        try:
            run_once()
        except Exception:  # noqa: BLE001
            LOG.exception("scheduler pass failed")


def start() -> None:
    global _started
    if _started or os.environ.get("TENSHI_SCHEDULER", "1") == "0":
        return
    _started = True
    threading.Thread(target=_loop, name="tenshi-scheduler", daemon=True).start()
