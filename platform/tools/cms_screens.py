"""
Screenshots of the CMS in a real browser, for checking new screens (run by .github/workflows/cms-screens.yml).
Starts nothing itself: expects the CMS on http://localhost:8000 with an admin shots@example.com / shots-pass-123.
Writes PNGs into ./shots and prints what it checked. Exits non-zero if a page shows an error or a check fails.
"""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8000"
OUT = Path("shots")
OUT.mkdir(exist_ok=True)
problems = []


def check(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok:
        problems.append(what)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    p = ctx.new_page()
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.goto(BASE + "/login")
    p.fill("input[name=email]", "shots@example.com")
    p.fill("input[name=password]", "shots-pass-123")
    p.click("button[type=submit]")
    p.wait_for_url(BASE + "/")
    api = lambda method, url, body=None: p.evaluate(
        """([m, u, b]) => fetch(u, {method: m, headers: {"X-Tenshi": "1", "Content-Type": "application/json"}, body: b ? JSON.stringify(b) : undefined}).then(r => r.json())""",
        [method, url, body])
    tpl = p.evaluate("fetch('/templates').then(r => r.text())")
    site = api("POST", "/api/sites", {"name": "Green Acres Tractors", "template": "contractor"}).get("site") or \
        api("POST", "/api/sites", {"name": "Green Acres Tractors", "template": "directory"})["site"]
    sid = site["id"]
    # some content to look at
    t = api("POST", f"/api/sites/{sid}/content-types", {"name": "Tractors for sale", "singular": "Tractor", "fields": [
        {"label": "Photo", "type": "media"}, {"label": "Make", "type": "select", "options": "John Deere, Kubota, Fendt", "filter": True},
        {"label": "Year", "type": "number"}, {"label": "Price", "type": "price"}]})
    for title, make, year, price in [("John Deere 4020", "John Deere", "1967", "$18,500"), ("Kubota M7", "Kubota", "2021", "$96,000"),
                                     ("Fendt 724", "Fendt", "2019", "$155,000")]:
        api("POST", f"/api/content-types/{t['id']}/entries", {"title": title, "data": {"make": make, "year": year, "price": price}})
    home = [x for x in p.evaluate(f"fetch('/api/sites/{sid}/posts').then(r=>r.json())").get("posts", [])]
    pages = json.loads(p.evaluate(f"""fetch('/sites/{sid}/pages').then(r => r.text()).then(t => JSON.stringify((t.match(/builder\\/(\\d+)/g)||[])))"""))
    page_id = int(pages[0].split("/")[1]) if pages else 1
    blocks = [{"id": "hero1", "type": "hero", "data": {"heading": "Tractors that work as hard as you", "text": "New and used farm equipment.", "layout": "split"}},
              {"id": "col1", "type": "columns", "data": {"heading": "Why Green Acres"}},
              {"id": "cl1", "type": "collection", "data": {"type_id": t["id"], "search": True}},
              {"id": "se1", "type": "search", "data": {}}]
    api("PATCH", f"/api/pages/{page_id}", {"blocks": blocks})
    api("POST", f"/api/sites/{sid}/redirects", {"from_path": "/old-inventory", "to_url": "index"})
    api("POST", f"/api/sites/{sid}/posts", {"title": "Spring service special", "status": "published", "body": "<p>Book now.</p>"})
    api("PUT", f"/api/sites/{sid}/languages", {"extra": ["es"]})
    api("PUT", f"/api/sites/{sid}/comments", {"on": True})

    def shot(path, name, wait=600):
        errors.clear()
        r = p.goto(BASE + path)
        p.wait_for_timeout(wait)
        p.screenshot(path=str(OUT / f"{name}.png"), full_page=False)
        check(r.status == 200 and not errors, f"{name}: {path} (status {r.status}{', JS errors: ' + '; '.join(errors) if errors else ''})")

    shot(f"/sites/{sid}/content", "content-types")
    shot(f"/sites/{sid}/content/{t['id']}", "content-entries")
    shot(f"/sites/{sid}/redirects", "redirects")
    shot(f"/sites/{sid}/languages", "languages")
    shot(f"/sites/{sid}/import", "import")
    shot(f"/sites/{sid}/trash", "trash")
    shot(f"/sites/{sid}/posts", "posts")
    shot("/account", "account")
    p.click("#tfa-start")
    p.wait_for_timeout(500)
    p.screenshot(path=str(OUT / "account-2fa.png"))
    check(p.is_visible("#qr svg") or p.is_visible("#secret"), "two-step setup shows a QR code or key")
    # the visual editor
    shot(f"/sites/{sid}/builder/{page_id}", "builder", 2500)
    frame = p.frame_locator("#frame")
    frame.locator("[data-block=hero1] h1").hover()
    p.wait_for_timeout(300)
    check(frame.locator(".tb-tools").is_visible(), "block bar shows on the page")
    frame.locator('[data-edit="areas.0.heading"]').click()
    p.keyboard.press("End")
    p.keyboard.type(" here")
    frame.locator('[data-edit="areas.0.text"]').click()
    p.wait_for_timeout(300)
    check(frame.locator(".tb-fmt").is_visible(), "formatting bar shows on formatted text")
    p.screenshot(path=str(OUT / "builder-editing.png"))
    p.wait_for_timeout(1500)
    saved = api("GET", f"/api/pages/{page_id}/revisions")
    p.click("[data-tab=photos]")
    p.wait_for_timeout(500)
    p.screenshot(path=str(OUT / "builder-photos.png"))
    p.click("#add-block") if p.is_visible("#add-block") else None
    p.click("[data-tab=blocks]")
    p.click("#add-block")
    p.wait_for_timeout(300)
    p.screenshot(path=str(OUT / "builder-palette.png"))
    shot(f"/sites/{sid}/preview/{json.loads(p.evaluate(f'''fetch('/sites/{sid}/pages').then(r=>r.text()).then(t=>JSON.stringify((t.match(/preview\\/([a-z0-9-]+)/)||[0,'index'])[1]))'''))}", "preview-home", 1200)
    shot(f"/sites/{sid}/preview/tractors-for-sale-john-deere-4020", "preview-entry", 800)
    p.set_viewport_size({"width": 390, "height": 844})
    shot(f"/sites/{sid}/builder/{page_id}", "builder-phone", 2000)
    # the premium designs, with sample sites made by tools/premium_demo.py (ids in premium.txt)
    shot("/templates", "templates", 600)
    for line in Path("premium.txt").read_text().split("\n") if Path("premium.txt").exists() else []:
        if not line.strip():
            continue
        tpl, psid = line.split()
        for w, h, tag in ((1440, 900, "desk"), (390, 844, "phone")):
            p.set_viewport_size({"width": w, "height": h})
            errors.clear()
            r = p.goto(f"{BASE}/sites/{psid}/preview/index")
            p.wait_for_timeout(1200)
            p.screenshot(path=str(OUT / f"design-{tpl}-{tag}.png"), full_page=True)
            check(r.status == 200 and not errors, f"design {tpl} {tag} ({', '.join(errors) or 'no JS errors'})")
        p.set_viewport_size({"width": 1440, "height": 900})
        for slug in ("about", "services", "contact"):
            r = p.goto(f"{BASE}/sites/{psid}/preview/{slug}")
            p.wait_for_timeout(500)
            p.screenshot(path=str(OUT / f"design-{tpl}-{slug}.png"), full_page=True)
            check(r.status == 200, f"design {tpl} {slug}")
    b.close()

print(f"{len(problems)} problem(s)")
sys.exit(1 if problems else 0)
