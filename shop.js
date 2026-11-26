// shop.js: the Shop demo (shop.html), a Shopify-ready storefront in the Tenshi neon look.
//
// Two modes, set in data/shop-config.json (docs: AGENTS.md "Shop demo" and docs/SHOP.md):
//   demo  Products come from data/shop-demo.json. The cart works in this browser; checkout shows a
//         "Demo store: checkout is disabled" notice. Nothing talks to Shopify.
//   live  Products come from the Shopify Storefront API (GraphQL) of storeDomain, with the PUBLIC Storefront access token
//         (safe in the browser by design; never put an Admin API token or the Headless private token here). The cart
//         lives in this browser; Checkout creates a Shopify cart (Cart API, cartCreate) and sends the buyer to its
//         checkoutUrl, Shopify's own hosted checkout.
// No Shopify SDK is loaded: two small fetch() calls do the work, so the page stays light. Live products are only fetched
// when the product grid comes near the screen. Strings come from translations.js (shop* keys), English as fallback.
(function () {
  "use strict";
  const grid = document.getElementById("shop-grid");
  if (!grid) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const T = window.TRANSLATIONS || {};
  const t = (k, vars) => {
    const lang = document.documentElement.lang || "en";
    let s = (T[lang] && T[lang][k] !== undefined ? T[lang][k] : (T.en && T.en[k])) || k;
    if (vars) for (const v in vars) s = s.replace("{" + v + "}", vars[v]);
    return s;
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: cart lasts for this visit */ } },
  };
  const ver = grid.dataset.shopV || "";
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/shop\.js(\?.*)?$/, "");

  let config = { mode: "demo", currency: "USD" };
  let products = [];          // [{ id, handle, title, type, description, image, imageAlt, options:[{name, values}], variants:[{id, title, price, compareAt, available, options}] }]
  let live = false;
  let cartKey = "tse-shop-cart-demo";
  let cart = [];              // [{ variantId, handle, qty }]

  const money = (amount) => {
    try { return new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency: config.currency || "USD" }).format(+amount); }
    catch (e) { return "$" + (+amount).toFixed(2); }
  };
  const byHandle = (h) => products.find((p) => p.handle === h);
  const variantOf = (id) => { for (const p of products) { const v = p.variants.find((x) => x.id === id); if (v) return { p, v }; } return null; };
  const minPrice = (p) => Math.min(...p.variants.map((v) => +v.price));
  const priceLabel = (p) => {
    const prices = p.variants.map((v) => +v.price);
    const lo = Math.min(...prices);
    return Math.max(...prices) > lo ? t("shopFrom", { price: money(lo) }) : money(lo);
  };
  const firstAvailable = (p) => p.variants.find((v) => v.available) || p.variants[0];

  /* ---------- Data ---------- */
  const getJSON = (path) => fetch(BASE + path + (ver ? "?v=" + ver : ""), { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });

  async function storefront(query, variables) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (config.storefrontAccessToken) headers["X-Shopify-Storefront-Access-Token"] = config.storefrontAccessToken;
    const res = await fetch(`https://${config.storeDomain}/api/${config.apiVersion || "2026-10"}/graphql.json`, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.errors) throw new Error("Storefront API: " + res.status + " " + JSON.stringify(json.errors || ""));
    return json.data;
  }
  const PRODUCT_FIELDS = `id handle title productType description
    featuredImage { url(transform: { maxWidth: 800, maxHeight: 800 }) altText }
    options { name optionValues { name } }
    variants(first: 50) { nodes { id title availableForSale price { amount currencyCode } compareAtPrice { amount } selectedOptions { name value } } }`;
  async function liveProducts() {
    const first = Math.max(1, Math.min(+config.productCount || 12, 50));
    const data = config.collectionHandle
      ? await storefront(`query($h: String!, $n: Int!) { collection(handle: $h) { products(first: $n) { nodes { ${PRODUCT_FIELDS} } } } }`, { h: config.collectionHandle, n: first })
      : await storefront(`query($n: Int!) { products(first: $n, sortKey: BEST_SELLING) { nodes { ${PRODUCT_FIELDS} } } }`, { n: first });
    const nodes = config.collectionHandle ? ((data.collection || {}).products || {}).nodes || [] : data.products.nodes;
    return nodes.map((n) => {
      const opts = (n.options || []).filter((o) => !(o.name === "Title" && o.optionValues.length === 1 && o.optionValues[0].name === "Default Title"));
      const variants = n.variants.nodes.map((v) => ({
        id: v.id, title: v.title, price: v.price.amount, compareAt: v.compareAtPrice ? v.compareAtPrice.amount : null, available: v.availableForSale,
        options: Object.fromEntries(v.selectedOptions.filter((o) => opts.some((x) => x.name === o.name)).map((o) => [o.name, o.value])),
      }));
      if (variants[0]) config.currency = n.variants.nodes[0].price.currencyCode;
      return {
        id: n.id, handle: n.handle, title: n.title, type: n.productType || "", description: n.description || "",
        image: n.featuredImage ? n.featuredImage.url : "", imageAlt: (n.featuredImage && n.featuredImage.altText) || n.title,
        options: opts.map((o) => ({ name: o.name, values: o.optionValues.map((x) => x.name) })), variants,
      };
    });
  }

  /* ---------- Product grid ---------- */
  function tileHtml(p) {
    const sold = !p.variants.some((v) => v.available);
    const img = /^https?:/.test(p.image) ? p.image : BASE + p.image;
    return `<li class="shp-item" data-type="${esc(p.type)}">
          <article class="shp-tile">
            <button class="shp-media" type="button" data-shop-quick="${esc(p.handle)}" aria-label="${esc(t("shopQuickView") + ": " + p.title)}">
              <img src="${esc(img)}" alt="${esc(p.imageAlt)}" width="800" height="800" loading="lazy" decoding="async">
              <span class="shp-qv" aria-hidden="true">${esc(t("shopQuickView"))}</span>
            </button>
            <div class="shp-info">
              <span class="shp-type">${esc(p.type)}</span>
              <h3 class="shp-name">${esc(p.title)}</h3>
              <p class="shp-price">${esc(priceLabel(p))}</p>
            </div>
            <button class="shp-add" type="button" data-shop-add="${esc(p.handle)}"${sold ? " disabled" : ""}>${esc(sold ? t("shopSoldOut") : (p.options.length ? t("shopChoose") : t("shopAddToCart")))}</button>
          </article>
        </li>`;
  }
  function renderGrid() {
    grid.innerHTML = products.map(tileHtml).join("\n");
    renderFilters();
    applyFilter();
  }
  let filter = "all";
  function renderFilters() {
    const box = $("[data-shop-filters]");
    if (!box) return;
    const types = [...new Set(products.map((p) => p.type).filter(Boolean))];
    box.innerHTML = [`<button type="button" class="shp-chip" data-shop-filter="all" aria-pressed="${filter === "all"}">${esc(t("shopFilterAll"))}</button>`]
      .concat(types.map((ty) => `<button type="button" class="shp-chip" data-shop-filter="${esc(ty)}" aria-pressed="${filter === ty}">${esc(ty)}</button>`)).join("");
    box.hidden = types.length < 2;
  }
  function applyFilter() {
    $$(".shp-item", grid).forEach((li) => { li.hidden = filter !== "all" && li.dataset.type !== filter; });
    $$("[data-shop-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shopFilter === filter)));
  }

  /* ---------- Quick view (a <dialog>) ---------- */
  let dlg;
  function quickView(handle, opener) {
    const p = byHandle(handle);
    if (!p) return;
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "shp-dialog";
      dlg.setAttribute("aria-labelledby", "shp-dlg-title");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("close", () => { if (dlg._opener) dlg._opener.focus(); });
    }
    dlg._opener = opener;
    let v = firstAvailable(p);
    const img = /^https?:/.test(p.image) ? p.image : BASE + p.image;
    dlg.innerHTML = `<div class="shp-dlg-box">
      <button type="button" class="shp-x" data-shop-close aria-label="${esc(t("shopClose"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="shp-dlg-media"><img src="${esc(img)}" alt="${esc(p.imageAlt)}" width="800" height="800" decoding="async"></div>
      <div class="shp-dlg-body">
        <span class="shp-type">${esc(p.type)}</span>
        <h2 class="shp-dlg-title" id="shp-dlg-title">${esc(p.title)}</h2>
        <p class="shp-dlg-price" aria-live="polite"></p>
        <p class="shp-dlg-desc">${esc(p.description)}</p>
        ${p.options.map((o, i) => `<fieldset class="shp-opt"><legend>${esc(o.name)}</legend><div class="shp-opt-vals">${o.values.map((val) =>
          `<label class="shp-pill"><input type="radio" name="shp-opt-${i}" data-opt="${esc(o.name)}" value="${esc(val)}"${v.options[o.name] === val ? " checked" : ""}><span>${esc(val)}</span></label>`).join("")}</div></fieldset>`).join("")}
        <div class="shp-dlg-row">
          <div class="shp-qty" role="group" aria-label="${esc(t("shopQty"))}">
            <button type="button" data-q="-1" aria-label="${esc(t("shopLess"))}">−</button><output>1</output><button type="button" data-q="1" aria-label="${esc(t("shopMore"))}">+</button>
          </div>
          <button type="button" class="shp-play shp-dlg-add"><span class="shp-play-icon" aria-hidden="true"></span><span class="shp-dlg-add-label"></span></button>
        </div>
      </div>
    </div>`;
    let qty = 1;
    const sync = () => {
      const chosen = {};
      $$("input[data-opt]:checked", dlg).forEach((r) => { chosen[r.dataset.opt] = r.value; });
      v = p.variants.find((x) => p.options.every((o) => x.options[o.name] === chosen[o.name])) || v;
      $(".shp-dlg-price", dlg).innerHTML = esc(money(v.price)) + (v.compareAt && +v.compareAt > +v.price ? ` <s>${esc(money(v.compareAt))}</s>` : "");
      const add = $(".shp-dlg-add", dlg);
      add.disabled = !v.available;
      $(".shp-dlg-add-label", dlg).textContent = v.available ? t("shopAddToCart") : t("shopSoldOut");
      $(".shp-qty output", dlg).textContent = qty;
    };
    dlg.onchange = sync;
    dlg.onclick = (e) => {
      const q = e.target.closest("[data-q]");
      if (q) { qty = Math.max(1, Math.min(99, qty + +q.dataset.q)); sync(); }
      if (e.target.closest("[data-shop-close]")) dlg.close();
      if (e.target.closest(".shp-dlg-add") && v.available) { addToCart(p, v, qty); dlg.close(); openCart(); }
    };
    sync();
    dlg.showModal();
  }

  /* ---------- Cart (this browser) and the drawer ---------- */
  let drawer, scrim, lastFocus;
  const count = () => cart.reduce((n, l) => n + l.qty, 0);
  function saveCart() { store.set(cartKey, cart); renderCart(); }
  function addToCart(p, v, qty) {
    const line = cart.find((l) => l.variantId === v.id);
    if (line) line.qty = Math.min(99, line.qty + qty); else cart.push({ variantId: v.id, handle: p.handle, qty });
    saveCart();
    const live = $("[data-shop-status]");
    if (live) live.textContent = t("shopAdded", { item: p.title });
  }
  function buildDrawer() {
    scrim = document.createElement("div");
    scrim.className = "shp-scrim";
    scrim.hidden = true;
    drawer = document.createElement("aside");
    drawer.className = "shp-drawer";
    drawer.id = "shp-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-labelledby", "shp-drawer-title");
    drawer.hidden = true;
    drawer.innerHTML = `<div class="shp-drawer-head">
        <h2 id="shp-drawer-title" class="shp-drawer-title"></h2>
        <button type="button" class="shp-x" data-shop-close-cart><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <ul class="shp-lines"></ul>
      <p class="shp-empty"></p>
      <div class="shp-drawer-foot">
        <p class="shp-sub"><span class="shp-sub-label"></span><strong class="shp-sub-total"></strong></p>
        <p class="shp-fine"></p>
        <button type="button" class="shp-play shp-checkout"><span class="shp-play-icon" aria-hidden="true"></span><span class="shp-checkout-label"></span></button>
        <p class="shp-notice" role="status" hidden></p>
      </div>`;
    document.body.append(scrim, drawer);
    scrim.addEventListener("click", closeCart);
    drawer.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeCart();
      if (e.key === "Tab") {   // keep focus inside the drawer
        const f = $$("button:not([disabled]), a[href]", drawer).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    drawer.addEventListener("click", (e) => {
      if (e.target.closest("[data-shop-close-cart]")) return closeCart();
      const row = e.target.closest("[data-line]");
      const btn = e.target.closest("[data-line-q], [data-line-rm]");
      if (row && btn) {
        const line = cart.find((l) => l.variantId === row.dataset.line);
        if (!line) return;
        if (btn.hasAttribute("data-line-rm")) cart = cart.filter((l) => l !== line);
        else { line.qty += +btn.dataset.lineQ; if (line.qty < 1) cart = cart.filter((l) => l !== line); }
        saveCart();
        const again = $(`[data-line="${CSS.escape(row.dataset.line)}"] [data-line-q="${btn.dataset.lineQ}"]`, drawer);
        (again || $(".shp-x", drawer)).focus();
      }
      if (e.target.closest(".shp-checkout")) checkout();
    });
  }
  function renderCart() {
    $$("[data-shop-count]").forEach((el) => { el.textContent = count(); el.hidden = !count(); });
    if (!drawer) return;
    $(".shp-drawer-title", drawer).textContent = t("shopCart");
    $(".shp-x", drawer).setAttribute("aria-label", t("shopClose"));
    $(".shp-sub-label", drawer).textContent = t("shopSubtotal");
    $(".shp-fine", drawer).textContent = t("shopFine");
    $(".shp-checkout-label", drawer).textContent = t("shopCheckout");
    const lines = cart.map((l) => ({ l, m: variantOf(l.variantId) })).filter((x) => x.m);
    $(".shp-lines", drawer).innerHTML = lines.map(({ l, m }) => {
      const img = /^https?:/.test(m.p.image) ? m.p.image : BASE + m.p.image;
      return `<li class="shp-line" data-line="${esc(l.variantId)}">
        <img src="${esc(img)}" alt="" width="72" height="72" loading="lazy" decoding="async" aria-hidden="true">
        <div class="shp-line-info">
          <p class="shp-line-name">${esc(m.p.title)}</p>
          ${m.p.options.length ? `<p class="shp-line-var">${esc(m.v.title)}</p>` : ""}
          <div class="shp-qty shp-qty-sm" role="group" aria-label="${esc(t("shopQty") + ": " + m.p.title)}">
            <button type="button" data-line-q="-1" aria-label="${esc(t("shopLess"))}">−</button><output>${l.qty}</output><button type="button" data-line-q="1" aria-label="${esc(t("shopMore"))}">+</button>
          </div>
        </div>
        <div class="shp-line-end">
          <p class="shp-line-price">${esc(money(+m.v.price * l.qty))}</p>
          <button type="button" class="shp-rm" data-line-rm>${esc(t("shopRemove"))}</button>
        </div>
      </li>`;
    }).join("");
    const total = lines.reduce((s, { l, m }) => s + +m.v.price * l.qty, 0);
    $(".shp-sub-total", drawer).textContent = money(total);
    $(".shp-empty", drawer).textContent = t("shopCartEmpty");
    $(".shp-empty", drawer).hidden = !!lines.length;
    $(".shp-drawer-foot", drawer).hidden = !lines.length;
  }
  function openCart(opener) {
    if (!drawer) buildDrawer();
    lastFocus = opener || document.activeElement;
    renderCart();
    $(".shp-notice", drawer).hidden = true;
    drawer.hidden = scrim.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add("is-open"); scrim.classList.add("is-open"); });
    document.documentElement.classList.add("shp-lock");
    $$("[data-shop-cart]").forEach((b) => b.setAttribute("aria-expanded", "true"));
    setTimeout(() => $(".shp-x", drawer).focus(), 30);
  }
  function closeCart() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("is-open"); scrim.classList.remove("is-open");
    document.documentElement.classList.remove("shp-lock");
    $$("[data-shop-cart]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    setTimeout(() => { drawer.hidden = scrim.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  async function checkout() {
    const note = $(".shp-notice", drawer);
    const btn = $(".shp-checkout", drawer);
    if (!live) {
      note.innerHTML = `<strong>${esc(t("shopDemoCheckoutTitle"))}</strong> ${esc(t("shopDemoCheckoutText"))} <a href="${BASE}contact.html">${esc(t("shopDemoCheckoutLink"))}</a>`;
      note.hidden = false;
      return;
    }
    // Live: build a Shopify cart from this browser's lines, then go to Shopify's hosted checkout.
    btn.disabled = true;
    note.hidden = true;
    try {
      const lines = cart.filter((l) => variantOf(l.variantId)).map((l) => ({ merchandiseId: l.variantId, quantity: l.qty }));
      const data = await storefront(`mutation($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { checkoutUrl } userErrors { message } } }`, { lines });
      const r = data.cartCreate;
      if (r.userErrors && r.userErrors.length) throw new Error(r.userErrors.map((x) => x.message).join("; "));
      location.href = r.cart.checkoutUrl;
    } catch (err) {
      console.warn("[shop] checkout failed", err);
      note.textContent = t("shopCheckoutError");
      note.hidden = false;
      btn.disabled = false;
    }
  }

  /* ---------- Wiring ---------- */
  document.addEventListener("click", (e) => {
    const q = e.target.closest("[data-shop-quick]");
    if (q) return quickView(q.dataset.shopQuick, q);
    const a = e.target.closest("[data-shop-add]");
    if (a) {
      const p = byHandle(a.dataset.shopAdd);
      if (!p) return;
      if (p.options.length) return quickView(p.handle, a);   // pick a size or package first
      addToCart(p, firstAvailable(p), 1);
      return openCart(a);
    }
    const c = e.target.closest("[data-shop-cart]");
    if (c) return openCart(c);
    const f = e.target.closest("[data-shop-filter]");
    if (f) { filter = f.dataset.shopFilter; applyFilter(); }
  });
  document.addEventListener("tse:lang", () => { if (products.length) { renderGrid(); renderCart(); } });

  async function start() {
    try { config = Object.assign(config, await getJSON("data/shop-config.json")); } catch (e) { /* no config: demo */ }
    live = config.mode === "live" && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$|^[a-z0-9.-]+\.[a-z]{2,}$/i.test(config.storeDomain || "");
    if (live) {
      cartKey = "tse-shop-cart-" + config.storeDomain;
      try { products = await liveProducts(); }
      catch (err) { console.warn("[shop] live products failed, showing the demo", err); live = false; }
      if (live && !products.length) live = false;
    }
    if (!live) {
      cartKey = "tse-shop-cart-demo";
      const demo = await getJSON("data/shop-demo.json");
      config.currency = demo.currency || config.currency;
      products = demo.products;
    }
    document.documentElement.toggleAttribute("data-shop-live", live);
    $$("[data-shop-demo-only]").forEach((el) => { el.hidden = live; });
    cart = (store.get(cartKey) || []).filter((l) => l && variantOf(l.variantId) && l.qty > 0);
    // The demo grid is already in the page (built from shop-demo.json, for search engines and no-JS visitors); it is
    // drawn again here with the same markup so the visitor's language and live products apply.
    renderGrid();
    grid.removeAttribute("aria-busy");
    renderCart();
  }
  start().catch((err) => console.warn("[shop]", err));
})();
