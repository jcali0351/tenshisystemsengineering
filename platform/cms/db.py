"""
db.py: the database.

SQLite keeps the whole database in one file (cms_data/tenshi.db). Python has SQLite built in, so there's nothing
to install. Each table below has a comment saying what it holds. JSON columns (ending in _json) hold structured
data such as a business profile or a page's blocks.

How to use it from other files:
    from . import db
    site = db.one("SELECT * FROM sites WHERE id = ?", site_id)       # one row as a dict, or None
    rows = db.all("SELECT * FROM media WHERE site_id = ?", site_id)  # a list of dicts
    new_id = db.run("INSERT INTO ...", value1, value2)               # change something; returns the new row's id
"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from . import config

SCHEMA = """
-- People who can sign in to the CMS. role: 'admin' (everything) or 'editor' (content only)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'editor',
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);

-- Failed sign-ins, for rate limiting (auth.py): who (IP + email) and when (unix seconds). Old rows are pruned.
CREATE TABLE IF NOT EXISTS login_failures (
  id INTEGER PRIMARY KEY, ip TEXT NOT NULL, email TEXT NOT NULL, at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_ip ON login_failures (ip, at);

-- Client websites. profile_json is the Business Data Engine profile (company, services, staff …).
-- theme_json holds the site's own colour/font choices on top of its template.
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, subdomain TEXT UNIQUE NOT NULL, template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | live | paused
  profile_json TEXT NOT NULL, theme_json TEXT NOT NULL DEFAULT '{}',
  current_build_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- Old versions of each business profile (so changes can be undone)
CREATE TABLE IF NOT EXISTS profile_revisions (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, profile_json TEXT NOT NULL, user_id INTEGER, created_at TEXT NOT NULL
);

-- Pages of a site. blocks_json is the list of blocks the page builder arranges (hero, gallery, form …).
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0, in_menu INTEGER NOT NULL DEFAULT 1,
  seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '',
  blocks_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
  UNIQUE (site_id, slug)
);

-- The Media Center: folders, then every uploaded file
CREATE TABLE IF NOT EXISTS media_folders (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, parent_id INTEGER, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, folder_id INTEGER,
  kind TEXT NOT NULL,                             -- image | svg | video | pdf | audio | file
  filename TEXT NOT NULL,                         -- the name it was uploaded with
  stored TEXT NOT NULL,                           -- the file's name on disk (in cms_data/media/<site>/)
  mime TEXT NOT NULL, bytes INTEGER NOT NULL, width INTEGER, height INTEGER,
  title TEXT NOT NULL DEFAULT '', alt TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',       -- tags: comma separated
  variants_json TEXT NOT NULL DEFAULT '{}',       -- resized copies: {"320": "x-320.webp", …}
  created_at TEXT NOT NULL
);

-- Gallery albums and the pictures in them
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT 'masonry',         -- masonry | grid | carousel
  description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS album_items (
  id INTEGER PRIMARY KEY, album_id INTEGER NOT NULL, media_id INTEGER NOT NULL, caption TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

-- Portfolio items (projects, case studies). before/after are pictures for the before-and-after slider.
CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  cover_media_id INTEGER, before_media_id INTEGER, after_media_id INTEGER, album_id INTEGER,
  position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

-- Deployments: every time a site is published, the finished website is kept in cms_data/builds/<id>/
CREATE TABLE IF NOT EXISTS builds (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, status TEXT NOT NULL,   -- building | ready | failed
  pages INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, seconds REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '', log TEXT NOT NULL DEFAULT '', user_id INTEGER, created_at TEXT NOT NULL
);

-- Backups of a site (its data and media in one ZIP), for Restore
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, file TEXT NOT NULL, bytes INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);

-- Messages sent through the forms on client sites (leads)
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, page TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',             -- new | contacted | won | lost
  created_at TEXT NOT NULL
);

-- Visits to client sites: one row per site, page and day (no cookies, no personal data)
CREATE TABLE IF NOT EXISTS visits (
  site_id INTEGER NOT NULL, page TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, page, day)
);

-- Per-site settings that aren't business data, one row per key. Widgets keep their site settings here under
-- "widget:<name>" (e.g. widget:store = the site's Shopify connection: domain, PUBLIC Storefront token, mode …).
-- Created automatically at start-up (db.setup), so existing databases get it without a manual migration.
CREATE TABLE IF NOT EXISTS site_settings (
  site_id INTEGER NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, key)
);

-- Who belongs to which site (members.py). role: 'owner' (the client: store connection, security, brand lock) or
-- 'editor' (content). CMS admins don't need a row: they can do everything everywhere.
CREATE TABLE IF NOT EXISTS site_members (
  site_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'editor', created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, user_id)
);
CREATE INDEX IF NOT EXISTS site_members_user ON site_members (user_id);

-- Earlier versions of a page (the builder's Page settings › Earlier versions). A snapshot of the page as it was is
-- taken before a save when the last one is over 5 minutes old, and before a restore; the newest 50 are kept per page.
CREATE TABLE IF NOT EXISTS page_revisions (
  id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL, site_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '',
  blocks_json TEXT NOT NULL DEFAULT '[]', seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '',
  user_id INTEGER, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS page_revisions_page ON page_revisions (page_id, id);

-- Posts to a live site's contact form, for the rate limit (app.serve_site). ip_hash, not the address itself.
-- Rows older than a day are removed as new ones arrive.
CREATE TABLE IF NOT EXISTS form_posts (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, ip_hash TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS form_posts_site ON form_posts (site_id, created_at);

-- Blog posts of a site (posts.py). body is HTML cleaned with nh3 on save. status: draft | published; a published
-- post appears once published_at (UTC) has passed, on the next Publish. Pages are post-<slug>.html, plus feed.xml.
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', cover_media_id INTEGER, tags TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (site_id, slug)
);
CREATE INDEX IF NOT EXISTS posts_site ON posts (site_id, status, published_at);

-- What happened, by whom (the Recent Activity list)
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, user_id INTEGER, site_id INTEGER, action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS media_site ON media (site_id, folder_id);
CREATE INDEX IF NOT EXISTS pages_site ON pages (site_id, position);
CREATE INDEX IF NOT EXISTS leads_site ON leads (site_id, created_at);
-- Files visitors attached to a form (forms.py); the files themselves are in DATA_DIR/form-uploads/<site id>/
CREATE TABLE IF NOT EXISTS lead_files (
  id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, site_id INTEGER NOT NULL, field TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL, stored TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lead_files_lead ON lead_files (lead_id);
CREATE INDEX IF NOT EXISTS activity_time ON activity (created_at);
CREATE TABLE IF NOT EXISTS lead_emails (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, lead_id INTEGER, status TEXT NOT NULL, sent_to TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lead_emails_site ON lead_emails (site_id, created_at);
-- A site's own domains (www.example.com), besides <subdomain>.<SITES_DOMAIN>. domains.py; Caddy's /__tls/ask.
CREATE TABLE IF NOT EXISTS site_domains (
  domain TEXT PRIMARY KEY, site_id INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS site_domains_site ON site_domains (site_id);
-- Modules (cms/widgets/*): outside data cached by the server (modcache.py), and what visitors send.
CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, block_key TEXT NOT NULL, event_slug TEXT NOT NULL, event_title TEXT NOT NULL,
  event_date TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, email TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'going', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rsvps_event ON rsvps (site_id, block_key, event_slug);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, block_key TEXT NOT NULL, service TEXT NOT NULL, staff TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL, start TEXT NOT NULL, minutes INTEGER NOT NULL, buffer_before INTEGER NOT NULL DEFAULT 0,
  buffer_after INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_day ON bookings (site_id, block_key, staff, day);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, block_key TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL, quote TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_site ON reviews (site_id, status);
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, ref TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result TEXT NOT NULL DEFAULT '', approved_by INTEGER, created_at TEXT NOT NULL,
  UNIQUE (site_id, ref)
);
CREATE TABLE IF NOT EXISTS widget_cache (
  site_id INTEGER NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (site_id, key)
);
"""

SCHEMA_EXTRA = """
-- Trash (trash.py): deleted pages, posts and media, kept 30 days so they can be restored. data_json is the deleted row
-- (and for media its gallery places); a media file stays on disk until the trash entry is purged.
CREATE TABLE IF NOT EXISTS trash (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL,
  user_id INTEGER, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trash_site ON trash (site_id, created_at);

-- Redirects (redirects.py): an old address on a live site sends visitors to a new one. from_path is like /old-page or
-- /blog/* (a trailing * matches the rest); to is a page, a path or an https:// address. code: 301 (moved) or 302.
CREATE TABLE IF NOT EXISTS redirects (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, from_path TEXT NOT NULL, to_url TEXT NOT NULL, code INTEGER NOT NULL DEFAULT 301,
  hits INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, UNIQUE (site_id, from_path)
);
-- Addresses visitors asked for that weren't there (for the Redirects screen's "Not found" list); at most 300 per site.
CREATE TABLE IF NOT EXISTS not_found (
  site_id INTEGER NOT NULL, path TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, last_at TEXT NOT NULL, referrer TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (site_id, path)
);

-- Forgotten passwords (account.py): a one-use link, stored as a hash, valid for an hour.
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Custom content types (content_types.py): a site's own kinds of content (Listings, Tractors, Menu items) with their
-- own fields (fields_json: [{name, label, type, options, required}]), and the entries of each.
CREATE TABLE IF NOT EXISTS content_types (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, singular TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '[]', detail_pages INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, UNIQUE (site_id, slug)
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, type_id INTEGER NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'published', position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (type_id, slug)
);
CREATE INDEX IF NOT EXISTS entries_type ON entries (type_id, status, position);

-- Blog comments (comments.py): wait for approval; ip_hash, not the address itself.
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY, site_id INTEGER NOT NULL, post_slug TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', ip_hash TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments (site_id, post_slug, status);
"""

# Columns added after the first release. setup() adds any that an older database lacks (SQLite: ALTER TABLE ADD COLUMN).
COLUMNS = [
    ("users", "totp_secret", "TEXT NOT NULL DEFAULT ''"),        # two-step sign-in (account.py); '' = off
    ("users", "totp_backup", "TEXT NOT NULL DEFAULT ''"),        # hashes of the unused backup codes, comma separated
    ("posts", "user_id", "INTEGER"),                             # who wrote it (authors and contributors edit their own)
    ("posts", "lang", "TEXT NOT NULL DEFAULT ''"),
    ("pages", "lang", "TEXT NOT NULL DEFAULT ''"),               # '' = the site's main language (languages.py)
    ("pages", "translation_of", "INTEGER"),                      # the main-language page this one translates
    ("pages", "publish_at", "TEXT NOT NULL DEFAULT ''"),         # scheduled: left out of deployments until then (UTC)
]

_local = threading.local()


def connect():
    """One connection per thread (SQLite connections can't be shared between threads)."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        config.ensure_folders()
        conn = sqlite3.connect(config.DB_FILE, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")      # lets the site be read while the CMS writes
        _local.conn = conn
    return conn


def setup():
    """Create the tables if they don't exist yet. Safe to run every time the CMS starts."""
    apply_schema(connect())


def apply_schema(conn):
    """Every table and column on one SQLite connection (the CMS database, or a site's export copy)."""
    conn.executescript(SCHEMA)
    conn.executescript(SCHEMA_EXTRA)
    for table, column, decl in COLUMNS:
        have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    conn.commit()


def now():
    """The current time as text, e.g. '2026-11-20T09:15:00Z' (always UTC)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def one(sql, *params):
    row = connect().execute(sql, params).fetchone()
    return dict(row) if row else None


def all(sql, *params):  # noqa: A001  (the name reads well: db.all(...))
    return [dict(r) for r in connect().execute(sql, params).fetchall()]


def run(sql, *params):
    conn = connect()
    cur = conn.execute(sql, params)
    conn.commit()
    return cur.lastrowid


@contextmanager
def transaction():
    """Several changes that must all happen, or none: `with db.transaction() as conn: conn.execute(...)`"""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def j(text, default=None):
    """Read a JSON column. j(site['profile_json'])"""
    try:
        return json.loads(text) if text else (default if default is not None else {})
    except ValueError:
        return default if default is not None else {}


def dumps(value):
    """Write a JSON column."""
    return json.dumps(value, ensure_ascii=False)


def log(action, details="", user=None, site_id=None):
    """Write a line to Recent Activity."""
    run("INSERT INTO activity (user_id, site_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)",
        user["id"] if user else None, site_id, action, details, now())
