/* Tenshi Editor › Design: turns the design settings into site-theme.css, the stylesheet every page loads last.
   The settings are kept as JSON in the first line of site-theme.css, so the editor can read them back.
   Works in the browser (window.TenshiTheme) and in Node (require), so build tools can use it too.
   Fonts come from fonts/<slug>/ (catalog: fonts/fonts.json). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TenshiTheme = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = {
    headingFont: "roboto", bodyFont: "lato", headingWeight: 900, bodyWeight: 400,
    rootSize: 18.4,                       // px: the base every rem size is measured from (whole-site text size)
    heroSize: 92, pageTitleSize: 74, sectionSize: 54, featureSize: 58, cardSize: 20,   // px at full width; phones scale down
    h1Spacing: -1, h2Spacing: -1, h3Spacing: -1, h4Spacing: -1, headingSpacingUnit: "px", // negative is tighter
    headingLine: 1.04, headingCase: "none",
    bodySpacing: 0, bodyLine: 1.65,
    headingColor: "#3d4249", headingOpacity: 38, textColor: "#6b7280", mutedColor: "#7d838c", accentColor: "#c8102e",
    motion: true, motionChars: true, motionText: true, motionImages: true, motionCards: true, motionColor: true, colorDuration: 1.8,
    motionSpeed: 1, motionDistance: 56, motionDistanceMobile: 26, charDelay: 26
  };

  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function clean(s) {
    var o = {}, k;
    s = s || {};
    // Themes saved before the unit choice existed were in em
    if (s.headingSpacingUnit === undefined && s.h1Spacing !== undefined) s = Object.assign({}, s, { headingSpacingUnit: "em" });
    for (k in DEFAULTS) o[k] = s[k] === undefined || s[k] === null || s[k] === "" ? DEFAULTS[k] : s[k];
    ["headingWeight", "bodyWeight", "rootSize", "heroSize", "pageTitleSize", "sectionSize", "featureSize", "cardSize", "h1Spacing", "h2Spacing", "h3Spacing",
      "h4Spacing", "headingLine", "headingOpacity", "bodySpacing", "bodyLine", "motionSpeed", "motionDistance", "motionDistanceMobile", "charDelay", "colorDuration"].forEach(function (k) { o[k] = num(o[k], DEFAULTS[k]); });
    ["motion", "motionChars", "motionText", "motionImages", "motionCards", "motionColor"].forEach(function (k) { o[k] = o[k] === true || o[k] === "true" || o[k] === 1; });
    ["headingColor", "textColor", "mutedColor", "accentColor"].forEach(function (k) { if (!/^#[0-9a-f]{6}$/i.test(o[k])) o[k] = DEFAULTS[k]; });
    if (["none", "uppercase", "capitalize"].indexOf(o.headingCase) < 0) o.headingCase = "none";
    o.headingOpacity = Math.max(5, Math.min(100, Math.round(o.headingOpacity)));
    if (o.headingSpacingUnit !== "em") o.headingSpacingUnit = "px";
    return o;
  }

  /* Read the settings back from an existing site-theme.css (first line: / * tse-theme {...} * /). */
  function parse(css) {
    var m = /\/\* tse-theme (\{.*?\}) \*\//.exec(css || "");
    try { return clean(m ? JSON.parse(m[1]) : {}); } catch (e) { return clean({}); }
  }

  function family(fonts, slug) { for (var i = 0; i < fonts.length; i++) if (fonts[i].slug === slug) return fonts[i]; return null; }
  function stack(f) { return '"' + f.name + '", ' + (f.fallback || "sans-serif"); }
  /* The closest weight this font actually has */
  function nearest(f, w) {
    var ws = (f.faces || []).filter(function (x) { return x.s === "normal"; }).map(function (x) { return x.w; });
    if (!ws.length) return w;
    return ws.reduce(function (a, b) { return Math.abs(b - w) < Math.abs(a - w) ? b : a; });
  }
  function px(n) { return Math.round(n * 100) / 100 + "px"; }
  /* A size that is `max` on wide screens and shrinks smoothly on phones (never below 58% of it, or 16px for small sizes) */
  function fluid(max) {
    var min = Math.max(max <= 24 ? max * 0.9 : max * 0.58, 16);
    return "clamp(" + px(min) + ", " + (Math.round(max / 13.2 * 100) / 100) + "vw, " + px(max) + ")";
  }

  /* Build site-theme.css. `fonts` is the list from fonts/fonts.json; `prefix` is how pages reach the site root ("" here). */
  function css(settings, fonts) {
    var s = clean(settings);
    var hf = family(fonts, s.headingFont) || family(fonts, DEFAULTS.headingFont);
    var bf = family(fonts, s.bodyFont) || family(fonts, DEFAULTS.bodyFont);
    var out = "/* tse-theme " + JSON.stringify(s) + " */\n" +
      "/* Site theme, set in the Tenshi Editor (admin.html › Design), which rewrites this file. Loaded after every other stylesheet.\n" +
      "   Fonts live in fonts/<name>/ (see fonts/fonts.json); free to use: SIL Open Font License, Apache 2.0 or the Ubuntu Font Licence (each folder has its LICENSE). */\n";
    [hf, bf].filter(function (f, i, a) { return f && a.indexOf(f) === i; }).forEach(function (f) {
      (f.faces || []).forEach(function (x) {
        out += '@font-face{font-family:"' + f.name + '";font-style:' + x.s + ";font-weight:" + x.w + ';font-display:swap;src:url("fonts/' + f.slug + "/" + x.f + '") format("woff2")}\n';
      });
    });
    var hw = nearest(hf, s.headingWeight), bw = nearest(bf, s.bodyWeight);
    var H = ":not(#_)";   // a raised specificity, so these settings win over the layered stylesheets before them
    out += ":root{--font:" + stack(bf) + ";--font-ja:" + stack(bf) + ', "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;--font-heading:' + stack(hf) +
      ";--ink:" + s.headingColor + ";--heading:" + s.headingColor + (s.headingOpacity < 100 ? ("0" + Math.round(s.headingOpacity * 2.55).toString(16)).slice(-2) : "") + ";--text:" + s.textColor + ";--muted:" + s.mutedColor +
      ";--red:" + s.accentColor + ";--shu:" + s.accentColor + ";--red-deep:color-mix(in srgb," + s.accentColor + " 82%,#000);--red-dark:color-mix(in srgb," + s.accentColor + " 65%,#000)" +
      ";--a-dur:" + (0.9 * s.motionSpeed).toFixed(2) + "s;--a-dur-img:" + (1.2 * s.motionSpeed).toFixed(2) + "s;--ch-dur:" + (0.7 * s.motionSpeed).toFixed(2) + "s" +
      ";--dx:" + s.motionDistance + "px;--dy:" + Math.round(s.motionDistance * 0.55) + "px;--cs-base:" + s.charDelay + "ms" +
      ";--anim:" + (s.motion ? 1 : 0) + ";--anim-chars:" + (s.motionChars ? 1 : 0) + ";--anim-text:" + (s.motionText ? 1 : 0) +
      ";--anim-images:" + (s.motionImages ? 1 : 0) + ";--anim-cards:" + (s.motionCards ? 1 : 0) +
      ";--anim-color:" + (s.motionColor ? 1 : 0) + ";--gs-dur:" + s.colorDuration + "s}\n";
    out += "@media (max-width:760px){:root{--dx:" + s.motionDistanceMobile + "px;--dy:" + Math.round(s.motionDistanceMobile * 0.75) + "px}}\n";
    out += "html{font-size:" + px(s.rootSize) + "}\n";
    out += "body" + H + "{font-family:var(--font);font-weight:" + bw + ";letter-spacing:" + s.bodySpacing + "em;line-height:" + s.bodyLine + ";color:var(--text)}\n";
    out += ":is(p,li,dd,blockquote,td)" + H + "{letter-spacing:" + s.bodySpacing + "em}\n";
    // Lead and intro paragraphs and form labels are body text too, so they take the body color
    out += ":is(.hero-lead,.feature-lead,.page-lead,.pitch-lead,.svc-intro,.svc-for p,.svc-other span,.contact-form label,.field label)" + H + "{color:var(--text)!important}\n";
    out += ":is(h1,h2,h3,h4,h5,h6)" + H + "{font-family:var(--font-heading)!important;font-weight:" + hw + "!important;text-transform:" + s.headingCase + "}\n";
    // Heading color (with its opacity) everywhere except on the few dark panels, whose headings stay white
    out += ":is(h1,h2,h3,h4,h5,h6)" + H + ":not(:is(.portal-card--admin,.blog-card.is-feature,.svc-cta.is-dark) *){color:var(--heading)!important}\n";
    out += ":is(h1,h2)" + H + "{line-height:" + s.headingLine + "!important}\n";
    out += "h1" + H + "{letter-spacing:" + s.h1Spacing + s.headingSpacingUnit + "!important}\n";
    out += "h2" + H + "{letter-spacing:" + s.h2Spacing + s.headingSpacingUnit + "!important}\n";
    out += "h3" + H + "{letter-spacing:" + s.h3Spacing + s.headingSpacingUnit + "!important}\n";
    out += ":is(h4,h5,h6)" + H + "{letter-spacing:" + s.h4Spacing + s.headingSpacingUnit + "!important}\n";
    out += ".hero-card h1" + H + "{font-size:" + fluid(s.heroSize) + "!important}\n";
    out += ".svc-hero h1" + H + "{font-size:" + fluid(s.pageTitleSize) + "!important}\n";
    out += ":is(.section-title,.contact-intro h2,.prj-group-title)" + H + "{font-size:" + fluid(s.sectionSize) + "!important}\n";
    out += ".feature h2" + H + "{font-size:" + fluid(s.featureSize) + "!important}\n";
    out += ":is(.service-card,.offer-card,.benefit-card,.news-item,.blog-card,.value-card,.team-card,.prj-card,.svc-step,.ab-step) h3" + H + "{font-size:" + fluid(s.cardSize) + "!important}\n";
    // Japanese, Chinese, Korean and right-to-left scripts look wrong squeezed: no extra spacing there
    out += ":is(html:lang(ja),html:lang(zh),html:lang(ko),html[dir=rtl]) :is(h1,h2,h3,h4,h5,h6)" + H + "{letter-spacing:0!important}\n";
    return out;
  }

  return { DEFAULTS: DEFAULTS, clean: clean, parse: parse, css: css, nearest: nearest };
});
