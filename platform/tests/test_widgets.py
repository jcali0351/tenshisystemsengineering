"""
The widget registry and the Store (Shopify) widget: settings checks, who may change them, drawing in demo mode,
deployments and the per-page Content-Security-Policy. Run from the platform folder:

    .venv\\Scripts\\python -m pytest tests -q

Uses a throw-away data folder (like test_cms.py), so real cms_data is never touched.
"""

import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ.setdefault("TENSHI_DATA", tempfile.mkdtemp(prefix="tenshi-test-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from cms import auth, blocks, config, db, sites, widgets  # noqa: E402
from cms.app import app  # noqa: E402
from cms.widgets.store import StoreConfig, StoreSettings  # noqa: E402

H = {"X-Tenshi": "1"}


# ---------------------------------------------------------------------------------------------- schema checks

def test_registry_has_store_as_a_block():
    w = widgets.get("store")
    assert w and "store" in blocks.BLOCKS
    bt = blocks.BLOCKS["store"]
    names = [f["name"] for f in bt["fields"]]
    for name in ("variant", "product_handle", "collection_handle", "limit", "show_prices", "button_text"):
        assert name in names
    variant = next(f for f in bt["fields"] if f["name"] == "variant")
    assert variant["type"] == "select" and [o[0] for o in variant["options"]] == ["grid", "product", "collection", "buy", "cart"]
    assert next(f for f in bt["fields"] if f["name"] == "show_prices")["type"] == "checkbox"
    assert next(f for f in bt["fields"] if f["name"] == "limit")["type"] == "number"
    assert bt["data"]["variant"] == "grid" and bt["data"]["limit"] == 8


@pytest.mark.parametrize("typed, stored", [
    ("my-store.myshopify.com", "my-store.myshopify.com"),
    ("  https://My-Store.myshopify.com/  ", "my-store.myshopify.com"),
    ("tenshi2.myshopify.com/admin", "tenshi2.myshopify.com"),
    ("", ""),
])
def test_domain_accepted_and_tidied(typed, stored):
    assert StoreSettings(store_domain=typed).store_domain == stored


@pytest.mark.parametrize("bad", ["example.com", "shop.example.com", "my_store.myshopify.com", "a.b.myshopify.com",
                                 "-x.myshopify.com", "myshopify.com", "store.myshopify.com.evil.com"])
def test_domain_refused(bad):
    with pytest.raises(ValueError, match="myshopify.com"):
        StoreSettings(store_domain=bad)


# Fake secret-shaped tokens, put together at run time so no token-looking string sits in the repository
@pytest.mark.parametrize("secret", [prefix + "_" + "0123456789abcdef" * 2 for prefix in ("shpat", "shpca", "shppa", "shpss", "SHPAT")])
def test_admin_tokens_refused(secret):
    with pytest.raises(ValueError) as err:
        StoreSettings(store_domain="a.myshopify.com", storefront_token=secret)
    assert "secret Shopify token" in str(err.value) and "PUBLIC" in str(err.value)


def test_public_token_and_live_rules():
    ok = StoreSettings(mode="live", store_domain="a.myshopify.com", storefront_token="0123456789abcdef0123456789abcdef")
    assert ok.live
    with pytest.raises(ValueError, match="to go live"):
        StoreSettings(mode="live", store_domain="a.myshopify.com")
    with pytest.raises(ValueError, match="public Storefront"):
        StoreSettings(storefront_token="not a token!")
    assert not StoreSettings().live and StoreSettings().button_text == "Add to cart"


def test_block_config_checks():
    w = widgets.get("store")
    clean = w.clean_config({"variant": "product", "product_handle": "Neon-Angel-Tee", "limit": "", "show_prices": False, "junk": 1})
    assert clean["product_handle"] == "neon-angel-tee" and clean["limit"] == 8 and "junk" not in clean and clean["show_prices"] is False
    assert w.clean_config({"limit": "12"})["limit"] == 12
    for bad in ({"limit": 0}, {"limit": 51}, {"variant": "carousel"}, {"collection_handle": "Summer Sale!"}):
        with pytest.raises(widgets.WidgetError):
            w.clean_config(bad)
    assert StoreConfig().variant == "grid"


# ---------------------------------------------------------------------------------------------- the CMS end to end

def _login(c, email, password):
    r = c.post("/login", data={"email": email, "password": password, "next": "/"}, follow_redirects=False)
    assert r.status_code == 303, r.text


@pytest.fixture(scope="module")
def setup_cms():
    with TestClient(app) as c:
        if auth.needs_setup():
            auth.create_user("owner@example.com", "Owner", "correct-horse-1", "admin")
        elif not db.one("SELECT id FROM users WHERE email = 'owner@example.com'"):
            auth.create_user("owner@example.com", "Owner", "correct-horse-1", "admin")
        if not db.one("SELECT id FROM users WHERE email = 'editor@example.com'"):
            auth.create_user("editor@example.com", "Ed", "correct-horse-2", "editor")
        _login(c, "owner@example.com", "correct-horse-1")
        r = c.post("/api/sites", json={"name": "Neon Goods", "template": "corporate", "email": "hi@example.com"}, headers=H)
        assert r.status_code == 200, r.text
        sid = r.json()["site"]["id"]
        yield c, sid


def test_settings_permissions_and_storage(setup_cms):
    c, sid = setup_cms
    url = f"/api/sites/{sid}/widgets/store/settings"
    page = c.get(f"/sites/{sid}/widgets/store")
    assert page.status_code == 200 and "Connect your Shopify store" in page.text and "Headless" in page.text
    assert "PUBLIC access token" in page.text
    # an Admin token is refused with a clear message, and nothing is stored
    r = c.put(url, json={"mode": "live", "store_domain": "neon.myshopify.com", "storefront_token": "shpat_" + "a" * 32}, headers=H)
    assert r.status_code == 400 and "secret Shopify token" in r.json()["error"]
    assert not db.one("SELECT 1 FROM site_settings WHERE site_id = ?", sid)
    r = c.put(url, json={"store_domain": "neon.example.com"}, headers=H)
    assert r.status_code == 400 and "myshopify.com" in r.json()["error"]
    # the X-Tenshi header is still required
    assert c.put(url, json={"mode": "demo"}).status_code == 403
    # an admin saves; it's kept per site in the database
    r = c.put(url, json={"mode": "demo", "store_domain": "https://Neon.myshopify.com", "storefront_token": "0123456789abcdef0123456789abcdef",
                         "collection_handle": "merch", "button_text": "Buy"}, headers=H)
    assert r.status_code == 200, r.text
    row = db.one("SELECT value_json FROM site_settings WHERE site_id = ? AND key = 'widget:store'", sid)
    assert db.j(row["value_json"])["store_domain"] == "neon.myshopify.com"
    assert c.get(url).json()["settings"]["button_text"] == "Buy"
    # an editor can see but not change it
    with TestClient(app) as ed:
        _login(ed, "editor@example.com", "correct-horse-2")
        assert "Only this site's owners and CMS admins" in ed.get(f"/sites/{sid}/widgets/store").text
        r = ed.put(url, json={"mode": "demo", "button_text": "Hacked"}, headers=H)
        assert r.status_code == 403
    assert c.get(url).json()["settings"]["button_text"] == "Buy"
    # unknown widgets 404
    assert c.get(f"/sites/{sid}/widgets/nope").status_code == 404
    c.put(url, json={"mode": "demo", "button_text": "Add to cart"}, headers=H)   # back to defaults for the next tests


def _set_blocks(c, sid, slug, blist):
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = ?", sid, slug)
    r = c.patch(f"/api/pages/{page['id']}", json={"blocks": blist}, headers=H)
    assert r.status_code == 200, r.text
    return page


def test_builder_and_demo_render(setup_cms):
    c, sid = setup_cms
    page = db.one("SELECT * FROM pages WHERE site_id = ? AND slug = 'index'", sid)
    assert "Store (Shopify)" in c.get(f"/sites/{sid}/builder/{page['id']}").text
    # a bad block setting is refused by the builder's save
    r = c.patch(f"/api/pages/{page['id']}", json={"blocks": [{"id": "s1", "type": "store", "data": {"limit": 500}}]}, headers=H)
    assert r.status_code == 400 and "Store" in r.json()["error"]
    _set_blocks(c, sid, "index", [
        {"id": "g1", "type": "store", "data": {"variant": "grid", "limit": "4", "heading": "Our shop"}},
        {"id": "p1", "type": "store", "data": {"variant": "product", "product_handle": "undercity-art-print"}},
        {"id": "c1", "type": "store", "data": {"variant": "collection", "collection_handle": "service", "show_prices": False}},
        {"id": "k1", "type": "store", "data": {"variant": "cart"}},
    ])
    html = c.get(f"/sites/{sid}/preview/index?edit=1").text
    assert html.count("data-tw-store") == 5                             # the 4 blocks and the header cart
    assert html.count('class="tws-item"') == 4 + 2                     # 4 in the grid, 2 "service" products in the collection
    assert "Undercity Art Print" in html and "Our shop" in html
    assert "Demo store" in html                                         # badge only in the CMS preview
    assert '/static/widgets/store/store.css' in html and '/static/widgets/store/store.js' in html
    assert html.index("store.css") < html.index("</head>") and html.index("store.js") > html.index("<main")
    assert c.get("/static/widgets/store/store.js").status_code == 200
    assert c.get("/static/widgets/store/img/neon-angel-tee.webp").status_code == 200
    assert c.get("/static/widgets/store/%2e%2e/%2e%2e/cms.css").status_code == 404
    assert c.get("/static/widgets/nope/store.js").status_code == 404
    # other pages get only the header cart; with that off, pages without the widget don't load its files
    assert "tws-hcart" in c.get(f"/sites/{sid}/preview/about").text
    assert c.put(f"/api/sites/{sid}/widgets/store/settings", json={"header_cart": False}, headers=H).status_code == 200
    assert "widgets/store" not in c.get(f"/sites/{sid}/preview/about").text


def test_deploy_assets_and_csp_only_with_widget(setup_cms):
    c, sid = setup_cms
    _set_blocks(c, sid, "index", [{"id": "g1", "type": "store", "data": {"variant": "grid"}}])
    assert c.put(f"/api/sites/{sid}/widgets/store/settings", json={"header_cart": False}, headers=H).status_code == 200
    r = c.post(f"/api/sites/{sid}/deploy", headers=H)
    assert r.status_code == 200, r.text
    sub = sites.get(sid)["subdomain"]
    home = c.get(f"/s/{sub}/")
    assert home.status_code == 200
    assert 'src="widgets/store/store.js"' in home.text and "Demo store" not in home.text and "tws-badge" not in home.text
    csp = home.headers["content-security-policy"]
    connect = next(d for d in csp.split("; ") if d.startswith("connect-src"))
    assert "https://*.myshopify.com" in connect
    assert "https://cdn.shopify.com" in next(d for d in csp.split("; ") if d.startswith("img-src"))
    assert "https://checkout.shopify.com" in next(d for d in csp.split("; ") if d.startswith("form-action"))
    about = c.get(f"/s/{sub}/about.html")
    assert about.status_code == 200
    assert "shopify" not in about.headers["content-security-policy"] and "connect-src 'self'" in about.headers["content-security-policy"]
    assert "widgets/store" not in about.text
    # the widget's files were copied, the manifest is not served
    assert c.get(f"/s/{sub}/widgets/store/store.js").status_code == 200
    assert c.get(f"/s/{sub}/widgets/store/img/care-plan.webp").status_code == 200
    assert c.get(f"/s/{sub}/{widgets.MANIFEST}").status_code == 404
    # live settings reach the page (public token only), still with the CSP
    c.put(f"/api/sites/{sid}/widgets/store/settings", json={"mode": "live", "store_domain": "neon.myshopify.com",
                                                             "storefront_token": "0123456789abcdef0123456789abcdef"}, headers=H)
    c.post(f"/api/sites/{sid}/deploy", headers=H)
    home = c.get(f"/s/{sub}/")
    assert '"domain": "neon.myshopify.com"' in home.text and '"live": true' in home.text and "aria-busy" in home.text
    # remove the widget: the next deployment has no Shopify sources anywhere
    _set_blocks(c, sid, "index", [{"id": "t1", "type": "text", "data": {"heading": "Hi"}}])
    c.post(f"/api/sites/{sid}/deploy", headers=H)
    home = c.get(f"/s/{sub}/")
    assert "shopify" not in home.headers["content-security-policy"] and "widgets/store" not in home.text


def test_site_owner_can_edit_store_settings(setup_cms):
    c, sid = setup_cms
    url = f"/api/sites/{sid}/widgets/store/settings"
    ed_id = db.one("SELECT id FROM users WHERE email = 'editor@example.com'")["id"]
    if not db.one("SELECT id FROM users WHERE email = 'client@example.com'"):
        auth.create_user("client@example.com", "Client", "correct-horse-3", "editor")
    client_id = db.one("SELECT id FROM users WHERE email = 'client@example.com'")["id"]
    other = c.post("/api/sites", json={"name": "Other Shop", "template": "corporate"}, headers=H).json()["site"]["id"]
    with TestClient(app) as cl:
        _login(cl, "client@example.com", "correct-horse-3")
        # not a member yet: read-only, and can't assign members
        assert cl.put(url, json={"mode": "demo", "button_text": "Mine"}, headers=H).status_code == 403
        assert cl.put(f"/api/sites/{sid}/members/{client_id}", json={"role": "owner"}, headers=H).status_code == 403
        # an admin makes them the owner of this site (Settings › People)
        r = c.put(f"/api/sites/{sid}/members/{client_id}", json={"role": "owner"}, headers=H)
        assert r.status_code == 200 and any(m["user_id"] == client_id and m["role"] == "owner" for m in r.json()["members"])
        assert c.put(f"/api/sites/{sid}/members/{client_id}", json={"role": "boss"}, headers=H).status_code == 400
        page = cl.get(f"/sites/{sid}/widgets/store").text
        assert "Only this site's owners" not in page and 'id="save"' in page
        assert cl.put(url, json={"mode": "demo", "button_text": "Mine"}, headers=H).status_code == 200
        # ownership is per site
        assert cl.put(f"/api/sites/{other}/widgets/store/settings", json={"mode": "demo"}, headers=H).status_code == 403
        # an editor member stays read-only
        c.put(f"/api/sites/{sid}/members/{ed_id}", json={"role": "editor"}, headers=H)
        with TestClient(app) as ed:
            _login(ed, "editor@example.com", "correct-horse-2")
            assert ed.put(url, json={"mode": "demo"}, headers=H).status_code == 403
        # the People list and the Users screen show it
        settings = c.get(f"/sites/{sid}/settings").text
        assert 'id="people"' in settings and "client@example.com" in settings
        assert "Other Shop" not in c.get("/users").text.split("client@example.com")[1].split("</tr>")[0]
        # removing the membership takes the right away
        c.delete(f"/api/sites/{sid}/members/{client_id}", headers=H)
        assert cl.put(url, json={"mode": "demo"}, headers=H).status_code == 403
    c.put(url, json={"mode": "demo", "button_text": "Add to cart"}, headers=H)


def test_settings_not_in_repo():
    """Per-site settings live in the database under cms_data (git-ignored), never in a tracked file."""
    assert str(config.DB_FILE).startswith(str(config.DATA_DIR))
