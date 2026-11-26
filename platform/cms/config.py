"""
config.py: where the CMS keeps things, and the few settings you might change.

Everything the CMS stores lives in ONE folder, platform/cms_data/ (not saved in git):
    tenshi.db      the database (SQLite: one file, no server to install)
    media/         uploaded files, one folder per site
    builds/        every deployment's finished website, one folder per build
    templates/     the Template Gallery (each template, with its old versions)
    backups/       site backups (ZIP)
    exports/       export packages (ZIP)
    secret.key     the key that signs login cookies (made automatically)

Settings can be changed with environment variables, e.g. in PowerShell:  $env:TENSHI_PORT = "9000"
"""

import os
import secrets
from pathlib import Path

PLATFORM_DIR = Path(__file__).resolve().parent.parent          # platform/
REPO_DIR = PLATFORM_DIR.parent                                   # the website repository
DATA_DIR = Path(os.environ.get("TENSHI_DATA", PLATFORM_DIR / "cms_data"))
DB_FILE = DATA_DIR / "tenshi.db"
MEDIA_DIR = DATA_DIR / "media"
BUILDS_DIR = DATA_DIR / "builds"
TEMPLATES_DIR = DATA_DIR / "templates"
BACKUPS_DIR = DATA_DIR / "backups"
EXPORTS_DIR = DATA_DIR / "exports"

STARTER_DESIGN = PLATFORM_DIR / "designs" / "starter"           # the block templates every new template starts from
GALLERY_FILE = REPO_DIR / "data" / "templates.json"              # the 16 designs shown on the public Portfolio page

HOST = os.environ.get("TENSHI_HOST", "127.0.0.1")
PORT = int(os.environ.get("TENSHI_PORT", "8000"))

# Client sites live at <subdomain>.<SITES_DOMAIN>. On your computer that's "localhost": browsers send
# johnsons-plumbing.localhost straight to this computer, no setup needed. On a real server it becomes "tenshisystems.com".
SITES_DOMAIN = os.environ.get("TENSHI_SITES_DOMAIN", "localhost")

# The address the CMS itself is reached at (used for links in emails and in built sites' forms)
PUBLIC_URL = os.environ.get("TENSHI_PUBLIC_URL", f"http://{HOST if HOST != '127.0.0.1' else 'localhost'}:{PORT}")

# The public website may send Launch requests here (launch.js LAUNCH_ENDPOINT). These sites are allowed to.
LAUNCH_ORIGINS = [o for o in os.environ.get("TENSHI_LAUNCH_ORIGINS",
                  "https://jcali0351.github.io,http://localhost:8770,http://127.0.0.1:8770").split(",") if o]

# Login cookie only over https (Secure flag): on when the CMS's public address is https, off for local http.
SECURE_COOKIES = os.environ.get("TENSHI_SECURE_COOKIES", "1" if PUBLIC_URL.startswith("https://") else "0") == "1"

# FastAPI's automatic API docs (/api/docs, /openapi.json): off unless TENSHI_API_DOCS=1 (local development only).
API_DOCS = os.environ.get("TENSHI_API_DOCS", "0") == "1"

MAX_UPLOAD_MB = int(os.environ.get("TENSHI_MAX_UPLOAD_MB", "200"))
IMAGE_SIZES = [320, 800, 1600]          # every uploaded photo is also saved at these widths (WebP)
IMAGE_QUALITY = 82                       # WebP quality for those copies (0-100)


# Behind a web server (Caddy, nginx) the public address isn't the CMS's own port: set TENSHI_SITES_SCHEME=https
# (and TENSHI_SITES_PORT only if it's not the usual one) so client-site links come out as https://name.example.com/
SITES_SCHEME = os.environ.get("TENSHI_SITES_SCHEME", "")
SITES_PORT = os.environ.get("TENSHI_SITES_PORT", "")


def site_url(subdomain):
    """The address of a client's live site, e.g. http://johnsons-plumbing.localhost:8000/"""
    if SITES_SCHEME:
        return f"{SITES_SCHEME}://{subdomain}.{SITES_DOMAIN}{':' + SITES_PORT if SITES_PORT else ''}/"
    port = "" if PORT in (80, 443) else f":{PORT}"
    scheme = "https" if PORT == 443 else "http"
    return f"{scheme}://{subdomain}.{SITES_DOMAIN}{port}/"


def ensure_folders():
    """Create the data folders on first run."""
    for folder in (DATA_DIR, MEDIA_DIR, BUILDS_DIR, TEMPLATES_DIR, BACKUPS_DIR, EXPORTS_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def secret_key():
    """The key that signs login cookies. Made once and kept in cms_data/secret.key."""
    ensure_folders()
    file = DATA_DIR / "secret.key"
    if not file.exists():
        file.write_text(secrets.token_hex(32))
    return file.read_text().strip()
