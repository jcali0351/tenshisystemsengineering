/* =====================================================================================================================
   store.js: the Store widget (Tenshi CMS, cms/widgets/store.py) on a client's page. Linked only on pages with a Store block.

   Each block is a <section data-tw-store> with its settings in <script type="application/json" data-tws-config>.
   Demo: the sample products come inside that config (the server already drew them); the cart works in this browser and
         checkout is switched off.
   Live: products come from the client's Shopify store, Storefront API 2026-10 (GraphQL, plain fetch(), no SDK), with the
         store's PUBLIC Storefront token (made by Shopify to be seen by browsers). They are only fetched when the block
         comes near the screen. Adding to the cart creates a Shopify cart (cartCreate), later adds use cartLinesAdd, and
         Checkout sends the visitor to the cart's checkoutUrl (Shopify's hosted checkout).
   All Store blocks on a page share one cart and one cart drawer. Based on the marketing site's shop.js.
   ===================================================================================================================== */
(function () {
  "use strict";
  var roots = Array.prototype.slice.call(document.querySelectorAll("[data-tw-store]"));
  if (!roots.length) return;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: cart lasts for this visit */ } }
  };

  // One shared state: the store (same for every block of a site), every product seen so far, and the cart.
  var blocks = roots.map(function (root) {
    var cfg = {};
    try { cfg = JSON.parse(($("[data-tws-config]", root) || {}).textContent || "{}"); } catch (e) { /* keep defaults */ }
    return { root: root, cfg: cfg };
  });
  var S = blocks[0].cfg;
  var live = !!(S.live && S.domain && S.token);
  var currency = S.currency || "USD";
  var products = {};                                    // handle -> product
  (S.products || []).forEach(function (p) { products[p.handle] = p; });
  var cartKey = "tws-cart-" + (S.site || "site") + "-" + (live ? S.domain : "demo");
  var cart = (store.get(cartKey) || { lines: [] });      // { lines: [{ variantId, handle, qty, title, vtitle, price, image }], id, checkoutUrl, synced }
  cart.lines = (cart.lines || []).filter(function (l) { return l && l.variantId && l.qty > 0; });

  var money = function (amount) {
    try { return new Intl.NumberFormat(document.documentElement.lang || "en", { style: "currency", currency: currency }).format(+amount); }
    catch (e) { return "$" + (+amount).toFixed(2); }
  };
  var priceLabel = function (p) {
    var prices = p.variants.map(function (v) { return +v.price; });
    var lo = Math.min.apply(null, prices);
    return (Math.max.apply(null, prices) > lo ? "From " : "") + money(lo);
  };
  var firstAvailable = function (p) { return p.variants.filter(function (v) { return v.available; })[0] || p.variants[0]; };
  var say = function (text) { var s = $("[data-tws-status]"); if (s) { s.textContent = ""; setTimeout(function () { s.textContent = text; }, 30); } };

  /* ---------- Shopify Storefront API ---------- */
  function storefront(query, variables) {
    return fetch("https://" + S.domain + "/api/" + (S.apiVersion || "2026-10") + "/graphql.json", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Shopify-Storefront-Access-Token": S.token },
      body: JSON.stringify({ query: query, variables: variables })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || json.errors) throw new Error("Storefront API " + res.status + " " + JSON.stringify(json.errors || ""));
        return json.data;
      });
    });
  }
  var FIELDS = "id handle title productType description requiresSellingPlan featuredImage { url(transform: { maxWidth: 800, maxHeight: 800 }) altText } " +
    "options { name optionValues { name } } " +
    "variants(first: 50) { nodes { id title availableForSale price { amount currencyCode } compareAtPrice { amount } selectedOptions { name value } } }";
  function shape(n) {
    var opts = (n.options || []).filter(function (o) { return !(o.name === "Title" && o.optionValues.length === 1 && o.optionValues[0].name === "Default Title"); });
    var variants = n.variants.nodes.map(function (v) {
      var o = {};
      v.selectedOptions.forEach(function (x) { if (opts.some(function (y) { return y.name === x.name; })) o[x.name] = x.value; });
      // Subscription-only products need a selling plan this widget doesn't offer: shown, but not addable
      return { id: v.id, title: v.title, price: v.price.amount, compareAt: v.compareAtPrice ? v.compareAtPrice.amount : null, available: v.availableForSale && !n.requiresSellingPlan, options: o };
    });
    if (n.variants.nodes[0]) currency = n.variants.nodes[0].price.currencyCode;
    var p = { id: n.id, handle: n.handle, title: n.title, subscription: !!n.requiresSellingPlan, type: n.productType || "", description: n.description || "",
      image: n.featuredImage ? n.featuredImage.url : "", imageAlt: (n.featuredImage && n.featuredImage.altText) || n.title,
      options: opts.map(function (o) { return { name: o.name, values: o.optionValues.map(function (x) { return x.name; }) }; }), variants: variants };
    products[p.handle] = p;
    return p;
  }
  function loadLive(cfg) {
    var n = Math.max(1, Math.min(+cfg.limit || 8, 50));
    if (cfg.variant === "product") {
      if (!cfg.product) return storefront("query($n: Int!) { products(first: 1, sortKey: BEST_SELLING) { nodes { " + FIELDS + " } } }", { n: 1 }).then(function (d) { return d.products.nodes.map(shape); });
      return storefront("query($h: String!) { product(handle: $h) { " + FIELDS + " } }", { h: cfg.product }).then(function (d) { return d.product ? [shape(d.product)] : []; });
    }
    if (cfg.collection) {
      return storefront("query($h: String!, $n: Int!) { collection(handle: $h) { products(first: $n) { nodes { " + FIELDS + " } } } }", { h: cfg.collection, n: n })
        .then(function (d) { return (((d.collection || {}).products || {}).nodes || []).map(shape); });
    }
    return storefront("query($n: Int!) { products(first: $n, sortKey: BEST_SELLING) { nodes { " + FIELDS + " } } }", { n: n }).then(function (d) { return d.products.nodes.map(shape); });
  }

  /* ---------- Drawing (the same markup the server draws for demo mode) ---------- */
  function tileHtml(p, cfg) {
    var sold = !p.variants.some(function (v) { return v.available; });
    var label = sold ? (p.subscription ? "Subscription only" : "Sold out") : (p.options.length ? "Choose options" : cfg.buttonText);
    return '<li class="tws-item"><article class="tws-tile">' +
      '<button class="tws-media" type="button" data-tws-quick="' + esc(p.handle) + '" aria-label="Quick view: ' + esc(p.title) + '">' +
      '<img src="' + esc(p.image) + '" alt="' + esc(p.imageAlt || p.title) + '" width="800" height="800" loading="lazy" decoding="async"></button>' +
      '<div class="tws-info"><span class="tws-type">' + esc(p.type) + '</span><h3 class="tws-name">' + esc(p.title) + "</h3>" +
      (cfg.showPrices ? '<p class="tws-price">' + esc(priceLabel(p)) + "</p>" : "") + "</div>" +
      '<button class="btn tws-add" type="button" data-tws-add="' + esc(p.handle) + '"' + (sold ? " disabled" : "") + ">" + esc(label) + "</button></article></li>";
  }
  function optionsHtml(p, v, name) {
    return p.options.map(function (o, i) {
      return '<fieldset class="tws-opt"><legend>' + esc(o.name) + '</legend><div class="tws-opt-vals">' + o.values.map(function (val) {
        return '<label class="tws-pill"><input type="radio" name="' + name + i + '" data-opt="' + esc(o.name) + '" value="' + esc(val) + '"' +
          (v.options[o.name] === val ? " checked" : "") + "><span>" + esc(val) + "</span></label>";
      }).join("") + "</div></fieldset>";
    }).join("");
  }
  function detailHtml(p, cfg, uid) {
    var v = firstAvailable(p);
    return '<div class="tws-pd" data-tws-product="' + esc(p.handle) + '"><div class="tws-pd-media"><img src="' + esc(p.image) + '" alt="' + esc(p.imageAlt || p.title) +
      '" width="800" height="800" loading="lazy" decoding="async"></div><div class="tws-pd-body"><span class="tws-type">' + esc(p.type) + '</span><h3 class="tws-pd-title">' +
      esc(p.title) + "</h3>" + (cfg.showPrices ? '<p class="tws-pd-price" data-tws-price aria-live="polite">' + esc(money(v.price)) + "</p>" : "") +
      '<p class="tws-pd-desc">' + esc(p.description) + "</p>" + optionsHtml(p, v, "tws-" + uid + "-o") +
      '<div class="tws-pd-row"><div class="tws-qty" role="group" aria-label="Quantity"><button type="button" data-q="-1" aria-label="One less">−</button><output>1</output>' +
      '<button type="button" data-q="1" aria-label="One more">+</button></div><button class="btn tws-pd-add" type="button" data-tws-pd-add>' + esc(cfg.buttonText) + "</button></div></div></div>";
  }

  // Single product: options, quantity and Add live inside the block (also used by the quick view dialog)
  function wireDetail(box, p, cfg, onAdded) {
    var v = firstAvailable(p), qty = 1;
    var sync = function () {
      var chosen = {};
      $$("input[data-opt]:checked", box).forEach(function (r) { chosen[r.dataset.opt] = r.value; });
      v = p.variants.filter(function (x) { return p.options.every(function (o) { return x.options[o.name] === chosen[o.name]; }); })[0] || v;
      var pr = $("[data-tws-price]", box);
      if (pr) pr.innerHTML = esc(money(v.price)) + (v.compareAt && +v.compareAt > +v.price ? " <s>" + esc(money(v.compareAt)) + "</s>" : "");
      var add = $("[data-tws-pd-add]", box);
      add.disabled = !v.available;
      add.textContent = v.available ? cfg.buttonText : "Sold out";
      $(".tws-qty output", box).textContent = qty;
    };
    box.addEventListener("change", sync);
    box.addEventListener("click", function (e) {
      var q = e.target.closest("[data-q]");
      if (q) { qty = Math.max(1, Math.min(99, qty + +q.dataset.q)); sync(); }
      var a = e.target.closest("[data-tws-pd-add]");
      if (a && v.available) { addToCart(p, v, qty); if (onAdded) onAdded(); openCart(a); }
    });
    sync();
  }

  function start(b, i) {
    var cfg = b.cfg, root = b.root, holder = $("[data-tws-grid]", root);
    if (!cfg.buttonText) cfg.buttonText = "Add to cart";
    var draw = function (list) {
      if (!holder) return;
      if (!list.length) {
        var why = cfg.variant === "product" && cfg.product ? "No product with the handle “" + cfg.product + "” is published to this store's Headless channel."
          : cfg.collection ? "The collection “" + cfg.collection + "” is empty or isn't published to the Headless channel." : "No products are published to this store's Headless channel yet.";
        holder.innerHTML = '<p class="empty-note">' + esc(cfg.preview ? why : "No products to show yet.") + "</p>";
        holder.removeAttribute("aria-busy"); return;
      }
      if (cfg.variant === "product") { holder.innerHTML = detailHtml(list[0], cfg, "b" + i); wireDetail($(".tws-pd", holder), list[0], cfg); }
      else holder.innerHTML = '<ul class="tws-grid tws-cols-' + esc(($(".tws-grid", holder) || { className: "" }).className.replace(/.*tws-cols-(\d).*/, "$1") || "3") + '">' + list.map(function (p) { return tileHtml(p, cfg); }).join("") + "</ul>";
      holder.removeAttribute("aria-busy");
    };
    if (!live) {                                // demo: the server drew it; just wire the single product
      var pd = $(".tws-pd", root);
      if (pd && products[pd.dataset.twsProduct]) wireDetail(pd, products[pd.dataset.twsProduct], cfg);
      return;
    }
    if (cfg.variant === "cart" || !holder) return;
    var go = function () {
      loadLive(cfg).then(draw).catch(function (err) {
        console.warn("[store]", err);
        holder.innerHTML = '<p class="empty-note">The shop can\'t be reached right now. Please try again later.</p>';
        holder.removeAttribute("aria-busy");
      });
    };
    if ("IntersectionObserver" in window) {     // lazy: fetch when the block comes near the screen
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); }
      }, { rootMargin: "400px 0px" });
      io.observe(root);
    } else go();
  }

  /* ---------- Quick view (a <dialog>) ---------- */
  var dlg;
  function quickView(handle, opener, cfg) {
    var p = products[handle];
    if (!p) return;
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "tws-dialog";
      dlg.setAttribute("aria-labelledby", "tws-dlg-title");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-tws-close]")) dlg.close(); });
      dlg.addEventListener("close", function () { if (dlg._opener && dlg._opener.isConnected) dlg._opener.focus(); });
    }
    dlg._opener = opener;
    dlg.innerHTML = '<div class="tws-dlg-box"><button type="button" class="tws-x" data-tws-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      detailHtml(p, { showPrices: true, buttonText: cfg.buttonText }, "dlg").replace('class="tws-pd-title"', 'class="tws-pd-title" id="tws-dlg-title"') + "</div>";
    wireDetail($(".tws-pd", dlg), p, { buttonText: cfg.buttonText }, function () { dlg.close(); });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }

  /* ---------- Cart (this browser + the Shopify cart in live mode) and the drawer ---------- */
  var drawer, scrim, lastFocus;
  var count = function () { return cart.lines.reduce(function (n, l) { return n + l.qty; }, 0); };
  function saveCart() { store.set(cartKey, cart); renderCart(); }
  function addToCart(p, v, qty) {
    var line = cart.lines.filter(function (l) { return l.variantId === v.id; })[0];
    if (line) line.qty = Math.min(99, line.qty + qty);
    else cart.lines.push({ variantId: v.id, handle: p.handle, qty: qty, title: p.title, vtitle: p.options.length ? v.title : "", price: v.price, image: p.image });
    saveCart();
    say(p.title + " added to the cart.");
    if (live) syncAdd(v.id, qty);
  }
  // Live: keep a Shopify cart in step. First add: cartCreate; later adds: cartLinesAdd. Quantity changes in the drawer
  // mark it out of date, and Checkout then makes a fresh cart from the drawer's lines.
  var pending = Promise.resolve();
  function syncAdd(variantId, qty) {
    pending = pending.then(function () {
      var lines = [{ merchandiseId: variantId, quantity: qty }];
      if (cart.id && cart.synced) {
        return storefront("mutation($id: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $id, lines: $lines) { cart { id checkoutUrl } userErrors { message } } }", { id: cart.id, lines: lines })
          .then(function (d) { return d.cartLinesAdd; });
      }
      return storefront("mutation($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { id checkoutUrl } userErrors { message } } }",
        { lines: cart.lines.map(function (l) { return { merchandiseId: l.variantId, quantity: l.qty }; }) }).then(function (d) { return d.cartCreate; });
    }).then(function (r) {
      if (r.userErrors && r.userErrors.length) throw new Error(r.userErrors.map(function (x) { return x.message; }).join("; "));
      cart.id = r.cart.id; cart.checkoutUrl = r.cart.checkoutUrl; cart.synced = true; store.set(cartKey, cart);
    }).catch(function (err) { console.warn("[store] cart", err); cart.synced = false; store.set(cartKey, cart); });
    return pending;
  }
  function buildDrawer() {
    scrim = document.createElement("div");
    scrim.className = "tws-scrim";
    scrim.hidden = true;
    drawer = document.createElement("aside");
    drawer.className = "tws-drawer";
    drawer.id = "tws-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-labelledby", "tws-drawer-title");
    drawer.hidden = true;
    drawer.innerHTML = '<div class="tws-drawer-head"><h2 id="tws-drawer-title" class="tws-drawer-title">Your cart</h2>' +
      '<button type="button" class="tws-x" data-tws-close-cart aria-label="Close the cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<ul class="tws-lines"></ul><p class="tws-empty">Your cart is empty.</p>' +
      '<div class="tws-drawer-foot"><p class="tws-sub"><span>Subtotal</span><strong class="tws-sub-total"></strong></p>' +
      '<p class="tws-fine">Taxes and shipping are worked out at checkout.</p>' +
      '<button type="button" class="btn tws-checkout">Checkout</button><p class="tws-notice" role="status" hidden></p></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    scrim.addEventListener("click", closeCart);
    drawer.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeCart();
      if (e.key === "Tab") {                    // keep focus inside the drawer
        var f = $$("button:not([disabled]), a[href]", drawer).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("[data-tws-close-cart]")) return closeCart();
      var row = e.target.closest("[data-line]"), btn = e.target.closest("[data-line-q], [data-line-rm]");
      if (row && btn) {
        var line = cart.lines.filter(function (l) { return l.variantId === row.dataset.line; })[0];
        if (!line) return;
        if (btn.hasAttribute("data-line-rm")) cart.lines = cart.lines.filter(function (l) { return l !== line; });
        else { line.qty += +btn.dataset.lineQ; if (line.qty < 1) cart.lines = cart.lines.filter(function (l) { return l !== line; }); }
        cart.synced = false;                    // the Shopify cart no longer matches: Checkout makes a fresh one
        saveCart();
        var again = $('[data-line="' + (window.CSS && CSS.escape ? CSS.escape(row.dataset.line) : row.dataset.line) + '"] [data-line-q="' + btn.dataset.lineQ + '"]', drawer);
        (again || $(".tws-x", drawer)).focus();
      }
      if (e.target.closest(".tws-checkout")) checkout();
    });
  }
  function renderCart() {
    $$("[data-tws-count]").forEach(function (el) { el.textContent = count(); el.hidden = !count(); });
    $$("[data-tws-cart]").forEach(function (b) { b.setAttribute("aria-label", "Cart, " + count() + (count() === 1 ? " item" : " items")); });
    if (!drawer) return;
    $(".tws-lines", drawer).innerHTML = cart.lines.map(function (l) {
      return '<li class="tws-line" data-line="' + esc(l.variantId) + '"><img src="' + esc(l.image) + '" alt="" width="72" height="72" loading="lazy" decoding="async">' +
        '<div class="tws-line-info"><p class="tws-line-name">' + esc(l.title) + "</p>" + (l.vtitle ? '<p class="tws-line-var">' + esc(l.vtitle) + "</p>" : "") +
        '<div class="tws-qty tws-qty-sm" role="group" aria-label="Quantity: ' + esc(l.title) + '"><button type="button" data-line-q="-1" aria-label="One less">−</button><output>' + l.qty +
        '</output><button type="button" data-line-q="1" aria-label="One more">+</button></div></div><div class="tws-line-end"><p class="tws-line-price">' + esc(money(+l.price * l.qty)) +
        '</p><button type="button" class="tws-rm" data-line-rm>Remove</button></div></li>';
    }).join("");
    $(".tws-sub-total", drawer).textContent = money(cart.lines.reduce(function (s, l) { return s + +l.price * l.qty; }, 0));
    $(".tws-empty", drawer).hidden = !!cart.lines.length;
    $(".tws-drawer-foot", drawer).hidden = !cart.lines.length;
  }
  function openCart(opener) {
    if (!drawer) buildDrawer();
    lastFocus = opener || document.activeElement;
    renderCart();
    $(".tws-notice", drawer).hidden = true;
    drawer.hidden = scrim.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add("is-open"); scrim.classList.add("is-open"); });
    document.documentElement.classList.add("tws-lock");
    $$("[data-tws-cart]").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    setTimeout(function () { $(".tws-x", drawer).focus(); }, 30);
  }
  function closeCart() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("is-open"); scrim.classList.remove("is-open");
    document.documentElement.classList.remove("tws-lock");
    $$("[data-tws-cart]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    setTimeout(function () { drawer.hidden = scrim.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function checkout() {
    var note = $(".tws-notice", drawer), btn = $(".tws-checkout", drawer);
    if (!live) {
      note.innerHTML = "<strong>Demo store:</strong> checkout is switched off. " + (S.preview ? "Connect your Shopify store under Online store to sell." : "This shop isn't open yet.");
      note.hidden = false;
      return;
    }
    btn.disabled = true; note.hidden = true;
    pending.then(function () {
      if (cart.id && cart.synced && cart.checkoutUrl) return cart.checkoutUrl;
      cart.id = null;
      return syncAdd(null, 0).then(function () { if (!cart.synced) throw new Error("cart"); return cart.checkoutUrl; });
    }).then(function (url) { location.href = url; }).catch(function (err) {
      console.warn("[store] checkout", err);
      note.textContent = "Checkout couldn't start. Please try again in a moment.";
      note.hidden = false; btn.disabled = false;
    });
  }

  /* ---------- Wiring ---------- */
  var cfgOf = function (el) { var r = el.closest("[data-tw-store]"); var b = blocks.filter(function (x) { return x.root === r; })[0]; return b ? b.cfg : S; };
  document.addEventListener("click", function (e) {
    var q = e.target.closest("[data-tws-quick]");
    if (q) return quickView(q.dataset.twsQuick, q, cfgOf(q));
    var a = e.target.closest("[data-tws-add]");
    if (a) {
      var p = products[a.dataset.twsAdd];
      if (!p) return;
      if (p.options.length) return quickView(p.handle, a, cfgOf(a));    // pick a size or package first
      addToCart(p, firstAvailable(p), 1);
      return openCart(a);
    }
    var c = e.target.closest("[data-tws-cart]");
    if (c) openCart(c);
  });
  blocks.forEach(start);
  renderCart();
})();
