/* Tenshi Editor › Buttons: turns the button settings (data/buttons.json) into CSS.
   Used by the editor for its live preview and by tools/build-pages.mjs to write buttons.css, which every page loads after
   site-theme.css. Every setting is optional: an empty value keeps the site's normal look. The one rule set
   that is always written is the homepage hero button's default "Flat red" look (Hero button style; set it to Glass to
   show the glass pill from hero-cta.css instead). Works in the browser (window.TenshiButtonStyle) and in Node (require). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TenshiButtonStyle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* The button types on the site, most general first: a later, more specific type wins where both are set
     (the contact form's Send button is also a primary button). */
  var TYPES = [
    { key: "primary", label: "Primary buttons", sel: ".btn-primary", note: "Red buttons: Request Consultation, See all services, Meet the team, portal buttons, team Contact." },
    { key: "submit", label: "Form send button", sel: ".contact-form button[type=submit]", note: "The Send button of the contact forms (also a primary button; settings here win)." },
    { key: "light", label: "Light buttons", sel: ".btn-light", note: "White buttons in the red call-to-action boxes on service, team and technology pages." },
    { key: "dark", label: "Dark button", sel: ".btn-dark", note: "The dark \u201cchat with us\u201d button on the contact page." },
    { key: "more", label: "\u201cLearn more\u201d card buttons", sel: ".btn-more", note: "The Learn more links on the homepage service cards." },
    { key: "project", label: "Project buttons", sel: ".prj-btn", note: "View, download and Cloudflare buttons on the projects pages." },
    { key: "textLink", label: "\u201cAll posts / All news\u201d links", sel: ".fw-more, .svc-tech-more a, .blog-read", note: "Footer \u201cAll news / All posts\u201d, \u201cSee the technology\u201d and blog card \u201cRead\u201d links." },
    { key: "tabs", label: "News tabs", sel: ".news-tabs [role=tab]", note: "The category tabs on the news page (the selected tab keeps its red look unless you set colors)." },
    { key: "lang", label: "Language picker", sel: ".lang-current", note: "The flag button in the header that opens the language menu." },
    { key: "chat", label: "Ask Tenshi chat button", sel: ".tk-launch", note: "The round chat launcher at the bottom corner." },
    { key: "chatSend", label: "Chat send button", sel: ".tk-send", note: "The send arrow inside the Tenshi chat window." },
    /* The homepage hero's glass pill (hero-cta.css). It has its own controls: they set the --hg-* variables that
       hero-cta.css builds the button from, so the glass layers, icon and phone sizes all follow. */
    { key: "heroGlass", label: "Hero button (Deploy Your Future)", sel: ".hero-cta-glass .hg-btn",
      note: "The big call-to-action button with the round arrow on the homepage hero. Hero button style: Flat red (the default: solid red, white bold text) or Glass (the see-through pill). Text and icon colors and the hover text color apply to the Glass style; size, corner rounding and hover lift apply to both. Corner rounding 40 = fully round.",
      fields: ["style", "color", "iconBg", "iconColor", "scale", "radius", "font", "weight", "tracking", "transform", "hoverColor", "hoverLift"],
      vars: { color: "--hg-text", iconBg: "--hg-icon-bg", iconColor: "--hg-icon-fg", scale: "--hg-scale", radius: "--hg-r", hoverLift: "--hg-lift" },
      defaults: { color: "#3e3e3e", iconBg: "#3e3e3e", iconColor: "#f5f5f5", scale: 1, radius: 40, hoverLift: 3, hoverColor: "#3e3e3e" },
      ranges: { radius: { min: 0, max: 40 }, hoverLift: { max: 10 } } }
  ];

  /* The controls, in the order the editor shows them. type: color | range | select | font | text */
  var W = [["", "Site default"], ["300", "300 Light"], ["400", "400 Regular"], ["500", "500 Medium"], ["600", "600 Semibold"], ["700", "700 Bold"], ["800", "800 Extra bold"], ["900", "900 Black"]];
  var SH = [["", "Site default"], ["none", "None"], ["soft", "Soft"], ["medium", "Medium"], ["lifted", "Lifted"], ["strong", "Strong"], ["glow", "Red glow"]];
  var HERO_STYLES = [["", "Flat red"], ["glass", "Glass"]];
  var FIELDS = [
    // Only for the hero button: which of its two looks the site shows (data/buttons.json types.heroGlass.style)
    { key: "style", label: "Hero button style", type: "select", options: HERO_STYLES, group: "Normal", only: true },
    { key: "bg", label: "Background", type: "color", group: "Normal" },
    { key: "color", label: "Text color", type: "color", group: "Normal" },
    { key: "borderWidth", label: "Border width", type: "range", min: 0, max: 6, step: 0.5, unit: "px", start: 1, group: "Normal" },
    { key: "borderColor", label: "Border color", type: "color", group: "Normal" },
    { key: "borderStyle", label: "Border style", type: "select", options: [["", "Site default"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["double", "Double"], ["none", "None"]], group: "Normal" },
    { key: "radius", label: "Corner rounding", type: "range", min: 0, max: 60, step: 1, unit: "px", start: 8, group: "Normal" },
    { key: "padX", label: "Padding left and right", type: "range", min: 0, max: 60, step: 1, unit: "px", start: 24, group: "Normal" },
    { key: "padY", label: "Padding top and bottom", type: "range", min: 0, max: 40, step: 1, unit: "px", start: 12, group: "Normal" },
    { key: "font", label: "Font", type: "font", group: "Text" },
    { key: "size", label: "Text size", type: "range", min: 10, max: 32, step: 0.5, unit: "px", start: 16, group: "Text" },
    { key: "weight", label: "Weight", type: "select", options: W, group: "Text" },
    { key: "tracking", label: "Letter spacing", type: "range", min: -0.05, max: 0.4, step: 0.005, unit: "em", start: 0, group: "Text" },
    { key: "transform", label: "Letter case", type: "select", options: [["", "Site default"], ["none", "As written"], ["uppercase", "ALL CAPITALS"], ["lowercase", "all lowercase"], ["capitalize", "Capitalize Each Word"]], group: "Text" },
    { key: "shadow", label: "Shadow", type: "select", options: SH, group: "Normal" },
    { key: "hoverBg", label: "Hover background", type: "color", group: "Hover" },
    { key: "hoverColor", label: "Hover text color", type: "color", group: "Hover" },
    { key: "hoverBorderColor", label: "Hover border color", type: "color", group: "Hover" },
    { key: "hoverShadow", label: "Hover shadow", type: "select", options: SH, group: "Hover" },
    { key: "hoverLift", label: "Hover lift", type: "range", min: 0, max: 10, step: 0.5, unit: "px", start: 0, group: "Hover" },
    { key: "hoverScale", label: "Hover grow", type: "range", min: 0.9, max: 1.2, step: 0.01, unit: "×", start: 1, group: "Hover" },
    { key: "duration", label: "Transition time", type: "range", min: 0, max: 1000, step: 10, unit: "ms", start: 200, group: "Hover" },
    // Only for types that list them in their own fields (the hero glass button)
    { key: "iconBg", label: "Icon background", type: "color", group: "Normal", only: true },
    { key: "iconColor", label: "Icon arrow color", type: "color", group: "Normal", only: true },
    { key: "scale", label: "Size", type: "range", min: 0.7, max: 1.4, step: 0.01, unit: "\u00d7", start: 1, group: "Normal", only: true }
  ];

  var SHADOWS = {
    none: "none",
    soft: "0 2px 6px rgba(0,0,0,.14)",
    medium: "0 6px 18px rgba(0,0,0,.18)",
    lifted: "0 2px 0 rgba(0,0,0,.12), 0 10px 26px rgba(0,0,0,.2)",
    strong: "0 4px 0 rgba(0,0,0,.25), 0 14px 34px rgba(0,0,0,.32)",
    glow: "0 0 18px rgba(200,16,46,.55), 0 0 2px rgba(200,16,46,.6)"
  };

  function has(v) { return v !== undefined && v !== null && v !== ""; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function color(v) { return /^#[0-9a-f]{3,8}$/i.test(String(v || "")) ? v : null; }
  function oneOf(v, list) { for (var i = 0; i < list.length; i++) if (list[i][0] === String(v) && list[i][0] !== "") return list[i][0]; return null; }
  function family(fonts, slug) { for (var i = 0; i < (fonts || []).length; i++) if (fonts[i].slug === slug) return fonts[i]; return null; }
  function q(s) { return '"' + String(s).replace(/["\\]/g, "") + '"'; }
  function field(k) { for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === k) return FIELDS[i]; return null; }
  function clamp(f, v) { var n = num(v); if (n === null) return null; return Math.min(f.max, Math.max(f.min, n)); }
  /* The controls a type has: its own list when it has one, else every general control. Each comes with the type's
     own range limits and starting value (defaults = the type's built-in look). */
  function fieldsFor(T) {
    var list = T && T.fields ? T.fields.map(field).filter(Boolean) : FIELDS.filter(function (f) { return !f.only; });
    return list.map(function (f) {
      var r = (T && T.ranges && T.ranges[f.key]) || {}, d = T && T.defaults ? T.defaults[f.key] : undefined, o = {};
      for (var k in f) o[k] = f[k];
      if (r.min !== undefined) o.min = r.min;
      if (r.max !== undefined) o.max = r.max;
      if (d !== undefined) { o.def = d; if (f.type === "range") o.start = d; }
      return o;
    });
  }
  function typeField(T, k) { var l = fieldsFor(T); for (var i = 0; i < l.length; i++) if (l[i].key === k) return l[i]; return null; }

  /* The hero button's default look, "Flat red": a solid red pill with white bold text and a white round icon with a red
     arrow. No see-through background, blur, gloss or corner highlights. Written into buttons.css (and the editor's
     preview) unless the hero button style is set to Glass; hero-cta.css keeps the glass design and its sizes.
     base = the button's selector; hov = its hover selector list. */
  var FLAT = { bg: "#D6162C", hover: "#BC0E24" };
  function heroFlat(base, hov) {
    var w = "html body .hero-cta-glass:not(#_):not(#__)";
    return w + "{filter:none!important}\n" +
      base + "{background:" + FLAT.bg + "!important;color:#fff!important;border:0!important;box-shadow:none!important;" +
        "-webkit-backdrop-filter:none!important;backdrop-filter:none!important;filter:none!important;font-weight:700;" +
        "transition:transform .2s ease, background-color .2s ease!important}\n" +
      base + "::before, " + base + "::after, " + base + " .hg-ring{display:none!important}\n" +
      base + " .hg-text{color:#fff!important;filter:none!important}\n" +
      base + " .hg-icon{background:#fff!important;box-shadow:none!important}\n" +
      base + " .hg-svg{fill:" + FLAT.bg + "!important;filter:none!important}\n" +
      hov + "{background:" + FLAT.hover + "!important;color:#fff!important}\n" +
      base + ":active{background:" + FLAT.hover + "!important}\n" +
      base + ":focus-visible{outline:3px solid " + FLAT.bg + "!important;outline-offset:3px!important;box-shadow:0 0 0 3px #fff!important}\n";
  }

  /* Strong enough to beat styles.css, design.css (which uses !important) and site-theme.css (:not(#_) !important). */
  function wrap(sel) { return "html body :is(" + sel + "):not(#_):not(#__)"; }

  /* css(data, fonts, opts) → CSS text.
     data = { types: { primary: { bg: "#c8102e", ... }, ... } }
     opts.sel(type) → selector to use instead of the site's (the editor's preview)
     opts.forceHover = a class name; elements with it show their hover look (the editor's "Show hover" switch)
     opts.prefix = how the stylesheet reaches the site root, for font files ("" on the site) */
  function css(data, fonts, opts) {
    data = data || {}; opts = opts || {};
    var types = data.types || {}, prefix = opts.prefix || "", out = "", faces = {}, flatCss = "";
    TYPES.forEach(function (T) {
      var s0 = types[T.key];
      // The hero button is Flat red unless it's set to Glass (also with no settings at all)
      if (T.key === "heroGlass" && !(s0 && s0.style === "glass")) {
        var fb = opts.sel ? opts.sel(T) : wrap(T.sel);
        flatCss = heroFlat(fb, fb + ":hover" + (opts.forceHover ? ", " + fb + "." + opts.forceHover : ""));
      }
      if (!s0 || typeof s0 !== "object") return;
      var base = opts.sel ? opts.sel(T) : wrap(T.sel), a = [], h = [], v, s = {};
      fieldsFor(T).forEach(function (f) { if (has(s0[f.key])) s[f.key] = s0[f.key]; });
      delete s.style;
      // Settings the type's own stylesheet reads as CSS variables (the hero glass button)
      Object.keys(T.vars || {}).forEach(function (k) {
        if (!has(s[k])) return;
        var f = typeField(T, k), val = null;
        if (f.type === "color") val = color(s[k]);
        else if ((v = clamp(f, s[k])) !== null) val = k === "scale" ? String(v) : (k === "radius" && v >= f.max ? "9999px" : v + "px");
        if (val !== null) a.push(T.vars[k] + ":" + val);
        delete s[k];
      });
      var f = has(s.font) ? family(fonts, s.font) : null;
      if (f) { faces[f.slug] = f; a.push("font-family:" + q(f.name) + ", " + (f.fallback || "sans-serif")); }
      if (color(s.bg)) a.push("background:" + s.bg);
      if (color(s.color)) a.push("color:" + s.color);
      if ((v = clamp(field("borderWidth"), s.borderWidth)) !== null) a.push("border-width:" + v + "px");
      if ((v = oneOf(s.borderStyle, field("borderStyle").options))) a.push("border-style:" + v);
      else if (has(s.borderWidth) && num(s.borderWidth) > 0) a.push("border-style:solid");
      if (color(s.borderColor)) a.push("border-color:" + s.borderColor);
      if ((v = clamp(field("radius"), s.radius)) !== null) a.push("border-radius:" + v + "px");
      var px = clamp(field("padX"), s.padX), py = clamp(field("padY"), s.padY);
      if (px !== null) a.push("padding-left:" + px + "px", "padding-right:" + px + "px", "padding-inline:" + px + "px");
      if (py !== null) a.push("padding-top:" + py + "px", "padding-bottom:" + py + "px");
      if ((v = clamp(field("size"), s.size)) !== null) a.push("font-size:" + v + "px");
      if ((v = oneOf(s.weight, W))) a.push("font-weight:" + v);
      if ((v = clamp(field("tracking"), s.tracking)) !== null) a.push("letter-spacing:" + v + "em");
      if ((v = oneOf(s.transform, field("transform").options))) a.push("text-transform:" + v);
      if ((v = oneOf(s.shadow, SH))) a.push("box-shadow:" + SHADOWS[v]);
      var dur = clamp(field("duration"), s.duration);
      if (dur !== null) a.push("transition-property:background-color, background, color, border-color, box-shadow, transform", "transition-duration:" + dur + "ms", "transition-timing-function:ease");

      if (color(s.hoverBg)) h.push("background:" + s.hoverBg);
      if (color(s.hoverColor)) h.push("color:" + s.hoverColor);
      if (color(s.hoverBorderColor)) h.push("border-color:" + s.hoverBorderColor);
      if ((v = oneOf(s.hoverShadow, SH))) h.push("box-shadow:" + SHADOWS[v]);
      var lift = clamp(field("hoverLift"), s.hoverLift), scale = clamp(field("hoverScale"), s.hoverScale), moves = lift !== null || scale !== null;
      if (moves) h.push("transform:" + (lift !== null ? "translateY(" + (-lift) + "px)" : "") + (lift !== null && scale !== null ? " " : "") + (scale !== null ? "scale(" + scale + ")" : ""));

      if (a.length) out += base + "{" + a.join("!important;") + "!important}\n";
      if (h.length) {
        var hs = base + ":is(:hover, :focus-visible)" + (opts.forceHover ? ", " + base + "." + opts.forceHover : "");
        out += hs + "{" + h.join("!important;") + "!important}\n";
        if (moves) out += "@media (prefers-reduced-motion: reduce){" + base + ":is(:hover, :focus-visible){transform:none!important}}\n";
      }
      // Arabic and Farsi letters must stay joined
      if (has(s.tracking)) out += "html:is(:lang(ar), :lang(fa)) " + base.replace(/^html /, "") + "{letter-spacing:0!important}\n";
    });
    var head = "";
    Object.keys(faces).forEach(function (slug) {
      var f = faces[slug];
      f.faces.forEach(function (x) {
        head += "@font-face{font-family:" + q(f.name) + ";font-style:" + x.s + ";font-weight:" + x.w + ";font-display:swap;src:url(" + q(prefix + "fonts/" + f.slug + "/" + x.f) + ') format("woff2")}\n';
      });
    });
    // the flat hero rules come last, so they win over the hero's glass-only color settings
    return head + out + flatCss;
  }

  /* Keep only known types and settings with a value: what Save writes to data/buttons.json. */
  function clean(data) {
    var out = { types: {} };
    TYPES.forEach(function (T) {
      var s = ((data || {}).types || {})[T.key]; if (!s) return;
      var o = {};
      fieldsFor(T).forEach(function (f) { if (has(s[f.key])) o[f.key] = f.type === "range" ? num(s[f.key]) : String(s[f.key]); });
      if (Object.keys(o).length) out.types[T.key] = o;
    });
    return out;
  }

  return { TYPES: TYPES, FIELDS: FIELDS, HERO_STYLES: HERO_STYLES, SHADOWS: SHADOWS, fieldsFor: fieldsFor, css: css, clean: clean };
});
