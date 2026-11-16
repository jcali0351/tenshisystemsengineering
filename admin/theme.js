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
    bodySpacing: 0, bodyLine: 1.75,
    sectionSpace: 168, flowSpace: 1.25, headingSpace: 0.7, cardPad: 44, gridGap: 34, gutter: 56,   // spacing: px, em, em, px, px, px
    headingColor: "#3d4249", headingOpacity: 38, textColor: "#6b7280", mutedColor: "#7d838c", accentColor: "#c8102e",
    motion: true, motionChars: true, motionText: true, motionImages: true, motionCards: true, motionColor: true, colorDuration: 1.8, intro: true, introHold: 5, introFade: 2.6, introStyle: "bloom", heroEffect: true, heroStep: 55, heroDuration: 1.5,
    motionSpeed: 1, motionDistance: 56, motionDistanceMobile: 26, charDelay: 26,
    headingStyles: {}                     // per heading level: { h1: { weight: 700, ... }, ... } (see HS_FIELDS); empty = the settings above
  };

  /* Heading styles: extra settings for each heading level, on top of the font, weight, letter spacing and sizes above.
     Every setting is optional: an empty value keeps the rest of the theme's look. The editor builds its controls from these. */
  var HS_LEVELS = [
    { key: "h1", label: "Main titles (H1)", sel: "h1" },
    { key: "h2", label: "Section headings (H2)", sel: "h2" },
    { key: "h3", label: "Card headings (H3)", sel: "h3" },
    { key: "h4", label: "Small headings (H4\u2013H6)", sel: ":is(h4,h5,h6)" }
  ];
  var HS_FIELDS = [
    { key: "font", label: "Font", type: "font" },
    { key: "weight", label: "Weight", type: "select", options: [["", "Site default"], ["100", "100 Thin"], ["200", "200 Extra light"], ["300", "300 Light"], ["400", "400 Regular"], ["500", "500 Medium"], ["600", "600 Semibold"], ["700", "700 Bold"], ["800", "800 Extra bold"], ["900", "900 Black"]] },
    { key: "fontStyle", label: "Style", type: "select", options: [["", "Site default"], ["normal", "Upright"], ["italic", "Italic"]] },
    { key: "lineHeight", label: "Line height", type: "range", min: 0.8, max: 2, step: 0.02, unit: "", start: 1.1 },
    { key: "wordSpacing", label: "Word spacing", type: "range", min: -0.2, max: 1, step: 0.01, unit: "em", start: 0 },
    { key: "transform", label: "Letter case", type: "select", options: [["", "Site default"], ["none", "As written"], ["uppercase", "ALL CAPITALS"], ["lowercase", "all lowercase"], ["capitalize", "Capitalize Each Word"]] },
    { key: "smallCaps", label: "Small capitals", type: "check" },
    { key: "align", label: "Alignment", type: "select", options: [["", "Site default"], ["left", "Left"], ["center", "Center"], ["right", "Right"]] },
    { key: "color", label: "Text color", type: "color", start: "#3d4249" },
    { key: "stroke", label: "Outline width", type: "range", min: 0, max: 3, step: 0.25, unit: "px", start: 0 },
    { key: "strokeColor", label: "Outline color", type: "color", start: "#c8102e" },
    { key: "shadow", label: "Shadow", type: "select", options: [["", "Site default"], ["none", "None"], ["soft", "Soft"], ["lifted", "Lifted"], ["strong", "Strong"], ["glow", "Red glow"]] },
    { key: "decoration", label: "Underline", type: "select", options: [["", "Site default"], ["none", "None"], ["underline", "Underline"], ["overline", "Line above"], ["line-through", "Line through"]] }
  ];
  var HS_SHADOWS = {
    none: "none",
    soft: "0 1px 2px rgba(0,0,0,.12)",
    lifted: "0 2px 0 rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.14)",
    strong: "0 3px 0 rgba(0,0,0,.25), 0 12px 32px rgba(0,0,0,.3)",
    glow: "0 0 18px rgba(200,16,46,.55), 0 0 2px rgba(200,16,46,.6)"
  };
  /* Keep only valid, set values; drop empty levels */
  function cleanHS(hs) {
    var out = {};
    if (!hs || typeof hs !== "object") return out;
    HS_LEVELS.forEach(function (L) {
      var src = hs[L.key], o = {};
      if (!src || typeof src !== "object") return;
      HS_FIELDS.forEach(function (f) {
        var v = src[f.key];
        if (v === undefined || v === null || v === "") return;
        if (f.type === "range") { v = parseFloat(v); if (isFinite(v)) o[f.key] = Math.max(f.min, Math.min(f.max, v)); }
        else if (f.type === "check") { if (v === true || v === "true") o[f.key] = true; }
        else if (f.type === "color") { if (/^#[0-9a-f]{6}$/i.test(v)) o[f.key] = String(v).toLowerCase(); }
        else if (f.type === "select") { if (f.options.some(function (x) { return x[0] === String(v) && x[0] !== ""; })) o[f.key] = String(v); }
        else if (f.type === "font") { if (/^[a-z0-9-]+$/.test(v)) o[f.key] = v; }
      });
      if (Object.keys(o).length) out[L.key] = o;
    });
    return out;
  }

  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function clean(s) {
    var o = {}, k;
    s = s || {};
    // Themes saved before the unit choice existed were in em
    if (s.headingSpacingUnit === undefined && s.h1Spacing !== undefined) s = Object.assign({}, s, { headingSpacingUnit: "em" });
    for (k in DEFAULTS) o[k] = s[k] === undefined || s[k] === null || s[k] === "" ? DEFAULTS[k] : s[k];
    ["headingWeight", "bodyWeight", "rootSize", "heroSize", "pageTitleSize", "sectionSize", "featureSize", "cardSize", "h1Spacing", "h2Spacing", "h3Spacing",
      "h4Spacing", "headingLine", "headingOpacity", "bodySpacing", "sectionSpace", "flowSpace", "headingSpace", "cardPad", "gridGap", "gutter", "bodyLine", "motionSpeed", "motionDistance", "motionDistanceMobile", "charDelay", "colorDuration", "introHold", "introFade", "heroStep", "heroDuration"].forEach(function (k) { o[k] = num(o[k], DEFAULTS[k]); });
    ["motion", "motionChars", "motionText", "motionImages", "motionCards", "motionColor", "intro", "heroEffect"].forEach(function (k) { o[k] = o[k] === true || o[k] === "true" || o[k] === 1; });
    ["headingColor", "textColor", "mutedColor", "accentColor"].forEach(function (k) { if (!/^#[0-9a-f]{6}$/i.test(o[k])) o[k] = DEFAULTS[k]; });
    if (["none", "uppercase", "capitalize"].indexOf(o.headingCase) < 0) o.headingCase = "none";
    o.headingOpacity = Math.max(5, Math.min(100, Math.round(o.headingOpacity)));
    if (o.headingSpacingUnit !== "em") o.headingSpacingUnit = "px";
    if (o.introStyle !== "even") o.introStyle = "bloom";
    o.headingStyles = cleanHS(o.headingStyles);
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
    var lvFonts = HS_LEVELS.map(function (L) { var x = s.headingStyles[L.key]; return x && x.font ? family(fonts, x.font) : null; });
    [hf, bf].concat(lvFonts).filter(function (f, i, a) { return f && a.indexOf(f) === i; }).forEach(function (f) {
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
    // Opening: black and white for introHold seconds, then color (design.css draws it)
    out += ":root{--intro-hold:" + s.introHold + "s;--intro-fade:" + s.introFade + "s;--anim-hero:" + (s.heroEffect ? 1 : 0) + ";--hero-step:" + s.heroStep + "ms;--hero-dur:" + s.heroDuration + "s}\n";
    if (!s.intro) out += "body::after{display:none!important}body>:is(.site-header,main,.site-footer){animation:none!important}\n";
    else if (s.introStyle === "even") out += "body::after{-webkit-mask-image:none!important;mask-image:none!important;animation-name:tse-intro-even!important}\n";
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
    out += headingStylesCss(s.headingStyles, fonts);
    // ---------- Spacing: calm, even negative space in the content areas (header and footer untouched) ----------
    var C = "main";
    out += ":root{--gutter:clamp(20px, 5.2vw, " + s.gutter + "px)}\n";
    out += C + " :is(.page-section,.feature,.services,.contact,.svc-body,.svc-offer-section,.svc-process,.svc-benefits,.svc-tech-section,.svc-cta,.svc-detail-section,.prj-section,.prj-editions,.prj-gallery,.prj-fair)" + H +
      "{padding-top:" + fluid(s.sectionSpace) + "!important;padding-bottom:" + fluid(s.sectionSpace) + "!important}\n";
    out += C + " .svc-hero" + H + "{padding-top:" + fluid(s.sectionSpace * 0.8) + "!important;padding-bottom:" + fluid(s.sectionSpace * 0.62) + "!important}\n";
    out += C + " :is(p,ul,ol,dl,blockquote,table,figure,.btn,.feature-list,.news-tabs) + :is(p,ul,ol,dl,blockquote,table,figure,.feature-list)" + H + "{margin-top:" + s.flowSpace + "em}\n";
    out += C + " :is(p,ul,ol,blockquote,figure,img,.feature-list,.news-head-text,.section-intro) + .btn" + H + "{margin-top:" + (s.flowSpace * 1.4).toFixed(2) + "em}\n";
    out += C + " :is(li + li)" + H + "{margin-top:" + (s.flowSpace * 0.42).toFixed(2) + "em}\n";
    out += C + " :is(h1,h2,h3,h4)" + H + "{margin-bottom:" + s.headingSpace + "em}\n";
    out += C + " :is(p,ul,ol,figure,.btn,blockquote) + :is(h2,h3,h4)" + H + "{margin-top:" + (s.flowSpace * 1.5).toFixed(2) + "em}\n";
    out += C + " :is(.eyebrow)" + H + "{margin-bottom:" + (s.headingSpace * 0.9).toFixed(2) + "em}\n";
    out += C + " :is(.section-title,.feature h2,.contact-intro h2)" + H + "{margin-bottom:" + (s.headingSpace * 0.8).toFixed(2) + "em!important}\n";
    out += C + " :is(.section-title + p,.section-intro,.news-head-text,.blog-note)" + H + "{margin-bottom:" + fluid(s.gridGap * 1.4) + "}\n";
    out += C + " :is(.service-card,.offer-card,.benefit-card,.svc-tech,.tech-card,.value-card,.ab-step,.ab-std-card,.ab-focus,.ab-mv-card,.svc-detail,.prj-card,.prj-ed,.svc-step,.contact-pitch,.svc-for,.team-card,.portal-card,.contact-form,.pat-card,.name-card)" + H +
      "{padding:" + fluid(s.cardPad) + "!important}\n";
    out += C + " :is(.news-body,.blog-body)" + H + "{padding:" + fluid(s.cardPad * 0.75) + " " + fluid(s.cardPad * 0.8) + "!important}\n";
    out += C + " .blog-card.is-feature .blog-body" + H + "{padding:" + fluid(s.cardPad * 1.25) + "!important}\n";
    out += C + " :is(.services-grid,.offer-grid,.benefit-grid,.blog-grid,.news-list,.portal-grid,.prj-grid,.prj-ed-grid,.svc-grid,.svc-tech-grid,.team-grid,.tech-grid,.value-grid,.pat-grid,.ab-find-grid,.ab-focus-grid,.ab-mv-grid,.ab-std-grid,.svc-steps,.svc-other-list,.svc-detail-list)" + H +
      "{gap:" + fluid(s.gridGap) + "!important}\n";
    out += C + " :is(.feature-inner,.svc-body-inner,.contact-inner,.contact-layout)" + H + "{gap:" + fluid(s.gridGap * 2) + "!important;column-gap:" + fluid(s.gridGap * 2.2) + "!important}\n";
    out += C + " :is(.news-tabs)" + H + "{margin-bottom:" + fluid(s.gridGap * 1.2) + "!important}\n";
    out += ".hero-card h1" + H + "{font-size:" + fluid(s.heroSize) + "!important}\n";
    out += ".svc-hero h1" + H + "{font-size:" + fluid(s.pageTitleSize) + "!important}\n";
    out += ":is(.section-title,.contact-intro h2,.prj-group-title)" + H + "{font-size:" + fluid(s.sectionSize) + "!important}\n";
    out += ".feature h2" + H + "{font-size:" + fluid(s.featureSize) + "!important}\n";
    out += ":is(.service-card,.offer-card,.benefit-card,.news-item,.blog-card,.value-card,.team-card,.prj-card,.svc-step,.ab-step) h3" + H + "{font-size:" + fluid(s.cardSize) + "!important}\n";
    // Japanese, Chinese, Korean and right-to-left scripts look wrong squeezed: no extra spacing there
    out += ":is(html:lang(ja),html:lang(zh),html:lang(ko),html[dir=rtl]) :is(h1,h2,h3,h4,h5,h6)" + H + "{letter-spacing:0!important}\n";
    return out;
  }

  /* The Heading styles rules. Two :not(#…) raise them above the theme rules before them; the text color skips the few dark
     panels whose headings stay white. */
  function headingStylesCss(hs, fonts) {
    var out = "";
    HS_LEVELS.forEach(function (L) {
      var o = hs[L.key]; if (!o) return;
      var sel = L.sel + ":not(#_):not(#__)", t = [];
      var f = o.font ? family(fonts, o.font) : null;
      if (f) t.push("font-family:" + stack(f));
      if (o.weight) t.push("font-weight:" + o.weight);
      if (o.fontStyle) t.push("font-style:" + o.fontStyle);
      if (o.lineHeight !== undefined) t.push("line-height:" + o.lineHeight);
      if (o.wordSpacing !== undefined) t.push("word-spacing:" + o.wordSpacing + "em");
      if (o.transform) t.push("text-transform:" + o.transform);
      if (o.smallCaps) t.push("font-variant-caps:small-caps");
      if (o.align) t.push("text-align:" + o.align);
      if (o.stroke) t.push("-webkit-text-stroke:" + o.stroke + "px " + (o.strokeColor || "currentColor"));
      if (o.shadow) t.push("text-shadow:" + HS_SHADOWS[o.shadow]);
      if (o.decoration) t.push("text-decoration-line:" + o.decoration, "text-decoration-thickness:.06em", "text-underline-offset:.18em");
      if (t.length) out += sel + "{" + t.join("!important;") + "!important}\n";
      if (o.color) out += sel + ":not(:is(.portal-card--admin,.blog-card.is-feature,.svc-cta.is-dark) *){color:" + o.color + "!important;-webkit-text-fill-color:" + o.color + "!important}\n";
      // Arabic and Farsi letters must stay joined
      if (o.wordSpacing !== undefined) out += "html:is(:lang(ar),:lang(fa)) " + sel + "{word-spacing:normal!important}\n";
    });
    return out ? "/* Heading styles (Design › Heading styles) */\n" + out : "";
  }

  return { DEFAULTS: DEFAULTS, clean: clean, parse: parse, css: css, nearest: nearest, HS_LEVELS: HS_LEVELS, HS_FIELDS: HS_FIELDS };
});
