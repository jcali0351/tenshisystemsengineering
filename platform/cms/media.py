"""
media.py: the Media Center's engine room.

What happens when a file is uploaded:
    1. We work out what it really is by looking inside it (not just at its name), so a program renamed to
       "photo.jpg" is refused.
    2. Photos (JPEG, PNG, WebP, GIF) are opened with Pillow, turned the right way up, re-saved (which compresses
       them and removes hidden extras such as GPS location), and smaller WebP copies are made at the widths in
       config.IMAGE_SIZES. Web pages then load the smallest copy that looks sharp.
    3. SVG drawings are cleaned: anything that could run code (scripts, on… attributes, javascript: links) is removed.
    4. Videos, PDFs and audio are kept exactly as uploaded.

Files live in cms_data/media/<site id>/. The database row (table "media") says what each file is.
"""

import io
import re
import secrets
import shutil
from pathlib import Path

from PIL import Image, ImageOps

from . import config, db

# What each kind of file looks like inside (its first bytes), and its usual extension
SIGNATURES = [
    (b"\x89PNG", "image", "image/png", "png"),
    (b"\xff\xd8\xff", "image", "image/jpeg", "jpg"),
    (b"GIF8", "image", "image/gif", "gif"),
    (b"%PDF", "pdf", "application/pdf", "pdf"),
    (b"ID3", "audio", "audio/mpeg", "mp3"),
    (b"OggS", "audio", "audio/ogg", "ogg"),
    (b"\x1aE\xdf\xa3", "video", "video/webm", "webm"),
]
MAX_PIXELS = 8000            # photos larger than this (either side) are scaled down to it


class MediaError(ValueError):
    """A problem with an upload, worded for the person uploading."""


def site_folder(site_id):
    folder = config.MEDIA_DIR / str(site_id)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def identify(data, filename):
    """Return (kind, mime, extension) by looking inside the file. Raises MediaError if we don't accept it."""
    head = data[:16]
    if head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image", "image/webp", "webp"
    if data[4:8] == b"ftyp":                        # MP4 / MOV / M4A family
        brand = data[8:12]
        if brand.startswith(b"M4A"):
            return "audio", "audio/mp4", "m4a"
        return ("video", "video/quicktime", "mov") if brand == b"qt  " else ("video", "video/mp4", "mp4")
    for magic, kind, mime, ext in SIGNATURES:
        if head.startswith(magic):
            return kind, mime, ext
    if head[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio", "audio/wav", "wav"
    text_start = data[:1000].lstrip().lower()
    if filename.lower().endswith(".svg") and (text_start.startswith(b"<svg") or text_start.startswith(b"<?xml")) and b"<svg" in data[:5000].lower():
        return "svg", "image/svg+xml", "svg"
    raise MediaError(f"{filename}: this kind of file isn't supported. Upload pictures (JPG, PNG, WebP, GIF, SVG), "
                     "videos (MP4, WebM, MOV), PDFs or audio (MP3, M4A, WAV, OGG).")


def clean_svg(data):
    """Remove anything from an SVG that could run code in a visitor's browser."""
    text = data.decode("utf-8", errors="replace")
    text = re.sub(r"<script[\s\S]*?</script\s*>", "", text, flags=re.I)
    text = re.sub(r"<script[^>]*/>", "", text, flags=re.I)
    text = re.sub(r"<foreignObject[\s\S]*?</foreignObject\s*>", "", text, flags=re.I)
    text = re.sub(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", text, flags=re.I)        # onclick=… etc.
    text = re.sub(r"(href|xlink:href)\s*=\s*([\"'])\s*javascript:[^\"']*\2", r'\1="#"', text, flags=re.I)
    return text.encode("utf-8")


def _slug(name):
    stem = Path(name).stem.lower()
    return (re.sub(r"[^a-z0-9]+", "-", stem).strip("-") or "file")[:40]


def _make_variants(img, folder, base):
    """Save smaller WebP copies of a photo. Returns {"320": "base-320.webp", …} for the widths that make sense."""
    variants = {}
    for width in config.IMAGE_SIZES:
        if img.width <= width and width != config.IMAGE_SIZES[0]:
            continue                                  # never make a copy bigger than the original
        copy = img.copy()
        copy.thumbnail((width, width * 4))
        name = f"{base}-{width}.webp"
        copy.save(folder / name, "WEBP", quality=config.IMAGE_QUALITY, method=5)
        variants[str(width)] = name
    return variants


def _save_photo(img, folder, base, ext):
    """Turn the photo the right way up, limit its size, re-save it compressed. Returns (file name, width, height, variants)."""
    img = ImageOps.exif_transpose(img)                # phones store photos sideways plus a "rotate me" note
    if max(img.size) > MAX_PIXELS:
        img.thumbnail((MAX_PIXELS, MAX_PIXELS))
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if ext == "gif" and getattr(img, "is_animated", False):
        return None                                   # animated GIFs are kept as they are (see save_upload)
    name = f"{base}.{ext}"
    if ext in ("jpg", "jpeg"):
        img.convert("RGB").save(folder / name, "JPEG", quality=85, optimize=True, progressive=True)
    elif ext == "png":
        img.save(folder / name, "PNG", optimize=True)
    elif ext == "webp":
        img.save(folder / name, "WEBP", quality=88, method=5)
    else:
        img.save(folder / name)
    variants = _make_variants(img.convert("RGBA" if has_alpha else "RGB"), folder, base)
    return name, img.width, img.height, variants


def save_upload(site_id, filename, data, folder_id=None, user=None):
    """Store one uploaded file and return its new media row."""
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise MediaError(f"{filename} is larger than {config.MAX_UPLOAD_MB} MB.")
    if not data:
        raise MediaError(f"{filename} is empty.")
    kind, mime, ext = identify(data, filename)
    folder = site_folder(site_id)
    base = f"{_slug(filename)}-{secrets.token_hex(3)}"
    width = height = None
    variants = {}

    if kind == "image":
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except Exception as error:
            raise MediaError(f"{filename} looks like a picture but couldn't be opened ({error}).")
        saved = _save_photo(img, folder, base, ext)
        if saved:
            stored, width, height, variants = saved
        else:                                         # animated GIF: keep the animation
            stored = f"{base}.gif"
            (folder / stored).write_bytes(data)
            width, height = img.size
    elif kind == "svg":
        stored = f"{base}.svg"
        data = clean_svg(data)
        (folder / stored).write_bytes(data)
        match = re.search(rb'viewBox\s*=\s*["\'][\d.\-]+[\s,]+[\d.\-]+[\s,]+([\d.]+)[\s,]+([\d.]+)', data)
        if match:
            width, height = int(float(match.group(1))), int(float(match.group(2)))
    else:
        stored = f"{base}.{ext}"
        (folder / stored).write_bytes(data)

    size = (folder / stored).stat().st_size
    title = Path(filename).stem.replace("-", " ").replace("_", " ").strip()
    media_id = db.run(
        "INSERT INTO media (site_id, folder_id, kind, filename, stored, mime, bytes, width, height, title, variants_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        site_id, folder_id, kind, filename, stored, mime, size, width, height, title, db.dumps(variants), db.now())
    db.log("Uploaded", filename, user, site_id)
    return db.one("SELECT * FROM media WHERE id = ?", media_id)


def edit_image(media_id, crop=None, width=None, rotate=0):
    """
    Crop, resize or rotate a photo in place, then remake its smaller copies.
        crop  = (left, top, right, bottom) in the photo's own pixels
        width = new width in pixels (height follows)
        rotate = 90, 180 or 270 (turns clockwise)
    """
    item = db.one("SELECT * FROM media WHERE id = ?", media_id)
    if not item or item["kind"] != "image" or item["stored"].endswith(".gif"):
        raise MediaError("Only photos (JPG, PNG, WebP) can be cropped or resized.")
    folder = site_folder(item["site_id"])
    img = Image.open(folder / item["stored"])
    img.load()
    if rotate:
        img = img.rotate(-int(rotate), expand=True)
    if crop:
        left, top, right, bottom = [int(round(v)) for v in crop]
        left, top = max(0, left), max(0, top)
        right, bottom = min(img.width, right), min(img.height, bottom)
        if right - left < 8 or bottom - top < 8:
            raise MediaError("That crop is too small.")
        img = img.crop((left, top, right, bottom))
    if width and int(width) < img.width:
        img = img.resize((int(width), max(1, round(img.height * int(width) / img.width))), Image.LANCZOS)
    for old in db.j(item["variants_json"]).values():          # remove the old smaller copies
        (folder / old).unlink(missing_ok=True)
    ext = item["stored"].rsplit(".", 1)[1]
    base = item["stored"].rsplit(".", 1)[0]
    stored, w, h, variants = _save_photo(img, folder, base, ext)
    db.run("UPDATE media SET width = ?, height = ?, bytes = ?, variants_json = ? WHERE id = ?",
           w, h, (folder / stored).stat().st_size, db.dumps(variants), media_id)
    return db.one("SELECT * FROM media WHERE id = ?", media_id)


def delete(media_id):
    item = db.one("SELECT * FROM media WHERE id = ?", media_id)
    if not item:
        return
    folder = site_folder(item["site_id"])
    (folder / item["stored"]).unlink(missing_ok=True)
    for name in db.j(item["variants_json"]).values():
        (folder / name).unlink(missing_ok=True)
    with db.transaction() as conn:
        conn.execute("DELETE FROM album_items WHERE media_id = ?", (media_id,))
        conn.execute("DELETE FROM media WHERE id = ?", (media_id,))


def file_path(item, size=None):
    """The file on disk for a media row; with size (e.g. 800) the closest smaller copy if there is one."""
    folder = site_folder(item["site_id"])
    if size:
        variants = db.j(item["variants_json"])
        if str(size) in variants:
            return folder / variants[str(size)]
    return folder / item["stored"]


def copy_site_media(from_site, to_site):
    """Copy every media file and row from one site to another (used by Clone website). Returns {old id: new id}."""
    mapping, folders = {}, {}
    for f in db.all("SELECT * FROM media_folders WHERE site_id = ? ORDER BY id", from_site):
        folders[f["id"]] = db.run("INSERT INTO media_folders (site_id, parent_id, name) VALUES (?, ?, ?)",
                                  to_site, folders.get(f["parent_id"]), f["name"])
    src, dst = site_folder(from_site), site_folder(to_site)
    for item in db.all("SELECT * FROM media WHERE site_id = ?", from_site):
        for name in [item["stored"]] + list(db.j(item["variants_json"]).values()):
            if (src / name).exists():
                shutil.copy2(src / name, dst / name)
        cols = [k for k in item if k not in ("id", "site_id", "folder_id")]
        new_id = db.run(f"INSERT INTO media (site_id, folder_id, {', '.join(cols)}) VALUES (?, ?, {', '.join('?' * len(cols))})",
                        to_site, folders.get(item["folder_id"]), *[item[c] for c in cols])
        mapping[item["id"]] = new_id
    return mapping


def storage_bytes(site_id=None):
    """How much space media takes (one site, or all sites)."""
    folder = config.MEDIA_DIR / str(site_id) if site_id else config.MEDIA_DIR
    return sum(f.stat().st_size for f in folder.rglob("*") if f.is_file()) if folder.exists() else 0


def human_size(n):
    for unit in ("bytes", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1024
