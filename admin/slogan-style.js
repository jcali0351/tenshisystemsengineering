/* Tenshi Editor › Slogan › Look: turns the slogan's style settings (data/slogan.json "style") into CSS.
   Used by the editor for its live preview and by tools/build-pages.mjs to write slogan.css for the homepage.
   Every setting is optional: an empty value keeps the site's normal look for that property.
   Works in the browser (window.TenshiSloganStyle) and in Node (require). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TenshiSloganStyle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* The controls, in the order the editor shows them. type: font | select | range | color | check */
  var FIELDS = [
    { key: "font", label: "Font", type: "font" },
    { key: "weight", label: "Weight", type: "select", options: [["", "Site default"], ["100", "100 Thin"], ["200", "200 Extra light"], ["300", "300 Light"], ["400", "400 Regular"], ["500", "500 Medium"], ["600", "600 Semibold"], ["700", "700 Bold"], ["800", "800 Extra bold"], ["900", "900 Black"]] },
    { key: "fontStyle", label: "Style", type: "select", options: [["", "Site default"], ["normal", "Upright"], ["italic", "Italic"]] },
    { key: "sizeMax", label: "Size on large screens", type: "range", min: 12, max: 120, step: 1, unit: "px" },
    { key: "sizeMin", label: "Size on phones", type: "range", min: 10, max: 72, step: 1, unit: "px" },
    { key: "tracking", label: "Letter spacing", type: "range", min: -0.1, max: 0.5, step: 0.005, unit: "em" },
    { key: "wordSpacing", label: "Word spacing", type: "range", min: -0.2, max: 1, step: 0.01, unit: "em" },
    { key: "lineHeight", label: "Line height", type: "range", min: 0.8, max: 2, step: 0.02, unit: "" },
    { key: "transform", label: "Letter case", type: "select", options: [["", "Site default"], ["none", "As written"], ["uppercase", "ALL CAPITALS"], ["lowercase", "all lowercase"], ["capitalize", "Capitalize Each Word"]] },
    { key: "smallCaps", label: "Small capitals", type: "check" },
    { key: "align", label: "Alignment", type: "select", options: [["", "Site default"], ["left", "Left"], ["center", "Center"], ["right", "Right"]] },
    { key: "color", label: "Text color", type: "color" },
    { key: "stroke", label: "Outline width", type: "range", min: 0, max: 3, step: 0.25, unit: "px" },
    { key: "strokeColor", label: "Outline color", type: "color" },
    { key: "shadow", label: "Shadow", type: "select", options: [["", "Site default"], ["none", "None"], ["soft", "Soft"], ["lifted", "Lifted"], ["strong", "Strong"], ["glow", "Red glow"]] },
    { key: "decoration", label: "Underline", type: "select", options: [["", "Site default"], ["none", "None"], ["underline", "Underline"], ["overline", "Line above"], ["line-through", "Line through"]] },
    { key: "background", label: "Strip background", type: "color" },
    { key: "space", label: "Space above and below", type: "range", min: 0, max: 240, step: 4, unit: "px" }
  ];

  var SHADOWS = {
    none: "none",
    soft: "0 1px 2px rgba(0,0,0,.12)",
    lifted: "0 2px 0 rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.14)",
    strong: "0 3px 0 rgba(0,0,0,.25), 0 12px 32px rgba(0,0,0,.3)",
    glow: "0 0 18px rgba(200,16,46,.55), 0 0 2px rgba(200,16,46,.6)"
  };

  function has(v) { return v !== undefined && v !== null && v !== ""; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function color(v) { return /^#[0-9a-f]{3,8}$/i.test(String(v || "")) ? v : null; }
  function family(fonts, slug) { for (var i = 0; i < (fonts || []).length; i++) if (fonts[i].slug === slug) return fonts[i]; return null; }
  function q(s) { return '"' + String(s).replace(/["\\]/g, "") + '"'; }

  /* css(style, fonts, opts) → CSS text.
     opts.box  = the strip (default: the homepage band, strong enough to beat the Design tab's rules)
     opts.text = the slogan's words inside it
     opts.prefix = how the stylesheet reaches the site root, for font files ("" on the site, the site URL in the editor) */
  function css(style, fonts, opts) {
    style = style || {}; opts = opts || {};
    var box = opts.box || "main section.band:not(#_):not(#__)";
    var text = opts.text || ":is(.band-stage, .band-unit, .band-list li, .band-text)";
    var prefix = opts.prefix || "";
    var T = box + " " + text, out = "", t = [], b = [];

    var f = has(style.font) ? family(fonts, style.font) : null;
    if (f) {
      f.faces.forEach(function (x) {
        out += "@font-face{font-family:" + q(f.name) + ";font-style:" + x.s + ";font-weight:" + x.w + ";font-display:swap;src:url(" + q(prefix + "fonts/" + f.slug + "/" + x.f) + ') format("woff2")}\n';
      });
      t.push("font-family:" + q(f.name) + ", " + (f.fallback || "sans-serif"));
    }
    if (has(style.weight)) t.push("font-weight:" + (num(style.weight) || 400));
    if (has(style.fontStyle)) t.push("font-style:" + (style.fontStyle === "italic" ? "italic" : "normal"));
    var mx = num(style.sizeMax), mn = num(style.sizeMin);
    if (mx || mn) {
      mx = mx || mn; mn = Math.min(mn || Math.max(14, Math.round(mx * 0.55)), mx);   // no phone size set: phones get about 55%
      t.push("font-size:" + (mn === mx ? mx + "px" : "clamp(" + mn + "px, calc(" + mn + "px + " + (mx - mn) + " * (100vw - 375px) / 1065), " + mx + "px)"));
    }
    if (has(style.tracking)) t.push("letter-spacing:" + num(style.tracking) + "em");
    if (has(style.wordSpacing)) t.push("word-spacing:" + num(style.wordSpacing) + "em");
    if (has(style.lineHeight)) t.push("line-height:" + num(style.lineHeight));
    if (has(style.transform)) t.push("text-transform:" + style.transform);
    if (style.smallCaps === true) t.push("font-variant-caps:small-caps");
    if (color(style.color)) t.push("color:" + style.color, "-webkit-text-fill-color:" + style.color);
    var sw = num(style.stroke);
    if (sw) t.push("-webkit-text-stroke:" + sw + "px " + (color(style.strokeColor) || "currentColor"));
    if (has(style.shadow) && SHADOWS[style.shadow]) t.push("text-shadow:" + SHADOWS[style.shadow]);
    if (has(style.decoration)) t.push("text-decoration-line:" + style.decoration, "text-decoration-thickness:.06em", "text-underline-offset:.18em");
    if (t.length) out += T + "{" + t.join("!important;") + "!important}\n";

    if (has(style.align)) {
      var j = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
      out += box + " :is(.band-stage, .band-list, .band-text){text-align:" + style.align + "!important;justify-content:" + j + "!important;margin-inline:" + (style.align === "center" ? "auto" : "0") + "!important}\n";
    }
    if (color(style.background)) b.push("background:" + style.background);
    if (has(style.space)) b.push("padding-block:" + (num(style.space) || 0) + "px");
    if (b.length) out += box + "{" + b.join("!important;") + "!important}\n";

    // Arabic and Farsi letters must stay joined; Japanese, Korean and Chinese have no letter case
    if (has(style.tracking) || has(style.wordSpacing)) out += "html:is(:lang(ar), :lang(fa)) " + T + "{letter-spacing:0!important;word-spacing:normal!important}\n";
    return out;
  }

  return { FIELDS: FIELDS, css: css };
});
