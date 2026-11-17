/* Tenshi image effects: shimmer, sparkles, sprite-sheet overlays, glow pulse and hover tilt on any <img>.
   Styles: fx.css. Settings: data/fx.json (Tenshi Editor › Image effects), which tools/build-pages.mjs (and the editor,
   on Save) turns into fx-data.js (window.TENSHI_FX), loaded just before this file on every page.
   - Rules map a CSS selector to effect settings (".brand-logo", ".team-photo img", "#some-id"). A selector that
     matches something other than an image applies to the images inside it.
   - Any image can also opt in by itself: <img data-fx="shimmer sparkles" data-fx-sparkles-count="12" ...>
     (data-fx-<effect>-<setting>, settings named as in DEFAULTS below).
   - Each image is wrapped at runtime in <span class="fx-wrap"> (an image can't hold overlays itself); the wrapper takes
     over the image's display, margins and flex/grid placement so nothing moves. Overlays never catch the pointer.
   - Animations pause while the image is off screen, and none run for visitors who ask for reduced motion.
   Works in the browser (window.TenshiFX, which also starts the effects) and in Node (require: DEFAULTS, clean, dataJs). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.TenshiFX = api; api.boot(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ settings */
  var DEFAULTS = {
    shimmer: { on: false, color: "#ffffff", opacity: 0.55, angle: 110, width: 18, speed: 1.6, delay: 6, mode: "loop", clip: true },
    sparkles: { on: false, count: 8, colors: "#c8102e, #f4c1ca, #ffffff", sizeMin: 6, sizeMax: 12, speed: 2.4, spread: "edge", reach: 10, density: 0.45 },
    sprite: { on: false, url: "img/fx/glint.svg", frames: 8, frameWidth: 64, frameHeight: 64, fps: 12, loop: true, gap: 4, position: "top-end", scale: 0.6, blend: "screen" },
    glow: { on: false, color: "#c8102e", opacity: 0.35, size: 14, speed: 4 },
    tilt: { on: false, max: 8 }
  };
  var EFFECTS = ["shimmer", "sparkles", "sprite", "glow", "tilt"];
  var MODES = ["loop", "hover", "scroll"];
  var SPREADS = ["inside", "edge"];
  var POSITIONS = ["top-start", "top-end", "bottom-start", "bottom-end", "center"];
  var BLENDS = ["normal", "screen", "lighten", "overlay", "soft-light", "plus-lighter", "multiply"];
  /* Limits for every number (the editor's sliders use the same ones) */
  var RANGES = {
    shimmer: { opacity: [0, 1, 0.05], angle: [0, 180, 5], width: [4, 60, 1], speed: [0.4, 6, 0.1], delay: [0, 20, 0.5] },
    sparkles: { count: [1, 40, 1], sizeMin: [2, 30, 1], sizeMax: [2, 40, 1], speed: [0.6, 8, 0.1], reach: [0, 40, 1], density: [0.1, 1, 0.05] },
    sprite: { frames: [1, 60, 1], frameWidth: [8, 512, 1], frameHeight: [8, 512, 1], fps: [1, 60, 1], gap: [0, 20, 0.5], scale: [0.1, 4, 0.05] },
    glow: { opacity: [0, 1, 0.05], size: [2, 60, 1], speed: [1, 12, 0.5] },
    tilt: { max: [1, 25, 1] }
  };

  var HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  function num(v, r, d) {
    var n = parseFloat(v); if (!isFinite(n)) return d;
    n = Math.min(r[1], Math.max(r[0], n));
    return +(Math.round(n / r[2]) * r[2]).toFixed(4);
  }
  function color(v, d) { v = String(v == null ? "" : v).trim(); return HEX.test(v) ? v.toLowerCase() : d; }
  function pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function bool(v, d) { return v === true || v === "true" || v === "1" || v === "" ? true : v === false || v === "false" || v === "0" ? false : d; }
  function colors(v, d) {
    var list = String(v == null ? "" : v).split(/[\s,]+/).filter(function (c) { return HEX.test(c); }).slice(0, 6);
    return list.length ? list.join(", ").toLowerCase() : d;
  }
  function url(v, d) {
    v = String(v == null ? "" : v).trim();
    if (!v || /^\s*(javascript|data:text|vbscript):/i.test(v) || /["'()<>\\\s]/.test(v)) return d;
    return v.slice(0, 300);
  }
  /* One effect's settings, every value checked and filled in */
  function cleanEffect(name, s) {
    s = s && typeof s === "object" ? s : {};
    var d = DEFAULTS[name], r = RANGES[name], o = { on: bool(s.on, d.on) };
    Object.keys(d).forEach(function (k) {
      if (k === "on") return;
      if (r[k]) o[k] = num(s[k], r[k], d[k]);
      else if (k === "color") o[k] = color(s[k], d[k]);
      else if (k === "colors") o[k] = colors(s[k], d[k]);
      else if (k === "mode") o[k] = pick(s[k], MODES, d[k]);
      else if (k === "spread") o[k] = pick(s[k], SPREADS, d[k]);
      else if (k === "position") o[k] = pick(s[k], POSITIONS, d[k]);
      else if (k === "blend") o[k] = pick(s[k], BLENDS, d[k]);
      else if (k === "url") o[k] = url(s[k], d[k]);
      else if (typeof d[k] === "boolean") o[k] = bool(s[k], d[k]);
    });
    if (name === "sparkles" && o.sizeMax < o.sizeMin) o.sizeMax = o.sizeMin;
    return o;
  }
  function cleanRule(r, i) {
    r = r && typeof r === "object" ? r : {};
    var o = {
      id: String(r.id || "rule-" + (i + 1)).replace(/[^\w-]/g, "").slice(0, 40) || "rule-" + (i + 1),
      name: String(r.name || "").replace(/[<>]/g, "").slice(0, 80),
      selector: String(r.selector || "").replace(/[<>{}]/g, "").trim().slice(0, 300),
      enabled: bool(r.enabled, true)
    };
    EFFECTS.forEach(function (e) { o[e] = cleanEffect(e, r[e]); });
    return o;
  }
  /* The whole data/fx.json, checked and filled in */
  function clean(cfg) {
    cfg = cfg && typeof cfg === "object" ? cfg : {};
    return { enabled: bool(cfg.enabled, true), rules: (Array.isArray(cfg.rules) ? cfg.rules : []).slice(0, 50).map(cleanRule) };
  }
  /* fx-data.js, the file every page loads: the settings without rules that are off or have no effect switched on */
  function dataJs(cfg) {
    var c = clean(cfg);
    var live = { enabled: c.enabled, rules: c.rules.filter(function (r) {
      return r.enabled && r.selector && EFFECTS.some(function (e) { return r[e].on; });
    }).map(function (r) {
      var o = { selector: r.selector };
      EFFECTS.forEach(function (e) { if (r[e].on) o[e] = r[e]; });
      return o;
    }) };
    return "/* Written by tools/build-pages.mjs (and the Tenshi Editor on Save) from data/fx.json (Tenshi Editor › Image effects). Don't edit by hand. */\n" +
      "window.TENSHI_FX = " + JSON.stringify(live).replace(/</g, "\\u003c") + ";\n";
  }

  var api = { DEFAULTS: DEFAULTS, EFFECTS: EFFECTS, RANGES: RANGES, MODES: MODES, SPREADS: SPREADS, POSITIONS: POSITIONS, BLENDS: BLENDS,
    clean: clean, cleanRule: cleanRule, cleanEffect: cleanEffect, dataJs: dataJs, boot: function () {} };
  if (typeof document === "undefined") return api;

  /* ================================================================== browser runtime */
  var doc = document;
  var calm = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var finePointer = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: true };
  // the site's main folder, from this script's own address (pages in services/, projects/ and blog/ load ../fx.js)
  var script = doc.currentScript;
  var ROOT = script && script.src ? new URL(".", script.src).href : new URL(".", location.href).href;
  var live = [];   // controllers of images with effects

  var io = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var c = en.target.__fx; if (!c) return;
      c.visible = en.isIntersecting;
      en.target.classList.toggle("fx-paused", !en.isIntersecting);
      if (en.isIntersecting) c.onVisible();
    });
  }, { rootMargin: "60px" }) : null;
  var ro = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) { var c = en.target.__fx; if (c) c.layout(); });
  }) : null;

  /* keyframes that depend on a setting (the sweep's share of each cycle, how long each sparkle stays lit) */
  var sheet = null, made = {};
  function keyframes(name, body) {
    if (made[name]) return name;
    if (!sheet) { sheet = doc.createElement("style"); sheet.id = "fx-keyframes"; doc.head.appendChild(sheet); }
    sheet.appendChild(doc.createTextNode("@keyframes " + name + "{" + body + "}\n"));
    made[name] = true;
    return name;
  }
  function rgba(hex, a) {
    var h = hex.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&");
    var n = parseInt(h, 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }
  function el(cls, parent) { var s = doc.createElement("span"); s.className = cls; s.setAttribute("aria-hidden", "true"); if (parent) parent.appendChild(s); return s; }
  function isRtl(node) { return getComputedStyle(node).direction === "rtl"; }

  /* ---------- the wrapper ---------- */
  var MOVE = ["float", "verticalAlign", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "justifySelf", "order", "gridColumnStart", "gridColumnEnd", "gridRowStart", "gridRowEnd"];
  function wrap(img) {
    var target = img.parentElement && img.parentElement.tagName === "PICTURE" ? img.parentElement : img;
    var parent = target.parentElement;
    if (!parent) return null;
    if (parent.classList.contains("fx-wrap")) return parent;
    var cs = getComputedStyle(target);
    if (cs.position === "absolute" || cs.position === "fixed" || cs.display === "none" || cs.display === "contents") return null;
    var before = target.getBoundingClientRect();
    var w = doc.createElement("span");
    w.className = "fx-wrap";
    var block = /^(block|flex|grid|table|list-item|flow-root)$/.test(cs.display);
    w.style.display = block ? "block" : "inline-block";
    MOVE.forEach(function (p) { if (cs[p]) w.style[p] = cs[p]; });
    // margins move to the wrapper; equal side margins on a block image are taken as centring (margin: 0 auto)
    var ml = parseFloat(cs.marginLeft), mr = parseFloat(cs.marginRight);
    var centred = block && ml > 0 && Math.abs(ml - mr) < 1;
    w.style.marginTop = cs.marginTop; w.style.marginBottom = cs.marginBottom;
    w.style.marginLeft = centred ? "auto" : cs.marginLeft; w.style.marginRight = centred ? "auto" : cs.marginRight;
    if (block) w.style.width = "fit-content";
    w.style.maxWidth = "100%";
    target.__fxStyle = target.getAttribute("style");
    target.style.margin = "0";
    if (!block) target.style.display = "block";   // no baseline gap inside the wrapper; the wrapper keeps the baseline
    parent.insertBefore(w, target);
    w.appendChild(target);
    // an image sized by its container (width: 100%, height: 100%) would now be sized by the wrapper: hand that to the wrapper
    var after = target.getBoundingClientRect(), pr = parent.getBoundingClientRect();
    if (Math.abs(after.width - before.width) > 1 && pr.width) { w.style.width = (before.width / pr.width * 100).toFixed(3) + "%"; target.style.width = "100%"; }
    after = target.getBoundingClientRect();
    if (Math.abs(after.height - before.height) > 1) {
      if (pr.height && Math.abs(before.height - pr.height) < 2) { w.style.height = "100%"; target.style.height = "100%"; }
      else target.style.height = before.height + "px";
    }
    return w;
  }
  function unwrap(w) {
    var t = w.firstElementChild;
    if (t && w.parentElement) {
      if (t.__fxStyle == null) t.removeAttribute("style"); else t.setAttribute("style", t.__fxStyle);
      w.parentElement.insertBefore(t, w);
    }
    w.remove();
  }

  /* ---------- one image ---------- */
  function apply(img, settings) {
    if (!img || img.tagName !== "IMG") return null;
    if (img.__fxCtl) img.__fxCtl.destroy();
    var s = {};
    EFFECTS.forEach(function (e) { s[e] = cleanEffect(e, settings && settings[e]); });
    if (!EFFECTS.some(function (e) { return s[e].on; })) return null;
    var w = wrap(img);
    if (!w) return null;
    var layers = [], timers = [], offs = [];
    var ctl = { img: img, wrap: w, settings: s, visible: true, played: false };
    var on = function (node, ev, fn, opt) { node.addEventListener(ev, fn, opt); offs.push(function () { node.removeEventListener(ev, fn, opt); }); };
    var radius = getComputedStyle(img).borderRadius;
    var src = img.currentSrc || img.src;
    var fit = getComputedStyle(img).objectFit, maskSize = fit === "cover" ? "cover" : fit === "contain" || fit === "scale-down" ? "contain" : "100% 100%";
    var maskPos = getComputedStyle(img).objectPosition || "50% 50%";

    /* shimmer: a light band that sweeps across, clipped to the picture's own shape */
    var sh = null, band = null;
    if (s.shimmer.on) {
      sh = el("fx-layer fx-shimmer", w); layers.push(sh);
      sh.style.borderRadius = radius;
      if (s.shimmer.clip && src) {
        var m = 'url("' + src.replace(/"/g, "%22") + '")';
        sh.style.webkitMaskImage = m; sh.style.maskImage = m;
        sh.style.webkitMaskSize = maskSize; sh.style.maskSize = maskSize;
        sh.style.webkitMaskPosition = maskPos; sh.style.maskPosition = maskPos;
        sh.style.webkitMaskRepeat = "no-repeat"; sh.style.maskRepeat = "no-repeat";
      }
      band = el("fx-band", sh);
      var c = rgba(s.shimmer.color, s.shimmer.opacity), c2 = rgba(s.shimmer.color, s.shimmer.opacity * 0.35);
      band.style.background = "linear-gradient(90deg, transparent, " + c2 + " 30%, " + c + " 50%, " + c2 + " 70%, transparent)";
      var cycle = s.shimmer.speed + s.shimmer.delay;
      var pct = Math.max(5, Math.min(100, Math.round(s.shimmer.speed / cycle * 100)));
      var loopName = keyframes("fx-sweep-" + pct, "0%{transform:translate(var(--fx-x0),var(--fx-y0)) rotate(var(--fx-rot))}" +
        pct + "%,100%{transform:translate(var(--fx-x1),var(--fx-y1)) rotate(var(--fx-rot))}");
      var onceName = keyframes("fx-sweep-100", "0%{transform:translate(var(--fx-x0),var(--fx-y0)) rotate(var(--fx-rot))}100%{transform:translate(var(--fx-x1),var(--fx-y1)) rotate(var(--fx-rot))}");
      sh.dataset.mode = s.shimmer.mode;
      if (s.shimmer.mode === "loop") {
        // the first sweep comes after the pause, then one sweep per cycle
        band.style.animation = loopName + " " + cycle + "s cubic-bezier(.45,.05,.35,1) " + (-s.shimmer.speed) + "s infinite";
      } else {
        var play = function () {
          if (calm.matches) return;
          band.style.animation = "none"; void band.offsetWidth;
          band.style.animation = onceName + " " + s.shimmer.speed + "s cubic-bezier(.45,.05,.35,1) both";
        };
        if (s.shimmer.mode === "hover") {
          var host = w.closest("a, button") || w;
          on(host, "pointerenter", play); on(host, "focusin", play);
        } else ctl.playScroll = function () { if (!ctl.played) { ctl.played = true; timers.push(setTimeout(play, s.shimmer.delay * 1000)); } };
      }
    }

    /* sparkles: small four-point stars twinkling on and around the picture */
    var sp = null;
    if (s.sparkles.on) {
      sp = el("fx-layer fx-sparkles", w); layers.push(sp);
      var lit = Math.round(s.sparkles.density * 100);
      var tw = keyframes("fx-twinkle-" + lit, "0%{opacity:0;transform:scale(0) rotate(0deg)}" + (lit / 2) + "%{opacity:1;transform:scale(1) rotate(45deg)}" +
        lit + "%,100%{opacity:0;transform:scale(0) rotate(90deg)}");
      var cols = s.sparkles.colors.split(/\s*,\s*/);
      var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };   // same layout on every load
      for (var i = 0; i < s.sparkles.count; i++) {
        var st = el("fx-spark", sp), x, y, size = s.sparkles.sizeMin + rnd() * (s.sparkles.sizeMax - s.sparkles.sizeMin);
        if (s.sparkles.spread === "inside") { x = 8 + rnd() * 84 + "%"; y = 8 + rnd() * 84 + "%"; }
        else {
          // a point on the edge, pushed out by up to "reach" pixels (or a little in)
          var side = Math.floor(rnd() * 4), along = rnd() * 100, out = (rnd() * 1.25 - 0.25) * s.sparkles.reach;
          x = side === 0 ? "calc(" + along + "% )" : side === 1 ? "calc(100% + " + out + "px)" : side === 2 ? "calc(" + along + "%)" : "calc(" + (-out) + "px)";
          y = side === 0 ? "calc(" + (-out) + "px)" : side === 1 ? "calc(" + along + "%)" : side === 2 ? "calc(100% + " + out + "px)" : "calc(" + along + "%)";
        }
        st.style.insetInlineStart = x; st.style.top = y;
        st.style.width = st.style.height = size.toFixed(1) + "px";
        st.style.marginInlineStart = st.style.marginTop = (-size / 2).toFixed(1) + "px";
        st.style.setProperty("--fx-c", cols[i % cols.length]);
        var dur = s.sparkles.speed * (0.75 + rnd() * 0.5);
        st.style.animation = tw + " " + dur.toFixed(2) + "s ease-in-out " + (-rnd() * dur).toFixed(2) + "s infinite";
      }
    }

    /* sprite: a sprite-sheet strip played with steps() */
    var spr = null;
    if (s.sprite.on && s.sprite.url) {
      var p = s.sprite;
      spr = el("fx-sprite fx-pos-" + p.position, w); layers.push(spr);
      var fw = p.frameWidth * p.scale, fh = p.frameHeight * p.scale;
      spr.style.width = fw + "px"; spr.style.height = fh + "px";
      spr.style.marginInlineStart = (-fw / 2) + "px"; spr.style.marginTop = (-fh / 2) + "px";
      spr.style.backgroundImage = 'url("' + new URL(p.url, ROOT).href.replace(/"/g, "%22") + '")';
      spr.style.backgroundSize = (fw * p.frames) + "px " + fh + "px";
      spr.style.setProperty("--fx-sp-end", (-fw * p.frames) + "px");
      spr.style.mixBlendMode = p.blend;
      var dur2 = p.frames / p.fps;
      var anim = "fx-sprite " + dur2.toFixed(3) + "s steps(" + p.frames + ") ";
      if (p.loop && !p.gap) spr.style.animation = anim + "infinite";
      else {
        var run = function () { spr.style.animation = "none"; void spr.offsetWidth; spr.style.animation = anim + "1 both"; };
        run();
        if (p.loop) on(spr, "animationend", function () {
          timers.push(setTimeout(function again() { if (ctl.visible) run(); else ctl.pending = run; }, p.gap * 1000));
        });
      }
    }

    /* glow pulse: a soft coloured shadow cast by the picture's own shape */
    if (s.glow.on) {
      w.classList.add("fx-glow");
      w.style.setProperty("--fx-glow", rgba(s.glow.color, s.glow.opacity));
      w.style.setProperty("--fx-glow-size", s.glow.size + "px");
      w.style.setProperty("--fx-glow-speed", s.glow.speed + "s");
    }

    /* hover tilt */
    if (s.tilt.on && finePointer.matches) {
      w.classList.add("fx-tilt");
      on(w, "pointermove", function (e) {
        if (calm.matches) return;
        var r = w.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
        w.style.setProperty("--fx-rx", (-dy * 2 * s.tilt.max).toFixed(2) + "deg"); w.style.setProperty("--fx-ry", (dx * 2 * s.tilt.max).toFixed(2) + "deg");
      });
      on(w, "pointerleave", function () { w.style.setProperty("--fx-rx", "0deg"); w.style.setProperty("--fx-ry", "0deg"); });
    }

    /* the sweep's path depends on the picture's size and the angle */
    ctl.layout = function () {
      if (!band) return;
      var W = w.offsetWidth, H = w.offsetHeight; if (!W || !H) return;
      var phi = (s.shimmer.angle - 90) * Math.PI / 180, rtl = isRtl(w);
      if (rtl) phi = -phi;
      var bw = Math.max(6, s.shimmer.width / 100 * W);
      var len = W * Math.abs(Math.sin(phi)) + H * Math.abs(Math.cos(phi)) + bw * 2;
      var reach = (W * Math.abs(Math.cos(phi)) + H * Math.abs(Math.sin(phi))) / 2 + bw;
      var nx = Math.cos(phi) * (rtl ? -1 : 1), ny = Math.sin(phi) * (rtl ? -1 : 1);
      band.style.width = bw + "px"; band.style.height = len + "px";
      band.style.marginLeft = (-bw / 2) + "px"; band.style.marginTop = (-len / 2) + "px";
      band.style.setProperty("--fx-x0", (-nx * reach).toFixed(1) + "px"); band.style.setProperty("--fx-y0", (-ny * reach).toFixed(1) + "px");
      band.style.setProperty("--fx-x1", (nx * reach).toFixed(1) + "px"); band.style.setProperty("--fx-y1", (ny * reach).toFixed(1) + "px");
      band.style.setProperty("--fx-rot", (rtl ? -1 : 1) * (s.shimmer.angle - 90) + "deg");
    };
    ctl.onVisible = function () {
      if (ctl.playScroll) ctl.playScroll();
      if (ctl.pending) { var f = ctl.pending; ctl.pending = null; f(); }
    };
    ctl.destroy = function () {
      timers.forEach(clearTimeout); offs.forEach(function (f) { f(); });
      if (io) io.unobserve(w); if (ro) ro.unobserve(w);
      layers.forEach(function (l) { l.remove(); });
      w.classList.remove("fx-glow", "fx-tilt", "fx-paused");
      delete w.__fx; delete img.__fxCtl;
      unwrap(w);
      live = live.filter(function (c) { return c !== ctl; });
    };
    w.__fx = ctl; img.__fxCtl = ctl;
    ctl.layout();
    if (io) io.observe(w); else ctl.onVisible();
    if (ro) ro.observe(w);
    if (!img.complete) on(img, "load", function () { ctl.layout(); }, { once: true });
    live.push(ctl);
    return ctl;
  }

  /* ---------- rules and data-fx ---------- */
  function fromData(img) {
    var names = String(img.getAttribute("data-fx") || "").toLowerCase().split(/[\s,]+/), s = {};
    EFFECTS.forEach(function (e) {
      var raw = { on: names.indexOf(e) >= 0 };
      Object.keys(DEFAULTS[e]).forEach(function (k) {
        var a = img.getAttribute("data-fx-" + e + "-" + k.replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }));
        if (a != null) raw[k] = a;
      });
      s[e] = raw;
    });
    return s;
  }
  function images(node) { return node.tagName === "IMG" ? [node] : Array.prototype.slice.call(node.querySelectorAll("img")); }
  function scan(cfg) {
    if (!cfg || cfg.enabled === false) return;
    (cfg.rules || []).forEach(function (r) {
      var found; try { found = doc.querySelectorAll(r.selector); } catch (e) { return; }   // a mistyped selector just does nothing
      Array.prototype.forEach.call(found, function (n) {
        images(n).forEach(function (img) { if (!img.__fxCtl && !img.closest(".fx-layer, [data-fx-off]")) apply(img, r); });
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll("img[data-fx]"), function (img) { if (!img.__fxCtl) apply(img, fromData(img)); });
  }
  function boot() {
    var cfg = window.TENSHI_FX;
    if (!cfg) cfg = { enabled: true, rules: [] };
    var start = function () {
      scan(cfg);
      // pictures added later (lists drawn by scripts) get their effects too
      if (window.MutationObserver) {
        var t = 0;
        new MutationObserver(function (list) {
          if (!list.some(function (m) { return Array.prototype.some.call(m.addedNodes, function (n) { return n.nodeType === 1 && !(n.classList && (n.classList.contains("fx-wrap") || n.classList.contains("fx-layer"))); }); })) return;
          clearTimeout(t); t = setTimeout(function () { scan(cfg); }, 150);
        }).observe(doc.body, { childList: true, subtree: true });
      }
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
  }
  api.apply = apply;
  api.scan = scan;
  api.boot = boot;
  api.live = function () { return live.slice(); };
  return api;
});
