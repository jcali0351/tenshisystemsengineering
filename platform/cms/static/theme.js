/* =====================================================================================================================
   theme.js: the theme editor, used on Settings & theme and in the page builder's "Theme" panel.

     TenshiTheme.mount(element, data, { onPreview: function (res) {…}, compact: true })  →  { value: function () {…} }

   data comes from app.theme_editor_data(): the site's saved theme, the template's defaults, fonts, presets, the brand
   lock and whether this person may change the brand. Every change asks the CMS for the tokens CSS and the WCAG
   contrast check (POST /api/sites/<id>/theme/preview); onPreview gets { css, style, checks } so the builder can show
   it live in the preview without saving. Saving is the page's job (it posts value() as "theme").
   ===================================================================================================================== */
(function () {
  "use strict";
  var T = window.Tenshi, esc = T.esc;
  var COLOR_LABELS = [["primary", "Main colour (buttons, header)"], ["accent", "Accent (highlights, focus ring)"], ["surface", "Page background"], ["ink", "Text"]];
  var SPACE_LABELS = { compact: "Compact", normal: "Normal", airy: "Airy" };
  var STYLE_LABELS = { clean: "Clean: light and rounded", bold: "Bold: square and strong", elegant: "Elegant: serif and calm" };

  function mount(el, data, opts) {
    opts = opts || {};
    var state = JSON.parse(JSON.stringify(data.theme || {}));
    state.colors = state.colors || {}; state.fonts = state.fonts || {}; state.dark_colors = state.dark_colors || {};
    state.mode = state.mode || "light";
    var lastDark = {};
    var dis = data.can_edit ? "" : " disabled";
    function colour(k) { return state.colors[k] || data.defaults.colors[k] || "#000000"; }
    function fontOptions(which) {
      return '<option value="">Template\'s choice</option>' + Object.keys(data.fonts).map(function (k) {
        return '<option value="' + k + '"' + (state.fonts[which] === k ? " selected" : "") + ' style="font-family:' + esc(data.fonts[k][1]) + '">' + esc(data.fonts[k][0]) + "</option>";
      }).join("");
    }
    function presetHtml(id) {
      var p = data.presets[id];
      return '<button type="button" class="preset' + (state.preset === id ? " on" : "") + '" data-preset="' + id + '"' + dis + ' title="' + esc(p.about) + '">' +
        '<span class="preset-sw">' + ["primary", "accent", "surface", "ink"].map(function (k) { return '<i style="background:' + p.colors[k] + '"></i>'; }).join("") + "</span>" +
        '<b style="font-family:' + esc(data.fonts[p.fonts.heading][1]) + '">' + esc(p.name) + "</b></button>";
    }
    el.innerHTML =
      (data.locked ? '<p class="note' + (data.can_edit ? "" : " note-warn") + '" id="brand-note">' + (data.can_edit ?
        "The brand is locked for editors. As an owner or admin you can still change it." :
        "The brand is locked: only this site's owners and CMS admins can change colours, fonts and shapes.") + "</p>" : "") +
      '<h3 class="th-h">Start from a preset</h3><div class="presets">' + Object.keys(data.presets).map(presetHtml).join("") + "</div>" +
      '<h3 class="th-h">Colours <button class="btn btn-small" type="button" data-reset' + dis + '>Use the template\'s</button></h3>' +
      '<div class="grid grid-2 th-colors">' + COLOR_LABELS.map(function (c) {
        return '<label class="field"><span>' + c[1] + '</span><span class="row"><input type="color" data-color="' + c[0] + '" value="' + colour(c[0]) + '"' + dis + "><code>" + colour(c[0]) + "</code></span></label>";
      }).join("") + "</div>" +
      '<h3 class="th-h">Dark mode</h3><div class="grid grid-2">' +
      '<label class="field"><span>Colour mode</span><select data-mode' + dis + '>' +
      [["light", "Light only"], ["auto", "Auto: follows the visitor's device"], ["dark", "Dark only"]].map(function (m) {
        return '<option value="' + m[0] + '"' + (state.mode === m[0] ? " selected" : "") + ">" + m[1] + "</option>"; }).join("") + "</select></label>" +
      '<label class="check field" style="align-self:end"><input type="checkbox" data-toggle' + (state.toggle ? " checked" : "") + dis + "> Show a light/dark switch on the site</label></div>" +
      '<div data-dark-box><p class="small muted">Dark colours are worked out from yours so they pass AA. Change any of them here.</p>' +
      '<div class="grid grid-2 th-colors">' + COLOR_LABELS.map(function (c) {
        return '<label class="field"><span>Dark: ' + c[1].replace(/ \(.*\)/, "") + '</span><span class="row"><input type="color" data-dark="' + c[0] + '" value="#000000"' + dis +
          '><code></code><button type="button" class="btn btn-small" data-dark-auto="' + c[0] + '"' + dis + '>Auto</button></span></label>';
      }).join("") + "</div>" +
      '<p class="row small"><span>Preview in:</span><button type="button" class="btn btn-small" data-scheme="light">Light</button><button type="button" class="btn btn-small" data-scheme="dark">Dark</button></p></div>' +
      '<div id="th-contrast" class="th-contrast" aria-live="polite"></div>' +
      '<h3 class="th-h">Fonts and shape</h3><div class="grid grid-2">' +
      '<label class="field"><span>Headings</span><select data-font="heading"' + dis + ">" + fontOptions("heading") + "</select></label>" +
      '<label class="field"><span>Body text</span><select data-font="body"' + dis + ">" + fontOptions("body") + "</select></label>" +
      '<label class="field"><span>Shape</span><select data-style' + dis + '><option value="">Template\'s choice (' + esc(data.defaults.style) + ")</option>" +
      Object.keys(STYLE_LABELS).map(function (k) { return '<option value="' + k + '"' + (state.style === k ? " selected" : "") + ">" + STYLE_LABELS[k] + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Spacing between sections</span><select data-space' + dis + '><option value="">Template\'s choice</option>' +
      data.spacing.map(function (k) { return '<option value="' + k + '"' + (state.space === k ? " selected" : "") + ">" + SPACE_LABELS[k] + "</option>"; }).join("") + "</select></label></div>" +
      '<label class="field"><span>Corners <output data-radius-out></output></span><span class="row" style="flex-wrap:nowrap">' +
      '<input type="range" min="0" max="' + data.radius_max + '" step="1" data-radius value="' + (state.radius == null ? 12 : state.radius) + '"' + dis + ' style="flex:1">' +
      '<label class="check" style="white-space:nowrap"><input type="checkbox" data-radius-auto' + (state.radius == null ? " checked" : "") + dis + "> Template's</label></span></label>" +
      (data.can_manage ? '<label class="check field"><input type="checkbox" data-lock' + (data.locked ? " checked" : "") + '> Brand lock: editors can\'t change colours, fonts or shapes</label>' : "");

    var q = function (s) { return el.querySelector(s); }, qa = function (s) { return Array.prototype.slice.call(el.querySelectorAll(s)); };
    function drawRadius() {
      var auto = q("[data-radius-auto]").checked;
      q("[data-radius]").disabled = auto || !data.can_edit;
      q("[data-radius-out]").textContent = auto ? "(template's)" : q("[data-radius]").value + " px";
    }
    function drawChecks(checks) {
      var bad = checks.filter(function (c) { return !c.ok; });
      q("#th-contrast").innerHTML = '<p class="small"><b>' + (bad.length ? "⚠ " + bad.length + " colour pair" + (bad.length > 1 ? "s are" : " is") + " hard to read" : "✓ All colour pairs pass WCAG AA") + "</b></p>" +
        '<ul class="th-checks">' + checks.map(function (c) {
          return '<li class="' + (c.ok ? "ok" : "bad") + '"><span class="th-chip" style="color:' + c.fg + ";background:" + c.bg + '">Aa</span>' +
            "<span>" + esc(c.what) + '</span><b>' + c.ratio.toFixed(2) + ":1</b><small>" + (c.ok ? "passes" : "needs " + c.need + ":1") + "</small></li>";
        }).join("") + "</ul>";
    }
    var timer;
    function changed(fromPreset) {
      if (!fromPreset) state.preset = "";
      qa("[data-preset]").forEach(function (b) { b.classList.toggle("on", b.dataset.preset === state.preset); });
      clearTimeout(timer);
      timer = setTimeout(function () {
        T.api("POST", "/api/sites/" + data.site + "/theme/preview", { theme: value() }).then(function (res) {
          drawChecks(res.checks); drawDark(res.dark);
          if (opts.onPreview) opts.onPreview(res);
        }).catch(function () { /* the toast says why */ });
      }, 150);
    }
    function drawDark(pal) {
      if (pal) lastDark = pal;
      q("[data-dark-box]").hidden = state.mode === "light" && !state.toggle;
      qa("[data-dark]").forEach(function (c) {
        var k = c.dataset.dark, v = state.dark_colors[k] || lastDark[k] || "#000000";
        c.value = v; c.nextElementSibling.textContent = state.dark_colors[k] ? v : v + " (auto)";
      });
    }
    function value() {
      var v = { colors: state.colors, fonts: state.fonts, style: state.style || "", space: state.space || "",
                mode: state.mode || "light", toggle: !!state.toggle, dark_colors: state.dark_colors,
                radius: q("[data-radius-auto]").checked ? null : +q("[data-radius]").value, preset: state.preset || "" };
      if (state.lang) v.lang = state.lang;
      return v;
    }
    function setControls() {
      qa("[data-color]").forEach(function (c) { c.value = colour(c.dataset.color); c.nextElementSibling.textContent = c.value; });
      qa("[data-font]").forEach(function (s) { s.value = state.fonts[s.dataset.font] || ""; });
      q("[data-style]").value = state.style || ""; q("[data-space]").value = state.space || "";
      q("[data-radius-auto]").checked = state.radius == null;
      if (state.radius != null) q("[data-radius]").value = state.radius;
      drawRadius();
    }
    qa("[data-color]").forEach(function (c) {
      c.addEventListener("input", function () { state.colors[c.dataset.color] = c.value; c.nextElementSibling.textContent = c.value; changed(); });
    });
    qa("[data-font]").forEach(function (s) { s.addEventListener("change", function () { if (s.value) state.fonts[s.dataset.font] = s.value; else delete state.fonts[s.dataset.font]; changed(); }); });
    q("[data-style]").addEventListener("change", function () { state.style = this.value; changed(); });
    q("[data-space]").addEventListener("change", function () { state.space = this.value; changed(); });
    q("[data-radius]").addEventListener("input", function () { state.radius = +this.value; drawRadius(); changed(); });
    q("[data-radius-auto]").addEventListener("change", function () { state.radius = this.checked ? null : +q("[data-radius]").value; drawRadius(); changed(); });
    q("[data-mode]").addEventListener("change", function () { state.mode = this.value; drawDark(); changed(); });
    q("[data-toggle]").addEventListener("change", function () { state.toggle = this.checked; drawDark(); changed(); });
    qa("[data-dark]").forEach(function (c) {
      c.addEventListener("input", function () { state.dark_colors[c.dataset.dark] = c.value; drawDark(); changed(); });
    });
    qa("[data-dark-auto]").forEach(function (b) {
      b.addEventListener("click", function () { delete state.dark_colors[b.dataset.darkAuto]; drawDark(); changed(); });
    });
    qa("[data-scheme]").forEach(function (b) {
      b.addEventListener("click", function () { if (opts.onScheme) opts.onScheme(b.dataset.scheme); });
    });
    q("[data-reset]").addEventListener("click", function () { state.colors = {}; setControls(); changed(); });
    qa("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = data.presets[b.dataset.preset];
        state.colors = Object.assign({}, p.colors); state.fonts = Object.assign({}, p.fonts);
        state.style = p.style; state.radius = p.radius; state.space = p.space; state.preset = b.dataset.preset;
        setControls(); changed(true);
      });
    });
    var lock = q("[data-lock]");
    if (lock) lock.addEventListener("change", function () {
      T.api("PUT", "/api/sites/" + data.site + "/brand", { locked: lock.checked }).then(function (res) {
        data.locked = res.locked; T.toast(res.locked ? "Brand locked: editors can't change the theme now." : "Brand unlocked.");
      }).catch(function () { lock.checked = !lock.checked; });
    });
    drawRadius();
    drawDark();
    if (!opts.onScheme) qa("[data-scheme]").forEach(function (b) { b.parentNode.hidden = true; });
    changed(true);
    return { value: value, setLang: function (l) { state.lang = l; } };
  }
  window.TenshiTheme = { mount: mount };
})();
