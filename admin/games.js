/* admin/games.js: the editor's Game Studio tab.
 *
 *   3D MODELS: every character slot in the three games (models/models.json) with a spinning 3D preview, "Upload .glb"
 *     (checked: a real glTF binary, not compressed, not too big) and "Revert to built-in".
 *   GAME SETTINGS: every value in game_settings.py as a form (numbers with sliders, ranges, switches), with the comments
 *     from that file as help. Built from data/games-schema.json, which game_settings.py writes.
 *
 * Save & publish makes ONE commit (like the rest of the editor): the uploaded models (models/uploads/), models.json,
 * data/games.json (only the values you changed) and sandbox/game-settings.js (what the games read), plus a new
 * cache tag for that file on the homepage. The live site updates within about 5 minutes.
 */
(function () {
  "use strict";
  var MAX_MB = 25;              // bigger models: reduce them first (Meshy: remesh to 30-50k triangles)
  var BIG_TRIS = 60000;         // over this, the game simplifies the model a lot (it draws about 2,400 triangles)
  var GAMES = {
    arcade: { name: "Hero arcade", hint: "the click-to-shoot game at the top of the homepage" },
    rts: { name: "Station Defense", hint: "the space strategy game" },
    arpg: { name: "Undercity", hint: "the dungeon crawler" }
  };
  var SLOT_NAMES = {
    "arcade.drone": "Drone", "arcade.saucer": "Saucer", "arcade.cube": "Cube", "arcade.star": "Star", "arcade.robot": "Giant robot (Iron Ronin)", "arcade.kaiju": "Kaiju (Tokage)",
    "rts.station": "Tenshi Station", "rts.miner": "Miner", "rts.interceptor": "Interceptor", "rts.gunship": "Gunship", "rts.turret": "Defense Turret", "rts.depot": "Supply Depot",
    "rts.outpost": "Outpost", "rts.shipyard": "Shipyard", "rts.swarmling": "Swarmling", "rts.behemoth": "Behemoth", "rts.spitter": "Spitter", "rts.hive": "Alien Hive",
    "rts.asteroid": "Asteroid", "rts.crystal": "Crystal",
    "arpg.hero": "Hero", "arpg.hollow": "Hollow", "arpg.skitter": "Skitter", "arpg.wisp": "Wisp", "arpg.golem": "Golem", "arpg.warden": "The Warden (boss)"
  };
  var ED, loaded = false, loading = null;
  var schema = null, edits = {}, values = {}, models = {}, modelsOrig = {};
  var uploads = {};             // slot -> { file, base64, url, tris, name }
  var dirty = { settings: new Set(), models: new Set() };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var esc = function (s) { return ED ? ED.esc(s) : String(s); };
  function get(obj, path) { return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function set(obj, path, v) { var ks = path.split("."), last = ks.pop(), o = obj; ks.forEach(function (k) { if (!o[k] || typeof o[k] !== "object") o[k] = {}; o = o[k]; }); o[last] = v; }
  function merge(base, extra) {
    var out = clone(base);
    Object.keys(extra || {}).forEach(function (k) {
      if (!(k in out)) return;
      if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) && extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k])) out[k] = merge(out[k], extra[k]);
      else out[k] = extra[k];
    });
    return out;
  }
  // Only the values that differ from game_settings.py's defaults (that's what data/games.json keeps).
  function diff(cur, def) {
    var out = {};
    Object.keys(cur).forEach(function (k) {
      var a = cur[k], b = def ? def[k] : undefined;
      if (a && typeof a === "object" && !Array.isArray(a)) { var d = diff(a, b || {}); if (Object.keys(d).length) out[k] = d; }
      else if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = a;
    });
    return out;
  }
  function pretty(key) { return String(key).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, function (c) { return c.toUpperCase(); }); }

  /* ------------------------------------------------------------------ load */
  function open() {
    ED = window.TenshiEditor;
    if (!ED || !ED.signedIn()) return;
    if (loaded || loading) return loading;
    loading = Promise.all([ED.readJSON("data/games-schema.json"), ED.readJSON("data/games.json"), ED.readJSON("models/models.json")]).then(function (r) {
      schema = r[0]; edits = r[1] || {}; models = r[2] || {}; modelsOrig = clone(models);
      if (!schema) throw new Error("data/games-schema.json is missing: run python game_settings.py once and push.");
      values = merge(schema.defaults, edits);
      loaded = true; renderModels(); renderSettings(); updateBar();
    }).catch(function (e) {
      $("#gs-models").innerHTML = '<p class="ed-msg is-error">Could not load Game Studio: ' + esc(e.message) + "</p>";
      loading = null;
    });
    return loading;
  }
  $$(".gs-switch button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".gs-switch button").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      $("#gs-models").hidden = b.dataset.gs !== "models"; $("#gs-settings").hidden = b.dataset.gs !== "settings";
    });
  });

  /* ------------------------------------------------------------------ 3D models */
  function builtIn(slot) { return slot.indexOf("arpg.") === 0 ? "source/" + slot + ".glb" : ""; }
  function isBuiltIn(slot) { var f = models[slot] || ""; return !f || f === builtIn(slot) || f.indexOf("source/") === 0; }
  function previewSrc(slot) {
    if (uploads[slot]) return uploads[slot].url;
    var f = models[slot] || builtIn(slot) || "source/" + slot + ".glb";
    return ED.site + "models/" + f;
  }
  function renderModels() {
    var groups = {};
    Object.keys(models).filter(function (k) { return k.charAt(0) !== "_"; }).forEach(function (slot) {
      var g = slot.split(".")[0]; (groups[g] = groups[g] || []).push(slot);
    });
    var html = '<p class="ed-tip">Upload a <b>.glb</b> (from Meshy, Tripo, Blender…) to replace a character. Face the model forward (Blender: toward −Y), feet on the ground, no Draco/meshopt compression, under ' + MAX_MB +
      ' MB. Very detailed models are simplified when they load, so for the best result export about 30,000–50,000 triangles.</p>';
    Object.keys(GAMES).forEach(function (g) {
      if (!groups[g]) return;
      html += '<h3 class="gs-game">' + esc(GAMES[g].name) + ' <small>' + esc(GAMES[g].hint) + "</small></h3><div class=\"gs-grid\">";
      groups[g].forEach(function (slot) { html += card(slot); });
      html += "</div>";
    });
    $("#gs-models").innerHTML = html;
    $$("#gs-models .gs-card").forEach(wireCard);
  }
  function card(slot) {
    var up = uploads[slot], custom = !isBuiltIn(slot), file = up ? up.name + " (new, not saved)" : custom ? models[slot] : "built-in";
    var hero = slot === "arpg.hero" ? '<p class="gs-note">Undercity shows the pre-rendered Eclipse Wraith. Uploading a model here switches the hero to your model (Game settings › Undercity › Hero sprite).</p>' : "";
    return '<article class="gs-card' + (dirty.models.has(slot) ? " is-dirty" : "") + '" data-slot="' + esc(slot) + '">' +
      '<model-viewer src="' + esc(previewSrc(slot)) + '" alt="' + esc(SLOT_NAMES[slot] || slot) + '" camera-controls auto-rotate rotation-per-second="20deg" shadow-intensity="1" exposure="1.1" interaction-prompt="none" loading="lazy"></model-viewer>' +
      '<div class="gs-card-body"><h4>' + esc(SLOT_NAMES[slot] || slot) + ' <code>' + esc(slot) + "</code></h4>" +
      '<p class="gs-file">' + esc(file) + (up ? " · " + up.tris.toLocaleString() + " triangles" : "") + "</p>" + hero +
      '<p class="gs-msg" aria-live="polite"></p>' +
      '<div class="gs-card-actions"><label class="ed-btn ed-btn--small">Upload .glb<input type="file" accept=".glb,model/gltf-binary" hidden></label>' +
      '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-act="revert"' + (custom || up ? "" : " disabled") + ">Revert to built-in</button></div></div></article>";
  }
  function wireCard(el) {
    var slot = el.dataset.slot, msg = $(".gs-msg", el);
    $("input[type=file]", el).addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      msg.textContent = "Checking…"; msg.className = "gs-msg";
      checkGlb(f).then(function (info) {
        return toBase64(f).then(function (b64) {
          if (uploads[slot]) URL.revokeObjectURL(uploads[slot].url);
          uploads[slot] = { file: f, base64: b64, url: URL.createObjectURL(f), tris: info.tris, name: f.name };
          dirty.models.add(slot);
          if (slot === "arpg.hero") setValue("arpg.heroSprite", false);
          el.outerHTML = card(slot);
          var fresh = $('#gs-models .gs-card[data-slot="' + slot + '"]'); wireCard(fresh);
          if (info.warn) { var m = $(".gs-msg", fresh); m.textContent = info.warn; m.className = "gs-msg is-warn"; }
          updateBar();
        });
      }).catch(function (err) { msg.textContent = err.message; msg.className = "gs-msg is-error"; e.target.value = ""; });
    });
    $('[data-act="revert"]', el).addEventListener("click", function () {
      if (uploads[slot]) { URL.revokeObjectURL(uploads[slot].url); delete uploads[slot]; }
      models[slot] = builtIn(slot);
      if (JSON.stringify(models[slot]) === JSON.stringify(modelsOrig[slot])) dirty.models.delete(slot); else dirty.models.add(slot);
      if (slot === "arpg.hero") setValue("arpg.heroSprite", true);
      el.outerHTML = card(slot); wireCard($('#gs-models .gs-card[data-slot="' + slot + '"]')); updateBar();
    });
  }
  // A real glTF binary? Not compressed? How many triangles?
  function checkGlb(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > MAX_MB * 1048576) return reject(new Error("This file is " + (file.size / 1048576).toFixed(0) + " MB; the limit is " + MAX_MB + " MB. Reduce it first (Meshy: Remesh to 30,000–50,000 triangles; Blender: Decimate)."));
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error("Could not read the file.")); };
      rd.onload = function () {
        try {
          var dv = new DataView(rd.result);
          if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("That isn't a .glb (glTF binary) file. In Blender: File › Export › glTF 2.0 › Format: glTF Binary.");
          var len = dv.getUint32(12, true), type = dv.getUint32(16, true);
          if (type !== 0x4E4F534A) throw new Error("This .glb looks damaged (no JSON part).");
          var g = JSON.parse(new TextDecoder().decode(new Uint8Array(rd.result, 20, len)));
          var need = g.extensionsRequired || [];
          if (need.indexOf("KHR_draco_mesh_compression") >= 0 || need.indexOf("EXT_meshopt_compression") >= 0) throw new Error("This model is compressed (Draco / meshopt). Export it again with compression turned off.");
          var tris = 0;
          (g.meshes || []).forEach(function (m) { (m.primitives || []).forEach(function (p) { var a = g.accessors[p.indices != null ? p.indices : p.attributes.POSITION]; if (a) tris += Math.floor(a.count / 3); }); });
          if (!tris) throw new Error("No triangles found in this model.");
          resolve({ tris: tris, warn: tris > BIG_TRIS ? "Heads-up: " + tris.toLocaleString() + " triangles. The game will simplify it heavily; for the best look export 30,000–50,000." : "" });
        } catch (e) { reject(e); }
      };
      rd.readAsArrayBuffer(file);
    });
  }
  function toBase64(file) {
    return new Promise(function (resolve, reject) { var rd = new FileReader(); rd.onload = function () { resolve(String(rd.result).split(",")[1]); }; rd.onerror = reject; rd.readAsDataURL(file); });
  }

  /* ------------------------------------------------------------------ settings */
  function sectionOf(id) { return schema.sections.filter(function (s) { return s.id === id; })[0] || { help: {}, title: id }; }
  function renderSettings() {
    var html = '<p class="ed-tip">Every value from <code>game_settings.py</code>. Changed values are highlighted; <b>Reset</b> puts one back to its default. Times are in milliseconds (1000 = 1 second) unless the note says otherwise.</p>';
    schema.sections.forEach(function (sec) {
      var t = sec.title.split(":"), name = t[0].trim(), sub = t.slice(1).join(":").trim();
      html += '<details class="gs-section" data-sec="' + esc(sec.id) + '"><summary><b>' + esc(pretty(name.toLowerCase())) + "</b> <small>" + esc(sub) + "</small></summary>" + fields(sec, schema.defaults[sec.id], sec.id, 0) + "</details>";
    });
    html += '<div class="ed-actions ed-actions--left"><button type="button" class="ed-btn ed-btn--ghost" id="gs-reset-all">Reset every setting to game_settings.py</button></div>';
    $("#gs-settings").innerHTML = html;
    $$("#gs-settings [data-path]").forEach(wireField);
    $("#gs-reset-all").addEventListener("click", function () {
      if (!confirm("Put every game setting back to the values in game_settings.py?")) return;
      values = clone(schema.defaults); dirty.settings.add("*"); renderSettings(); updateBar();
    });
  }
  function fields(sec, def, path, depth) {
    var html = "";
    Object.keys(def).forEach(function (k) {
      var p = path + "." + k, rel = p.slice(sec.id.length + 1), d = def[k], help = sec.help[rel] || "";
      if (d && typeof d === "object" && !Array.isArray(d)) {
        html += '<fieldset class="gs-group gs-depth-' + depth + '"><legend>' + esc(pretty(k)) + (help ? " <small>" + esc(help) + "</small>" : "") + "</legend>" + fields(sec, d, p, depth + 1) + "</fieldset>";
      } else html += field(p, k, d, help);
    });
    return html;
  }
  function field(p, k, d, help) {
    var v = get(values, p), changed = JSON.stringify(v) !== JSON.stringify(d), input;
    if (typeof d === "boolean") input = '<label class="gs-switch-input"><input type="checkbox" data-kind="bool"' + (v ? " checked" : "") + "><span>" + (v ? "On" : "Off") + "</span></label>";
    else if (Array.isArray(d)) input = '<span class="gs-range"><input type="number" step="any" data-kind="arr0" value="' + v[0] + '"> to <input type="number" step="any" data-kind="arr1" value="' + v[1] + '"></span>';
    else if (typeof d === "string") input = '<input type="color" data-kind="color" value="' + esc(v) + '">';
    else {
      var max = d === 0 ? 10 : d < 0 ? Math.abs(d) * 4 : d <= 1 ? 1 : Math.ceil(d * 4), min = d < 0 ? -Math.abs(d) * 4 : 0, step = Number.isInteger(d) && Math.abs(d) >= 2 ? 1 : (max - min) / 200;
      input = '<input type="range" data-kind="slider" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"><input type="number" step="any" data-kind="num" value="' + v + '">';
    }
    return '<div class="gs-field' + (changed ? " is-changed" : "") + '" data-path="' + esc(p) + '"><div class="gs-label"><b>' + esc(pretty(k)) + "</b>" + (help ? "<small>" + esc(help) + "</small>" : "") +
      '</div><div class="gs-input">' + input + '<button type="button" class="gs-reset" title="Back to ' + esc(JSON.stringify(d)) + '"' + (changed ? "" : " hidden") + ">Reset</button></div></div>";
  }
  function wireField(el) {
    var p = el.dataset.path, d = get(schema.defaults, p);
    function commitValue(v) { setValue(p, v); refresh(); }
    function refresh() {
      var v = get(values, p), changed = JSON.stringify(v) !== JSON.stringify(d);
      el.classList.toggle("is-changed", changed); $(".gs-reset", el).hidden = !changed;
      var sl = $('[data-kind="slider"]', el), nu = $('[data-kind="num"]', el), cb = $('[data-kind="bool"]', el);
      if (sl && document.activeElement !== sl) sl.value = v; if (nu && document.activeElement !== nu) nu.value = v;
      if (cb) { cb.checked = !!v; cb.nextElementSibling.textContent = v ? "On" : "Off"; }
    }
    $$("input", el).forEach(function (inp) {
      inp.addEventListener("input", function () {
        var k = inp.dataset.kind;
        if (k === "slider" || k === "num") { var n = parseFloat(inp.value); if (!isNaN(n)) commitValue(n); }
        else if (k === "bool") commitValue(inp.checked);
        else if (k === "color") commitValue(inp.value);
        else if (k === "arr0" || k === "arr1") { var a = (get(values, p) || d).slice(), n2 = parseFloat(inp.value); if (!isNaN(n2)) { a[k === "arr0" ? 0 : 1] = n2; commitValue(a); } }
      });
    });
    $(".gs-reset", el).addEventListener("click", function () { commitValue(clone(d)); el.outerHTML = field(p, p.split(".").pop(), d, (sectionOf(p.split(".")[0]).help[p.split(".").slice(1).join(".")] || "")); wireField($('#gs-settings [data-path="' + p + '"]')); });
    el._refresh = refresh;
  }
  function setValue(p, v) {
    set(values, p, v); dirty.settings.add(p);
    var el = document.querySelector('#gs-settings [data-path="' + p + '"]'); if (el && el._refresh) el._refresh();
    updateBar();
  }

  /* ------------------------------------------------------------------ save */
  function changes() {
    var newEdits = diff(values, schema.defaults), settingsChanged = JSON.stringify(newEdits) !== JSON.stringify(edits);
    var modelSlots = Array.from(dirty.models).filter(function (s) { return uploads[s] || JSON.stringify(models[s]) !== JSON.stringify(modelsOrig[s]); });
    return { newEdits: newEdits, settingsChanged: settingsChanged, modelSlots: modelSlots };
  }
  function updateBar() {
    if (!loaded) return;
    var c = changes(), n = (c.settingsChanged ? countLeaves(diffCount(values, merge(schema.defaults, edits))) : 0), m = c.modelSlots.length;
    var txt = !c.settingsChanged && !m ? "No changes" : [n ? n + " setting" + (n > 1 ? "s" : "") : c.settingsChanged ? "settings" : "", m ? m + " model" + (m > 1 ? "s" : "") : ""].filter(Boolean).join(" and ") + " not saved yet";
    $("#gs-pending").textContent = txt; $("#gs-save").disabled = !c.settingsChanged && !m;
  }
  function diffCount(a, b) { return diff(a, b); }
  function countLeaves(o) { return Object.keys(o).reduce(function (t, k) { return t + (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? countLeaves(o[k]) : 1); }, 0); }
  function settingsJs(all) {
    return "// Written by game_settings.py (and by the editor's Game Studio). Don't edit this file: use Game Studio, or edit game_settings.py and run it.\n" +
      "window.TENSHI_GAMES = " + JSON.stringify(all, null, 1) + ";\n" +
      "// Copies a game's settings over its built-in ones (only the values that are given).\n" +
      "window.TENSHI_TUNE = function tune(target, src) {\n" +
      "  if (!target || !src) return target;\n" +
      "  for (const k in src) {\n" +
      "    const v = src[k];\n" +
      "    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) tune(target[k], v);\n" +
      "    else target[k] = v;\n" +
      "  }\n" +
      "  return target;\n" +
      "};\n";
  }
  $("#gs-save").addEventListener("click", function () {
    var btn = this, c = changes(), files = [], stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12), summary = [];
    ED.busy(btn, true, "Publishing…");
    c.modelSlots.forEach(function (slot) {
      if (uploads[slot]) { var path = "uploads/" + slot + "-" + stamp + ".glb"; files.push({ path: "models/" + path, base64: uploads[slot].base64 }); models[slot] = path; }
    });
    var jobs = [];
    if (c.modelSlots.length) { files.push({ path: "models/models.json", text: JSON.stringify(models, null, 2) + "\n" }); summary.push(c.modelSlots.length + " model" + (c.modelSlots.length > 1 ? "s" : "")); }
    if (c.settingsChanged) {
      files.push({ path: "data/games.json", text: JSON.stringify(c.newEdits, null, 1) + "\n" });
      files.push({ path: "sandbox/game-settings.js", text: settingsJs(values) });
      summary.push("game settings");
      // A new cache tag for the settings file on the homepage, so visitors get the new values straight away.
      ["index.html", "sandbox/neon-home.html"].forEach(function (page) {
        jobs.push(ED.readText(page).then(function (html) {
          if (html && /game-settings\.js\?v=[\w-]+/.test(html)) files.push({ path: page, text: html.replace(/game-settings\.js\?v=[\w-]+/g, "game-settings.js?v=gs" + stamp) });
        }));
      });
    }
    Promise.all(jobs).then(function () { return ED.commit(files, "CMS: Game Studio (" + summary.join(", ") + ")"); }).then(function () {
      edits = c.newEdits; modelsOrig = clone(models);
      Object.keys(uploads).forEach(function (s) { URL.revokeObjectURL(uploads[s].url); }); uploads = {};
      dirty.settings.clear(); dirty.models.clear();
      renderModels(); renderSettings(); updateBar();
      ED.toast("Published. The games update on the live site within about 5 minutes.");
    }).catch(function (e) {
      // Put the slots back so nothing looks saved that wasn't.
      c.modelSlots.forEach(function (slot) { if (uploads[slot]) models[slot] = modelsOrig[slot]; });
      ED.toast("Could not publish: " + e.message, true, 8000);
    }).then(function () { ED.busy(btn, false); updateBar(); });
  });

  window.TenshiGames = { open: open };
})();
