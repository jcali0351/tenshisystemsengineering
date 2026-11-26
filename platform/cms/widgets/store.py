"""
widgets/store.py: the Store widget, a Shopify shop inside any client page.

A client connects their own Shopify store once per site (Pages sidebar > Online store: the store's .myshopify.com
address and its PUBLIC Storefront access token from Shopify's Headless channel), then adds "Store" blocks in the page
builder: a product grid, one product, one collection, or just a cart button. Visitors browse and fill a cart on the
client's site; checkout happens on Shopify's own hosted checkout (cartCreate / cartLinesAdd, then checkoutUrl).

With no store connected, or the site's store set to Demo, the widget shows the six sample products of the marketing
site's Shop demo (static/widgets/store/demo.json) and checkout is switched off.

The browser code is static/widgets/store/store.js (+ store.css), based on the marketing site's shop.js: plain fetch()
to the Storefront API 2026-10, no Shopify SDK. The public token is meant to be seen by browsers (Shopify designs it for
that); Admin API tokens and the Headless private token are secrets and are refused here.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Literal

from markupsafe import Markup, escape
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from . import STATIC_DIR, Widget, WidgetContext, register

API_VERSION = "2026-10"
DOMAIN_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?\.myshopify\.com$")
HANDLE_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,253}[a-z0-9])?$")
# Shopify's secret tokens all start with shp…_ : shpat_ (Admin API), shpca_ (custom app), shppa_ (private app),
# shpss_ (shared secret), shpua_ … The public Storefront token is a plain string of letters and digits.
SECRET_TOKEN_RE = re.compile(r"^shp[a-z]{1,4}_", re.I)
PUBLIC_TOKEN_RE = re.compile(r"^[A-Za-z0-9]{20,64}$")


def _handle(value: str, what: str) -> str:
    value = (value or "").strip().lower()
    if value and not HANDLE_RE.fullmatch(value):
        raise ValueError(f"a {what} handle is lowercase letters, digits and dashes, like summer-sale (it's the end of the {what}'s address in Shopify)")
    return value


# ---------------------------------------------------------------------------------------------- per-site settings

class StoreSettings(BaseModel):
    """The site's Shopify connection. Stored in site_settings (key widget:store), never in git."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    mode: Literal["demo", "live"] = "demo"
    store_domain: str = Field("", max_length=100)
    storefront_token: str = Field("", max_length=200)
    collection_handle: str = Field("", max_length=255)
    button_text: str = Field("Add to cart", max_length=40)
    header_cart: bool = True        # a cart button with the item count in the site's header, on every page

    @field_validator("store_domain")
    @classmethod
    def _domain(cls, v: str) -> str:
        v = re.sub(r"^https?://", "", (v or "").strip().lower()).split("/")[0]
        if v and not DOMAIN_RE.fullmatch(v):
            raise ValueError("use the store's Shopify address, like your-store.myshopify.com (not a custom domain)")
        return v

    @field_validator("storefront_token")
    @classmethod
    def _token(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            return v
        if SECRET_TOKEN_RE.match(v):
            raise ValueError("that is a secret Shopify token (Admin API or private app). Never paste it here: "
                             "use the PUBLIC access token from Headless > your storefront > Storefront API")
        if not PUBLIC_TOKEN_RE.fullmatch(v):
            raise ValueError("that doesn't look like a public Storefront access token (letters and digits only, usually 32 characters)")
        return v

    @field_validator("collection_handle")
    @classmethod
    def _collection(cls, v: str) -> str:
        return _handle(v, "collection")

    @field_validator("button_text")
    @classmethod
    def _button(cls, v: str) -> str:
        return v or "Add to cart"

    @model_validator(mode="after")
    def _live_needs_store(self):
        if self.mode == "live" and not (self.store_domain and self.storefront_token):
            raise ValueError("to go live, fill in the store address and the public access token (or keep the store on Demo)")
        return self

    @property
    def live(self) -> bool:
        return self.mode == "live" and bool(self.store_domain and self.storefront_token)


# ---------------------------------------------------------------------------------------------- one block's settings

VARIANTS = [["grid", "Product grid"], ["product", "Single product"], ["collection", "Collection"], ["buy", "Buy button (one product, compact)"],
            ["cart", "Cart button (opens the cart drawer)"]]
SORTS = [["featured", "Featured"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["title", "Name: A to Z"]]


class StoreConfig(BaseModel):
    """One Store block in the page builder."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    variant: Literal["grid", "product", "collection", "buy", "cart"] = Field("grid", json_schema_extra={"label": "Show", "options": VARIANTS})
    heading: str = Field("Shop", max_length=120, json_schema_extra={"label": "Heading"})
    intro: str = Field("", max_length=400, json_schema_extra={"label": "Intro", "type": "textarea"})
    product_handle: str = Field("", max_length=255, json_schema_extra={"label": "Product handle (Single product)"})
    collection_handle: str = Field("", max_length=255, json_schema_extra={"label": "Collection handle (Collection; empty = the store's default)"})
    limit: int = Field(8, ge=1, le=50, json_schema_extra={"label": "Show at most (products)"})
    columns: Literal["2", "3", "4"] = Field("3", json_schema_extra={"label": "Columns", "options": [["2", "2"], ["3", "3"], ["4", "4"]]})
    show_prices: bool = Field(True, json_schema_extra={"label": "Show prices"})
    button_text: str = Field("", max_length=40, json_schema_extra={"label": "Button text (empty = the store's setting)"})
    filters: bool = Field(False, json_schema_extra={"label": "Show filters and sorting (grid and collection)"})
    sort: Literal["featured", "price-asc", "price-desc", "title"] = Field("featured", json_schema_extra={"label": "Sort products by", "options": SORTS})

    @field_validator("product_handle")
    @classmethod
    def _product(cls, v: str) -> str:
        return _handle(v, "product")

    @field_validator("collection_handle")
    @classmethod
    def _collection(cls, v: str) -> str:
        return _handle(v, "collection")


# ---------------------------------------------------------------------------------------------- drawing

@lru_cache(maxsize=1)
def demo_data() -> dict:
    return json.loads((STATIC_DIR / "store" / "demo.json").read_text(encoding="utf-8"))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")


def demo_products(cfg: StoreConfig, collection: str = "") -> list[dict]:
    """Sample products for one block. Collections in demo mode are the product types (merch, print, service)."""
    items = list(demo_data()["products"])
    if cfg.variant in ("product", "buy"):
        one = next((p for p in items if p["handle"] == cfg.product_handle), None)
        return [one or items[0]]
    if cfg.variant == "collection" and collection:
        picked = [p for p in items if _slug(p.get("type")) == collection]
        items = picked or items
    return sort_products(items, cfg.sort)[: cfg.limit]


def _low(p) -> float:
    return min(float(v["price"]) for v in p["variants"])


def sort_products(items: list[dict], how: str) -> list[dict]:
    if how == "price-asc":
        return sorted(items, key=_low)
    if how == "price-desc":
        return sorted(items, key=_low, reverse=True)
    if how == "title":
        return sorted(items, key=lambda p: p["title"].lower())
    return list(items)


def _money(amount, currency="USD") -> str:
    symbol = {"USD": "$", "CAD": "$", "AUD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}.get(currency, "")
    value = float(amount)
    return f"{symbol}{value:,.0f}" if currency == "JPY" else (f"{symbol}{value:,.2f}" if symbol else f"{value:,.2f} {currency}")


def _price_label(p: dict, currency: str) -> str:
    prices = [float(v["price"]) for v in p["variants"]]
    lo = min(prices)
    return ("From " if max(prices) > lo else "") + _money(lo, currency)


def _img(p: dict, ctx: WidgetContext) -> str:
    src = p.get("image") or ""
    return src if re.match(r"^https?://", src) else ctx.asset(src)


def _tile(p: dict, cfg: StoreConfig, ctx: WidgetContext, button: str, currency: str) -> str:
    sold = not any(v.get("available") for v in p["variants"])
    label = "Sold out" if sold else ("Choose options" if p.get("options") else button)
    price = f'<p class="tws-price">{escape(_price_label(p, currency))}</p>' if cfg.show_prices else ""
    return (f'<li class="tws-item" data-type="{escape(p.get("type", ""))}" data-price="{_low(p):.2f}" data-title="{escape(p["title"].lower())}" '
            f'data-avail="{0 if sold else 1}"><article class="tws-tile">'
            f'<button class="tws-media" type="button" data-tws-quick="{escape(p["handle"])}" aria-label="Quick view: {escape(p["title"])}">'
            f'<img src="{escape(_img(p, ctx))}" alt="{escape(p.get("imageAlt") or p["title"])}" width="800" height="800" loading="lazy" decoding="async"></button>'
            f'<div class="tws-info"><span class="tws-type">{escape(p.get("type", ""))}</span><h3 class="tws-name"><a href="#product-{escape(p["handle"])}" data-tws-quick="{escape(p["handle"])}">{escape(p["title"])}</a></h3>{price}</div>'
            f'<button class="btn tws-add" type="button" data-tws-add="{escape(p["handle"])}"{" disabled" if sold else ""}>{escape(label)}</button>'
            f'</article></li>')


def _product_detail(p: dict, cfg: StoreConfig, ctx: WidgetContext, button: str, currency: str, uid: str) -> str:
    first = next((v for v in p["variants"] if v.get("available")), p["variants"][0])
    opts = "".join(
        f'<fieldset class="tws-opt"><legend>{escape(o["name"])}</legend><div class="tws-opt-vals">' + "".join(
            f'<label class="tws-pill"><input type="radio" name="tws-{uid}-o{i}" data-opt="{escape(o["name"])}" value="{escape(v)}"'
            f'{" checked" if first.get("options", {}).get(o["name"]) == v else ""}><span>{escape(v)}</span></label>' for v in o["values"])
        + "</div></fieldset>" for i, o in enumerate(p.get("options") or []))
    price = f'<p class="tws-pd-price" data-tws-price aria-live="polite">{escape(_money(first["price"], currency))}</p>' if cfg.show_prices else ""
    return (f'<div class="tws-pd" data-tws-product="{escape(p["handle"])}">'
            f'<div class="tws-pd-media"><img src="{escape(_img(p, ctx))}" alt="{escape(p.get("imageAlt") or p["title"])}" width="800" height="800" loading="lazy" decoding="async"></div>'
            f'<div class="tws-pd-body"><span class="tws-type">{escape(p.get("type", ""))}</span><h3 class="tws-pd-title">{escape(p["title"])}</h3>{price}'
            f'<p class="tws-pd-desc">{escape(p.get("description", ""))}</p>{opts}'
            f'<div class="tws-pd-row"><div class="tws-qty" role="group" aria-label="Quantity"><button type="button" data-q="-1" aria-label="One less">−</button>'
            f'<output>1</output><button type="button" data-q="1" aria-label="One more">+</button></div>'
            f'<button class="btn tws-pd-add" type="button" data-tws-pd-add{"" if first.get("available") else " disabled"}>{escape(button if first.get("available") else "Sold out")}</button></div>'
            f'</div></div>')


def toolbar_html(products: list[dict], cfg: StoreConfig, uid: str) -> str:
    """Filter chips (product types), in-stock only, and sorting, for a grid or collection (store.js does the work)."""
    types = list(dict.fromkeys(p.get("type") for p in products if p.get("type")))
    chips = "".join(f'<button type="button" class="tws-chip" data-tws-filter="{escape(t)}" aria-pressed="false">{escape(t)}</button>' for t in types)
    sorts = "".join(f'<option value="{v}"{" selected" if v == cfg.sort else ""}>{escape(label)}</option>' for v, label in SORTS)
    return (f'<div class="tws-bar" data-tws-bar role="group" aria-label="Filter and sort products">'
            f'<div class="tws-chips"><button type="button" class="tws-chip" data-tws-filter="" aria-pressed="true">All</button>{chips}</div>'
            f'<label class="tws-instock"><input type="checkbox" data-tws-instock> In stock only</label>'
            f'<label class="tws-sort"><span>Sort</span><select data-tws-sort id="tws-{uid}-sort">{sorts}</select></label>'
            f'<p class="tws-shown" data-tws-shown aria-live="polite"></p></div>')


def buy_html(p: dict, cfg: StoreConfig, ctx: WidgetContext, button: str, currency: str) -> str:
    """The compact Buy button: picture, name, price and one button (options open the quick view)."""
    sold = not any(v.get("available") for v in p["variants"])
    label = "Sold out" if sold else (f"{button}" if not p.get("options") else "Choose options")
    price = f'<span class="tws-buy-price">{escape(_price_label(p, currency))}</span>' if cfg.show_prices else ""
    return (f'<div class="tws-buy" data-tws-buy="{escape(p["handle"])}"><img src="{escape(_img(p, ctx))}" alt="" width="64" height="64" loading="lazy" decoding="async">'
            f'<span class="tws-buy-text"><a class="tws-buy-name" href="#product-{escape(p["handle"])}" data-tws-quick="{escape(p["handle"])}">{escape(p["title"])}</a>{price}</span>'
            f'<button class="btn tws-add" type="button" data-tws-add="{escape(p["handle"])}"{" disabled" if sold else ""}>{escape(label)}</button></div>')


def header_cart_html(ctx: WidgetContext) -> str:
    """The cart button with its item count for the site's header (render.py puts it in on every page)."""
    st: StoreSettings = ctx.settings or StoreSettings()
    config = {"variant": "header", "live": st.live, "apiVersion": API_VERSION, "buttonText": st.button_text or "Add to cart",
              "site": (ctx.site or {}).get("subdomain") or "preview", "preview": ctx.mode == "preview", "currency": demo_data().get("currency", "USD"),
              "showPrices": True, "limit": 1}
    if st.live:
        config.update(domain=st.store_domain, token=st.storefront_token)
    else:
        config["products"] = [{**p, "image": _img(p, ctx)} for p in demo_data()["products"]]
    data = json.dumps(config, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return ('<span class="tw-store tws-hcart" data-tw-store><button class="tws-cart-btn tws-cart-sm" type="button" data-tws-cart aria-haspopup="dialog" aria-expanded="false">'
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>'
            '<span class="tws-cart-word">Cart</span><span class="tws-count" data-tws-count hidden>0</span></button>'
            f'<script type="application/json" data-tws-config>{data}</script></span>')


def render(block: dict, ctx: WidgetContext) -> Markup:
    from . import get
    widget = get("store")
    cfg: StoreConfig = widget.config_for(block.get("data"))
    st: StoreSettings = ctx.settings or StoreSettings()
    live = st.live
    button = cfg.button_text or st.button_text or "Add to cart"
    collection = cfg.collection_handle or st.collection_handle
    currency = demo_data().get("currency", "USD")
    uid = re.sub(r"[^a-z0-9]", "", str(block.get("id") or "x").lower())[:16] or "x"
    in_preview = ctx.mode == "preview"

    config = {
        "variant": cfg.variant, "limit": cfg.limit, "showPrices": cfg.show_prices, "buttonText": button,
        "product": cfg.product_handle, "collection": collection, "live": live, "apiVersion": API_VERSION,
        "site": (ctx.site or {}).get("subdomain") or "preview", "preview": in_preview, "currency": currency,
        "filters": cfg.filters and cfg.variant in ("grid", "collection"), "sort": cfg.sort,
    }
    if live:
        config.update(domain=st.store_domain, token=st.storefront_token)
    else:
        products = demo_products(cfg, collection) if cfg.variant != "cart" else []
        all_demo = demo_data()["products"]
        config["products"] = [{**p, "image": _img(p, ctx)} for p in all_demo]    # quick view and the cart need them all

    head = ""
    if cfg.variant not in ("cart", "buy"):
        head = (f'<div class="tws-head"><div><h2 id="tws-{uid}-h" data-edit="heading">{escape(cfg.heading)}</h2>'
                + (f'<p class="intro">{escape(cfg.intro)}</p>' if cfg.intro else "") + "</div>")
    cart_btn = ('<button class="tws-cart-btn" type="button" data-tws-cart aria-haspopup="dialog" aria-expanded="false">'
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>'
                '<span>Cart</span><span class="tws-count" data-tws-count hidden>0</span></button>')
    badge = ('<p class="tws-badge" title="Only shown here in the CMS. Connect your Shopify store under Online store to sell.">Demo store</p>'
             if in_preview and not live else "")

    if cfg.variant == "cart":
        body = f'<div class="tws-cart-only">{cart_btn}{badge}</div>'
        inner = body
    elif cfg.variant == "buy":
        content = (f'<div data-tws-grid aria-busy="true"><div class="tws-buy tws-skel" aria-hidden="true"></div></div>' if live
                   else f'<div data-tws-grid>{buy_html(products[0], cfg, ctx, button, currency)}</div>')
        heading = f'<h2 id="tws-{uid}-h" class="tws-buy-h" data-edit="heading">{escape(cfg.heading)}</h2>' if cfg.heading else ""
        inner = heading + (f'<p class="intro">{escape(cfg.intro)}</p>' if cfg.intro else "") + badge + content
    else:
        if live:
            n = 1 if cfg.variant == "product" else cfg.limit
            skeleton = "".join('<li class="tws-item tws-skel" aria-hidden="true"><div class="tws-tile"></div></li>' for _ in range(min(n, 8)))
            content = (f'<div data-tws-grid aria-busy="true"><ul class="tws-grid tws-cols-{cfg.columns}">{skeleton}</ul></div>'
                       '<noscript><p class="empty-note">Turn on JavaScript to see the products.</p></noscript>')
        elif cfg.variant == "product":
            content = f'<div data-tws-grid>{_product_detail(products[0], cfg, ctx, button, currency, uid)}</div>'
        else:
            tiles = "".join(_tile(p, cfg, ctx, button, currency) for p in products)
            bar = toolbar_html(products, cfg, uid) if config["filters"] else ""
            content = f'{bar}<div data-tws-grid><ul class="tws-grid tws-cols-{cfg.columns}">{tiles}</ul></div>'
        note = ""
        if in_preview and not live and cfg.variant in ("product", "buy") and cfg.product_handle and products[0]["handle"] != cfg.product_handle:
            note = '<p class="tws-note">Demo: no sample product has that handle, so the first one is shown.</p>'
        inner = head + f'<div class="tws-tools">{badge}{cart_btn}</div></div>' + note + content
    data = json.dumps(config, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    label = ('aria-label="Cart"' if cfg.variant == "cart" else
             (f'aria-label="Buy {escape(products[0]["title"]) if not live else ""}"' if cfg.variant == "buy" and not cfg.heading else f'aria-labelledby="tws-{uid}-h"'))
    return Markup(
        f'<section class="band tw-store tws-v-{cfg.variant}" data-tw-store {label}><div class="wrap">'
        f'{inner}<p class="tws-sr" role="status" aria-live="polite" data-tws-status></p></div>'
        f'<script type="application/json" data-tws-config>{data}</script></section>')


register(Widget(
    name="store", label="Store (Shopify)",
    about="Sell from your Shopify store: a product grid, one product, a collection or a cart button.",
    config=StoreConfig, settings=StoreSettings, render=render,
    assets=["store.css", "store.js"],
    files=[f"img/{p.name}" for p in sorted((STATIC_DIR / "store" / "img").glob("*.webp"))],
    csp={"connect-src": ["https://*.myshopify.com"],
         "img-src": ["https://cdn.shopify.com", "https://*.myshopify.com"],
         "form-action": ["https://*.myshopify.com", "https://checkout.shopify.com"]},
    hint='Products come from the store connected under <a href="{settings}" target="_blank">Online store</a>. '
         "With no store connected the block shows sample products (Demo store).",
))
