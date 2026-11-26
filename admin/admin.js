/* Tenshi Editor (admin.html): a small CMS for the Tenshi Systems Engineering site.
   The site is served from the tenshi-cms branch (tenshisystems.com pulls it every 5 minutes), so saving means committing changed files to that branch through the GitHub
   API, with the editor's own fine-grained key (Contents: read and write). The key stays in this browser tab (sessionStorage) only.

   - Text: every word on the site lives in translations.js in ten languages. The editor changes single entries there
     (admin/tr.js) and, when the English changes, fills the other languages with Chrome's built-in translator on Save.
   - Pictures: replacing one overwrites the same file (resized and re-encoded in the browser). If the type changes
     (a photo over an SVG), the new file gets the new extension and every page and script that named the old file
     is updated in the same commit.
   - After a save, .github/workflows/cms-rebuild.yml rebuilds the generated pages and restamps assets. */
(function () {
  "use strict";

  var REPO = "jcali0351/tenshisystemsengineering", BRANCH = "tenshi-cms", API = "https://api.github.com";
  var SITE = new URL(".", location.href).href;
  var KEY = "tse-editor-token";
  var TR = window.TenshiTR, LANGS = TR.LANGS;
  var LANG_NAMES = { en: "English", ja: "Japanese", ko: "Korean", de: "German", es: "Spanish", zh: "Chinese (Simplified)",
    ar: "Arabic", pl: "Polish", pcm: "Nigerian Pidgin", fa: "Farsi" };
  var MT_CODES = { ja: "ja", ko: "ko", de: "de", es: "es", zh: "zh", ar: "ar", pl: "pl", fa: "fa" }; // pcm: not offered by Chrome
  var IMG_RE = /\.(jpe?g|png|webp|gif|svg)$/i;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ------------------------------------------------------------------ key storage
     The GitHub key is kept for this browser tab only (sessionStorage): closing the tab signs you out. Older versions
     could keep it in localStorage ("Keep me signed in"); any such copy is deleted on load so it doesn't linger on disk.
     TODO: replace the personal key with a server-held GitHub App token (short-lived installation tokens minted behind
     the /admin basic-auth login), so no long-lived GitHub key is ever pasted into or held by the browser. */
  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  try { (store("localStorage") || { removeItem: function () {} }).removeItem(KEY); } catch (e) {}
  function getToken() { try { return (store("sessionStorage") || {}).getItem(KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { store("sessionStorage").setItem(KEY, t); } catch (e) {} }
  function clearToken() {
    try { store("sessionStorage").removeItem(KEY); } catch (e) {}
    try { store("localStorage").removeItem(KEY); } catch (e) {}
  }
  var token = getToken();

  /* ------------------------------------------------------------------ small helpers */
  var toastTimer;
  function toast(msg, err, ms) {
    var t = $("#ed-toast"); t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || (err ? 8000 : 4000));
  }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.classList.add("busy"); }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.classList.remove("busy"); }
  }
  function b64ToText(b64) {
    var bin = atob(b64.replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.onerror = rej; r.readAsDataURL(blob);
    });
  }
  function prettyPage(p) {
    if (p === "index.html") return "Home";
    var name = p.replace(/^.*\//, "").replace(/\.html$/, "").replace(/-/g, " ");
    name = name.charAt(0).toUpperCase() + name.slice(1);
    if (p.indexOf("services/") === 0) return "Service: " + name;
    if (p.indexOf("projects/") === 0) return "Project: " + name;
    return name;
  }

  /* ------------------------------------------------------------------ GitHub API */
  function gh(path, opts) {
    opts = opts || {};
    var headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
      .then(function (r) {
        if (r.ok) return r.status === 204 ? null : r.json();
        return r.json().catch(function () { return {}; }).then(function (j) {
          var msg = j.message || ("GitHub answered " + r.status);
          if (r.status === 401) msg = "GitHub didn't accept the key. It may have expired: sign out and sign in with a new one.";
          if (r.status === 403 && /permission|Resource not accessible/i.test(msg)) msg = "The key can read the site but not change it. On GitHub, give it Contents: Read and write.";
          var e = new Error(msg); e.status = r.status; throw e;
        });
      });
  }
  var R = "/repos/" + REPO;
  var tree = new Map();
  function loadTree() {
    return gh(R + "/git/ref/heads/" + BRANCH)
      .then(function (ref) { return gh(R + "/git/commits/" + ref.object.sha); })
      .then(function (c) { return gh(R + "/git/trees/" + c.tree.sha + "?recursive=1"); })
      .then(function (t) {
        tree = new Map();
        t.tree.forEach(function (it) { if (it.type === "blob") tree.set(it.path, { sha: it.sha, size: it.size }); });
      });
  }
  function readText(path) {
    var it = tree.get(path);
    if (!it) return Promise.reject(new Error(path + " isn't on the site."));
    return gh(R + "/git/blobs/" + it.sha).then(function (b) { return b64ToText(b.content); });
  }
  /* One commit for any number of files: [{ path, text } | { path, base64 }]. Retries on top of anything pushed meanwhile. */
  function commit(changes, message) {
    var attempt = 0;
    function go() {
      attempt++;
      var head, baseTree;
      return gh(R + "/git/ref/heads/" + BRANCH).then(function (ref) {
        head = ref.object.sha; return gh(R + "/git/commits/" + head);
      }).then(function (c) {
        baseTree = c.tree.sha;
        return Promise.all(changes.map(function (ch) {
          var body = ch.base64 != null ? { content: ch.base64, encoding: "base64" } : { content: ch.text, encoding: "utf-8" };
          return gh(R + "/git/blobs", { method: "POST", body: body }).then(function (b) { return { path: ch.path, mode: "100644", type: "blob", sha: b.sha }; });
        }));
      }).then(function (entries) {
        return gh(R + "/git/trees", { method: "POST", body: { base_tree: baseTree, tree: entries } });
      }).then(function (nt) {
        return gh(R + "/git/commits", { method: "POST", body: { message: message + "\n\nSaved from the Tenshi Editor (admin.html).", tree: nt.sha, parents: [head] } });
      }).then(function (nc) {
        return gh(R + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: nc.sha, force: false } });
      }).catch(function (e) {
        if (e.status === 422 && attempt < 4) return new Promise(function (r) { setTimeout(r, 800 * attempt); }).then(go);
        throw e;
      });
    }
    return go();
  }

  /* ------------------------------------------------------------------ state */
  var T = {};              // text as loaded: { en: { key: "..." }, ... }
  var order = [];          // English keys in file order
  var pend = {};           // unsaved text: { lang: { key: value } }
  var manual = new Set();  // "lang:key" typed by hand this session (auto-translate leaves these alone)
  var autoTr = {};         // key -> true/false: translate the other languages on Save (English changed)
  var imgEdits = new Map();// path -> { file, blob, newPath, url, width, height }
  var pageKeys = {};       // page path -> Set of keys used on it
  var pages = [];

  function cur(lang, key) {
    if (pend[lang] && Object.prototype.hasOwnProperty.call(pend[lang], key)) return pend[lang][key];
    return (T[lang] && T[lang][key] != null) ? T[lang][key] : "";
  }
  function setPend(lang, key, value) {
    pend[lang] = pend[lang] || {};
    if (value === ((T[lang] || {})[key] || "")) delete pend[lang][key]; else pend[lang][key] = value;
    if (lang === "en") {
      if (pend.en && Object.prototype.hasOwnProperty.call(pend.en, key)) { if (autoTr[key] === undefined) autoTr[key] = true; }
      else delete autoTr[key];
    }
    updateBar(); paintFrame(key);
  }
  function changedKeys() {
    var s = new Set();
    Object.keys(pend).forEach(function (l) { Object.keys(pend[l]).forEach(function (k) { s.add(k); }); });
    return s;
  }
  function pendingCount() { return changedKeys().size + imgEdits.size + (sloganDirty() ? 1 : 0) + (parallaxDirty() ? 1 : 0) + (buttonsDirty() ? 1 : 0) + (customDirty() ? 1 : 0) + (shareDirty() ? 1 : 0) + (fxDirty() ? 1 : 0); }
  function updateBar() {
    var n = pendingCount(), p = $("#ed-pending");
    p.hidden = !n; p.textContent = n + (n === 1 ? " unsaved change" : " unsaved changes");
    $("#ed-save").disabled = !n; $("#ed-discard").hidden = !n;
  }
  window.addEventListener("beforeunload", function (e) { if (pendingCount()) { e.preventDefault(); e.returnValue = ""; } });

  /* ================================================================== SIGN IN */
  function showLogin(msg) {
    $("#ed-login").hidden = false; $("#ed-app").hidden = true; $(".ed-who").hidden = true;
    if (msg) { var m = $("#ed-login-msg"); m.textContent = msg; m.className = "ed-msg err"; }
    setTimeout(function () { $("#ed-token").focus(); }, 50);
  }
  function signIn() {
    return gh(R).then(function (repo) {
      if (repo.permissions && repo.permissions.push === false) throw new Error("This GitHub account can't change the site.");
      return gh("/user").catch(function () { return {}; });
    }).then(function (u) {
      $(".ed-user").textContent = u && u.login ? "Signed in as " + u.login : "Signed in";
      $(".ed-who").hidden = false; $("#ed-login").hidden = true; $("#ed-app").hidden = false;
      return startApp();
    });
  }
  $("#ed-login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("#ed-token").value.trim(), m = $("#ed-login-msg"), btn = e.target.querySelector("button");
    if (!t) return;
    token = t; m.textContent = "Checking the key…"; m.className = "ed-msg"; busy(btn, true, "Checking…");
    signIn().then(function () { setToken(t); $("#ed-token").value = ""; })
      .catch(function (err) {
        token = "";
        m.textContent = err.status === 404 ? "That key can't see the tenshisystemsengineering repository. When you make it, choose Only select repositories › tenshisystemsengineering." : err.message;
        m.className = "ed-msg err";
      }).then(function () { busy(btn, false); });
  });
  $("#ed-signout").addEventListener("click", function () {
    if (pendingCount() && !window.confirm("You have unsaved changes. Sign out anyway?")) return;
    clearToken(); token = ""; location.reload();
  });

  /* ================================================================== START */
  function startApp() {
    return loadTree().then(function () {
      return readText("translations.js");
    }).then(function (src) {
      T = TR.parse(src);
      order = Object.keys(T.en || {});
      pages = Array.from(tree.keys()).filter(function (p) {
        return /^[^/]+\.html$|^(services|projects)\/[^/]+\.html$/.test(p) && p !== "admin.html" && p !== "404.html";
      }).sort(function (a, b) { return (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)); });
      fillSelects();
      loadPageKeys();
      renderImages();
      showTab("pages");
    }).catch(function (e) { toast(e.message, true); });
  }
  function fillSelects() {
    $("#ed-page").innerHTML = pages.map(function (p) { return '<option value="' + esc(p) + '">' + esc(prettyPage(p)) + "</option>"; }).join("");
    $("#ed-page-lang").innerHTML = LANGS.map(function (l) { return '<option value="' + l + '">' + esc(LANG_NAMES[l]) + "</option>"; }).join("");
    $("#ed-text-page").innerHTML = '<option value="">All pages</option>' + pages.map(function (p) { return '<option value="' + esc(p) + '">' + esc(prettyPage(p)) + "</option>"; }).join("") + '<option value="-">Not on a page (chat, messages)</option>';
  }
  /* Which text appears on which page: read each page and note its data-i18n names. */
  function loadPageKeys() {
    Promise.all(pages.map(function (p) {
      return fetch(SITE + p, { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }).then(function (html) {
        var s = new Set(), m, re = /data-i18n="([A-Za-z0-9_]+)"/g, re2 = /data-i18n-attr="([^"]+)"/g;
        while ((m = re.exec(html))) s.add(m[1]);
        while ((m = re2.exec(html))) m[1].split(";").forEach(function (pair) { var k = pair.split(":")[1]; if (k) s.add(k.trim()); });
        pageKeys[p] = s;
      });
    })).then(renderText);
  }

  /* ================================================================== TABS */
  $$(".ed-tabs button").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });
  function showTab(name) {
    $$(".ed-tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === name)); });
    $$(".ed-panel").forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    if (name === "pages" && !$("#ed-frame").getAttribute("src")) loadFrame();
    if (name === "text") renderText();
    if (name === "images") renderImages();
    if (name === "bots") loadBots();
    if (name === "design") loadDesign();
    if (name === "slogan") loadSlogan();
    if (name === "parallax") loadParallax();
    if (name === "buttons") loadButtons();
    if (name === "share") loadShare();
    if (name === "fx") loadFx();
    if (name === "css") loadCustom();
    if (name === "games" && window.TenshiGames) window.TenshiGames.open();
  }

  /* ================================================================== PAGES (click to edit) */
  $("#ed-page").addEventListener("change", loadFrame);
  $("#ed-page-lang").addEventListener("change", loadFrame);
  function frameLang() { return $("#ed-page-lang").value || "en"; }
  function loadFrame() {
    $("#ed-frame").src = SITE + $("#ed-page").value + "?lang=" + frameLang();
  }
  $("#ed-frame").addEventListener("load", function () {
    var doc; try { doc = this.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    var st = doc.createElement("style");
    st.textContent = [
      "[data-i18n],[data-i18n-attr]{cursor:text!important}",
      "[data-i18n]:hover,[data-i18n-attr]:hover{outline:2px dashed #ff2d4f!important;outline-offset:3px}",
      "img{cursor:pointer!important}",
      "img:hover{outline:3px solid #ff2d4f!important;outline-offset:-3px}",
      "[data-ed-changed]{outline:2px solid #ffc069!important;outline-offset:3px}",
      ".lang-dialog,.chat-launcher,.chat-panel{display:none!important}"
    ].join("");
    doc.head.appendChild(st);
    doc.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var img = e.target.closest && e.target.closest("img");
      if (img) { var p = repoPath(img.getAttribute("src"), doc); if (p) return openImage(p); }
      var el = e.target.closest && e.target.closest("[data-i18n],[data-i18n-attr]");
      if (el) openText(keysOf(el));
    }, true);
    doc.addEventListener("submit", function (e) { e.preventDefault(); }, true);
    paintFrame();
  });
  function keysOf(el) {
    var keys = [];
    if (el.dataset.i18n) keys.push(el.dataset.i18n);
    (el.dataset.i18nAttr || "").split(";").forEach(function (pair) { var k = (pair.split(":")[1] || "").trim(); if (k && keys.indexOf(k) < 0) keys.push(k); });
    return keys;
  }
  function repoPath(src, doc) {
    if (!src) return null;
    var u; try { u = new URL(src, doc.baseURI); } catch (e) { return null; }
    var href = u.origin + u.pathname;
    if (href.indexOf(SITE) !== 0) return null;
    var p = decodeURIComponent(href.slice(SITE.length));
    return tree.has(p) ? p : null;
  }
  /* Show unsaved text and pictures in the preview. */
  function paintFrame(onlyKey) {
    var doc; try { doc = $("#ed-frame").contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    var lang = frameLang();
    var keys = onlyKey ? [onlyKey] : Array.from(changedKeys());
    keys.forEach(function (key) {
      var changed = !!(pend[lang] && Object.prototype.hasOwnProperty.call(pend[lang], key)) || !!(pend.en && Object.prototype.hasOwnProperty.call(pend.en, key));
      $$('[data-i18n="' + key + '"]', doc).forEach(function (el) {
        el.textContent = cur(lang, key) || cur("en", key);
        if (changed) el.setAttribute("data-ed-changed", ""); else el.removeAttribute("data-ed-changed");
      });
      $$("[data-i18n-attr]", doc).forEach(function (el) {
        el.dataset.i18nAttr.split(";").forEach(function (pair) {
          var a = pair.split(":"); if ((a[1] || "").trim() === key) el.setAttribute(a[0].trim(), cur(lang, key) || cur("en", key));
        });
      });
    });
    if (!onlyKey) $$("img", doc).forEach(function (img) {
      var p = img.dataset.edPath || repoPath(img.getAttribute("src"), doc);
      if (p && imgEdits.has(p)) { img.dataset.edPath = p; img.src = imgEdits.get(p).url; img.setAttribute("data-ed-changed", ""); }
    });
  }

  /* ================================================================== TEXT DRAWER */
  function openText(keys) {
    keys = keys.filter(function (k) { return T.en && Object.prototype.hasOwnProperty.call(T.en, k) || cur("en", k); });
    if (!keys.length) return toast("That text isn't in the text file, so it can't be edited here.", true);
    var body = $("#ed-drawer-body");
    body.innerHTML = keys.map(entryHTML).join("");
    keys.forEach(function (key) { wireEntry(key, body.querySelector('[data-key="' + key + '"]')); });
    $("#ed-drawer").hidden = false;
    var first = body.querySelector("textarea"); if (first) first.focus();
  }
  function rows(s) { return Math.min(12, Math.max(2, Math.ceil(String(s).length / 52) + (String(s).split("\n").length - 1))); }
  function entryHTML(key) {
    var others = LANGS.filter(function (l) { return l !== "en"; });
    return '<div class="ed-entry" data-key="' + esc(key) + '">' +
      '<p class="ed-key">' + esc(key) + "</p>" +
      '<label class="ed-lang"><span>English</span><textarea data-lang="en" rows="' + rows(cur("en", key)) + '">' + esc(cur("en", key)) + "</textarea></label>" +
      '<label class="ed-check ed-auto" hidden><input type="checkbox" data-auto> Translate the other languages automatically when I save</label>' +
      '<details class="ed-langs"><summary>Other languages (' + others.length + ")</summary>" +
      others.map(function (l) {
        return '<label class="ed-lang"><span>' + esc(LANG_NAMES[l]) + (manual.has(l + ":" + key) ? ' <i class="ed-badge">edited by hand</i>' : "") + "</span>" +
          '<textarea data-lang="' + l + '" rows="' + rows(cur(l, key)) + '"' + (l === "ar" || l === "fa" ? ' dir="rtl"' : "") + ">" + esc(cur(l, key)) + "</textarea></label>";
      }).join("") +
      '<p class="ed-note">Anything you type here is kept as you wrote it, even when the English is translated again.</p></details></div>';
  }
  function wireEntry(key, box) {
    var auto = box.querySelector("[data-auto]"), autoRow = box.querySelector(".ed-auto");
    function syncAuto() {
      var enChanged = !!(pend.en && Object.prototype.hasOwnProperty.call(pend.en, key));
      autoRow.hidden = !enChanged; auto.checked = autoTr[key] !== false;
    }
    syncAuto();
    auto.addEventListener("change", function () { autoTr[key] = auto.checked; });
    $$("textarea", box).forEach(function (ta) {
      ta.addEventListener("input", function () {
        var l = ta.dataset.lang;
        if (l !== "en") manual.add(l + ":" + key);
        setPend(l, key, ta.value);
        if (l === "en") syncAuto();
      });
    });
  }
  $("#ed-drawer-close").addEventListener("click", function () { $("#ed-drawer").hidden = true; renderText(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#ed-drawer").hidden) { $("#ed-drawer").hidden = true; renderText(); } });

  /* ================================================================== ALL TEXT */
  $("#ed-search").addEventListener("input", renderText);
  $("#ed-text-page").addEventListener("change", renderText);
  function renderText() {
    if (!order.length) return;
    var q = $("#ed-search").value.trim().toLowerCase(), pg = $("#ed-text-page").value;
    var onAny = new Set(); Object.keys(pageKeys).forEach(function (p) { pageKeys[p].forEach(function (k) { onAny.add(k); }); });
    var list = order.filter(function (k) {
      if (pg === "-" && onAny.has(k)) return false;
      if (pg && pg !== "-" && !(pageKeys[pg] && pageKeys[pg].has(k))) return false;
      if (!q) return true;
      if (k.toLowerCase().indexOf(q) >= 0) return true;
      return LANGS.some(function (l) { return String(cur(l, k)).toLowerCase().indexOf(q) >= 0; });
    });
    var max = 300, ch = changedKeys();
    $("#ed-text-count").textContent = list.length > max ? "Showing the first " + max + " of " + list.length + ". Search to narrow it down." : list.length + (list.length === 1 ? " piece of text" : " pieces of text");
    $("#ed-textlist").innerHTML = list.slice(0, max).map(function (k) {
      return '<li><button type="button" data-key="' + esc(k) + '"><span class="k">' + esc(k) + (ch.has(k) ? ' <i class="ed-badge">unsaved</i>' : "") + '</span><span class="v">' + esc(cur("en", k)) + "</span></button></li>";
    }).join("");
  }
  $("#ed-textlist").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-key]"); if (b) openText([b.dataset.key]);
  });

  /* ================================================================== IMAGES */
  $("#ed-img-folder").addEventListener("change", renderImages);
  function imagePaths() {
    return Array.from(tree.keys()).filter(function (p) { return IMG_RE.test(p) && !/^(tools|fonts|admin|portraits|\.github)\//.test(p); }).sort();
  }
  function renderImages() {
    var all = imagePaths(), sel = $("#ed-img-folder"), keep = sel.value;
    var folders = Array.from(new Set(all.map(function (p) { return p.indexOf("/") < 0 ? "(main folder)" : p.slice(0, p.lastIndexOf("/")); }))).sort();
    sel.innerHTML = '<option value="">All folders</option>' + folders.map(function (f) { return '<option' + (f === keep ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("");
    var f = sel.value;
    var list = all.filter(function (p) { var d = p.indexOf("/") < 0 ? "(main folder)" : p.slice(0, p.lastIndexOf("/")); return !f || d === f; });
    $("#ed-imgs").innerHTML = list.map(function (p) {
      var ed = imgEdits.get(p), it = tree.get(p);
      var src = ed ? ed.url : SITE + p + "?b=" + (it ? it.sha.slice(0, 8) : "");
      return '<li><button type="button" data-path="' + esc(p) + '"><span class="thumb"><img loading="lazy" alt="" src="' + esc(src) + '"></span>' +
        '<span class="meta"><b>' + esc(p.replace(/^.*\//, "")) + "</b>" + esc(p.indexOf("/") < 0 ? "main folder" : p.slice(0, p.lastIndexOf("/"))) +
        (ed ? ' <i class="ed-badge">unsaved' + (ed.newPath !== p ? ": becomes " + esc(ed.newPath.replace(/^.*\//, "")) : "") + "</i>" : "") + "</span></button></li>";
    }).join("");
  }
  $("#ed-imgs").addEventListener("click", function (e) { var b = e.target.closest("button[data-path]"); if (b) openImage(b.dataset.path); });

  /* Image dialog */
  var dlg = $("#ed-imgdlg"), dlgPath = "", dlgPrepared = null;
  function openImage(path) {
    dlgPath = path; dlgPrepared = null;
    $("#ed-imgdlg-path").textContent = path;
    $("#ed-imgdlg-old").src = (imgEdits.get(path) || {}).url || (SITE + path + "?b=" + ((tree.get(path) || {}).sha || "").slice(0, 8));
    $("#ed-imgdlg-new").removeAttribute("src");
    $("#ed-imgdlg-file").value = ""; $("#ed-imgdlg-ok").disabled = true;
    var m = $("#ed-imgdlg-msg"); m.textContent = ""; m.className = "ed-msg";
    dlg.returnValue = ""; dlg.showModal();
  }
  $("#ed-imgdlg-file").addEventListener("change", function () {
    var file = this.files && this.files[0], m = $("#ed-imgdlg-msg");
    if (!file) return;
    m.textContent = "Preparing the picture…"; m.className = "ed-msg"; $("#ed-imgdlg-ok").disabled = true;
    prepare(file, dlgPath).then(function (r) {
      dlgPrepared = r;
      $("#ed-imgdlg-new").src = r.url;
      var kb = Math.round(r.blob.size / 1024);
      m.textContent = (r.width ? r.width + " × " + r.height + " px, " : "") + kb + " KB." +
        (r.newPath !== dlgPath ? " It will be saved as " + r.newPath.replace(/^.*\//, "") + ", and the pages that use the old picture will be updated." : "");
      m.className = "ed-msg ok"; $("#ed-imgdlg-ok").disabled = false;
    }).catch(function (e) { m.textContent = e.message; m.className = "ed-msg err"; });
  });
  dlg.addEventListener("close", function () {
    if (dlg.returnValue !== "ok" || !dlgPrepared) { pxUploadIndex = -1; phUploadKey = null; ppUploadKey = null; return; }
    var old = imgEdits.get(dlgPath); if (old && old.url) URL.revokeObjectURL(old.url);
    imgEdits.set(dlgPath, dlgPrepared);
    if (phUploadKey !== null && px.cur && px.cur.pageHeader) {
      phTarget(phUploadKey).image = dlgPrepared.newPath;
      phUploadKey = null;
      renderPageHeaders();
    }
    if (ppUploadKey && px.cur && px.cur.panels && px.cur.panels[ppUploadKey]) {
      px.cur.panels[ppUploadKey].image = dlgPrepared.newPath;
      ppUploadKey = null;
      renderPanels();
    }
    if (pxUploadIndex >= 0 && px.cur && px.cur.bands[pxUploadIndex]) {
      px.cur.bands[pxUploadIndex].image = dlgPrepared.newPath;
      pxUploadIndex = -1;
      renderParallax();
    }
    updateBar(); renderImages(); paintFrame();
    toast("Picture ready. Press Save to put it on the site.");
  });

  function loadImg(src) {
    return new Promise(function (res, rej) {
      var img = new Image(); img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error("That file doesn't look like a picture this browser can read.")); };
      img.src = src;
    });
  }
  /* Turn the chosen file into what gets saved, in the same type as the picture it replaces when possible. */
  function prepare(file, path) {
    var ext = (path.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
    var isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (ext === "svg" && isSvg) return Promise.resolve({ blob: file, newPath: path, url: URL.createObjectURL(file), width: 0, height: 0 });
    var fileUrl = URL.createObjectURL(file);
    return Promise.all([loadImg(fileUrl), ext === "svg" ? Promise.resolve(null) : loadImg(SITE + path).catch(function () { return null; })]).then(function (r) {
      var img = r[0], oldImg = r[1];
      var type, newPath = path;
      if (ext === "jpg" || ext === "jpeg") type = "image/jpeg";
      else if (ext === "png") type = "image/png";
      else if (ext === "webp") type = "image/webp";
      else { // svg or gif replaced by a photo: new file type, new name
        type = file.type === "image/png" ? "image/png" : "image/jpeg";
        newPath = path.replace(/\.[a-z0-9]+$/i, type === "image/png" ? ".png" : ".jpg");
      }
      var maxDim = oldImg ? Math.min(2400, Math.max(1200, oldImg.naturalWidth, oldImg.naturalHeight)) : 1600;
      var w = img.naturalWidth || 1200, h = img.naturalHeight || 1200, k = Math.min(1, maxDim / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), chh = Math.max(1, Math.round(h * k));
      var c = document.createElement("canvas"); c.width = cw; c.height = chh;
      var g = c.getContext("2d");
      if (type === "image/jpeg") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, cw, chh); }
      g.drawImage(img, 0, 0, cw, chh);
      URL.revokeObjectURL(fileUrl);
      return new Promise(function (res) { c.toBlob(res, type, 0.86); }).then(function (blob) {
        if (!blob || blob.type !== type) throw new Error("This browser can't save that picture type. Try Chrome.");
        return { blob: blob, newPath: newPath, url: URL.createObjectURL(blob), width: cw, height: chh };
      });
    });
  }

  /* ================================================================== TRANSLATION (Chrome's built-in translator) */
  /* Must start inside the Save click: Chrome only downloads a language the first time while the click is fresh. */
  function timeout(p, ms, fallback) {
    return Promise.race([Promise.resolve(p).catch(function () { return fallback; }), new Promise(function (r) { setTimeout(function () { r(fallback); }, ms); })]);
  }
  var dlProgress = {};
  function startTranslators(langs) {
    var out = {};
    var api = window.Translator;
    langs.forEach(function (l) {
      if (!api || !MT_CODES[l]) { out[l] = Promise.resolve(null); return; }
      var opts = { sourceLanguage: "en", targetLanguage: MT_CODES[l] };
      var made;
      try {
        made = api.create(Object.assign({ monitor: function (m) { m.addEventListener("downloadprogress", function (e) { dlProgress[l] = e.loaded; }); } }, opts));
      } catch (e) { out[l] = Promise.resolve(null); return; }
      // If Chrome can't even say whether it has the language, don't wait on it.
      out[l] = timeout(api.availability(opts), 8000, "timeout").then(function (a) {
        if (a === "unavailable" || a === "timeout") return null;
        return timeout(made, a === "available" ? 30000 : 180000, null);   // a first-time language download can take a while
      });
    });
    return out;
  }
  function translateAll(jobs, translators, status) {
    // jobs: [{ key, text, langs: [...] }]
    var missing = new Set(), done = 0, total = jobs.reduce(function (n, j) { return n + j.langs.length; }, 0);
    // The whole translation step gets at most 20 seconds, so a save never hangs (Chrome can take minutes to
    // download a language the first time). Whatever isn't translated by then keeps the English text.
    var deadline = Date.now() + 20000, left = function () { return Math.max(0, deadline - Date.now()); };
    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      job.langs.forEach(function (l) {
        chain = chain.then(function () {
          var waiting = setInterval(function () {
            if (dlProgress[l] != null && dlProgress[l] < 1) status("Getting " + LANG_NAMES[l] + "… " + Math.round(dlProgress[l] * 100) + "%");
          }, 500);
          return timeout(translators[l], left(), null).then(function (tr) { clearInterval(waiting); return tr; });
        }).then(function (tr) {
          if (!tr || !left()) { missing.add(l); return job.text; }
          return timeout(tr.translate(job.text), left(), null).then(function (o) {
            if (o == null || o === "") { missing.add(l); return job.text; }
            return o;
          });
        }).then(function (out) {
          pend[l] = pend[l] || {}; pend[l][job.key] = out;
          done++; status("Translating… " + done + " of " + total);
        });
      });
    });
    return chain.then(function () { return missing; });
  }

  /* ================================================================== SAVE */
  $("#ed-save").addEventListener("click", function () {
    // Custom CSS: tags are refused in buildChanges; unbalanced braces only need a confirmation
    if (customDirty() && !ccBlocked(cc.cur) && ccBraces(cc.cur) && !window.confirm("Custom CSS: " + ccBraces(cc.cur) + " The rules after the mistake may not work. Save anyway?")) return;
    var btn = this, keys = Object.keys(pend.en || {}).filter(function (k) { return autoTr[k] !== false; });
    var jobs = keys.map(function (k) {
      return { key: k, text: pend.en[k], langs: LANGS.filter(function (l) { return l !== "en" && !manual.has(l + ":" + k); }) };
    }).filter(function (j) { return j.langs.length; });
    var needed = Array.from(new Set([].concat.apply([], jobs.map(function (j) { return j.langs; }))));
    var translators = startTranslators(needed);   // started inside the click on purpose
    busy(btn, true, jobs.length ? "Translating…" : "Saving…");
    var missing = new Set();
    translateAll(jobs, translators, function (s) { btn.textContent = s; }).then(function (miss) {
      missing = miss; btn.textContent = "Saving…";
      return buildChanges();
    }).then(function (res) {
      if (!res.changes.length) throw new Error("Nothing changed.");
      return commit(res.changes, "CMS: " + res.summary).then(function () { return res; });
    }).then(function (res) {
      Object.values(translators).forEach(function (p) { p.then(function (t) { if (t && t.destroy) t.destroy(); }); });
      // what's saved becomes the new starting point
      Object.keys(pend).forEach(function (l) { Object.keys(pend[l]).forEach(function (k) { T[l] = T[l] || {}; T[l][k] = pend[l][k]; if (l === "en" && order.indexOf(k) < 0) order.push(k); }); });
      pend = {}; autoTr = {};
      if (slg.cur) slg.saved = JSON.parse(JSON.stringify(slg.cur));
      if (px.cur) px.saved = JSON.parse(JSON.stringify(px.cur));
      if (bt.cur) bt.saved = JSON.parse(JSON.stringify(bt.cur));
      if (cc.cur != null) { cc.saved = cc.cur; ccCheck(); }
      if (sh.cur) sh.saved = JSON.parse(JSON.stringify(sh.cur));
      if (fx && fx.cur) fx.saved = JSON.parse(JSON.stringify(fx.cur));
      imgEdits.forEach(function (r, p) { if (r.newPath !== p) { tree.delete(p); } tree.set(r.newPath, { sha: "saved" + Date.now(), size: r.blob.size }); });
      imgEdits.clear();
      updateBar(); renderImages(); renderText(); if (slg.cur && !$("[data-panel=slogan]").hidden) renderSlogan(); if (px.cur && !$("[data-panel=parallax]").hidden) renderParallax();
      $$("[data-ed-changed]", $("#ed-frame").contentDocument || document).forEach(function (el) { el.removeAttribute("data-ed-changed"); });
      var note = missing.size ? " " + Array.from(missing).map(function (l) { return LANG_NAMES[l]; }).join(", ") + " got the English text: this browser can't translate into " + (missing.size === 1 ? "it" : "them") + ". Fix them by hand under Other languages." : "";
      toast("Saved. The live site updates in about a minute; reload a page with Ctrl+F5 if it still looks old." + note, false, missing.size ? 14000 : 7000);
      return loadTree().catch(function () {});
    }).catch(function (e) {
      toast(e.message === "Nothing changed." ? "Nothing to save." : "Couldn't save: " + e.message, e.message !== "Nothing changed.");
    }).then(function () { busy(btn, false); updateBar(); });
  });

  /* Everything to commit: translations.js with the edits applied to the newest copy, new pictures, renamed references. */
  function buildChanges() {
    var changes = [], parts = [], textKeys = changedKeys();
    var trJob = textKeys.size ? loadTree().then(function () { return readText("translations.js"); }).then(function (src) {
      var out = src;
      Object.keys(pend).forEach(function (l) { Object.keys(pend[l]).forEach(function (k) { out = TR.set(out, l, k, pend[l][k]); }); });
      if (out !== src) { changes.push({ path: "translations.js", text: out }); parts.push(textKeys.size + (textKeys.size === 1 ? " text" : " texts")); }
    }) : Promise.resolve();
    return trJob.then(function () {
      var renames = [];
      return Promise.all(Array.from(imgEdits.entries()).map(function (e) {
        var path = e[0], r = e[1];
        if (r.newPath !== path) renames.push([path.replace(/^.*\//, ""), r.newPath.replace(/^.*\//, "")]);
        return blobToB64(r.blob).then(function (b64) { changes.push({ path: r.newPath, base64: b64 }); });
      })).then(function () {
        if (imgEdits.size) parts.push(imgEdits.size + (imgEdits.size === 1 ? " picture" : " pictures"));
        if (!renames.length) return;
        // update every page and script that names a renamed picture
        var textFiles = Array.from(tree.keys()).filter(function (p) {
          return /\.(html|mjs|js|css)$/.test(p) && !/^(admin|portraits|fonts|\.github)\//.test(p) && p !== "admin.html";
        });
        return Promise.all(textFiles.map(function (p) {
          var already = changes.filter(function (c) { return c.path === p && c.text != null; })[0];
          return (already ? Promise.resolve(already.text) : readText(p)).then(function (txt) {
            var out = txt;
            renames.forEach(function (rn) { out = out.split(rn[0]).join(rn[1]); });
            if (out === txt) return;
            if (already) already.text = out; else changes.push({ path: p, text: out });
          });
        }));
      });
    }).then(function () {
      if (sloganDirty()) { changes.push({ path: "data/slogan.json", text: sloganJSON() }); parts.push("slogan"); }
      if (parallaxDirty()) { changes.push({ path: "data/parallax.json", text: parallaxJSON() }); parts.push("parallax"); }
      if (buttonsDirty()) {
        changes.push({ path: "data/buttons.json", text: JSON.stringify(BS.clean(bt.cur), null, 2) + "\n" });
        changes.push({ path: "buttons.css", text: buttonsCssFile() });
        parts.push("buttons");
      }
      if (customDirty()) {
        var bad = ccBlocked(cc.cur);
        if (bad) throw new Error("Custom CSS: " + bad);
        changes.push({ path: "custom.css", text: cc.cur.replace(/\s*$/, "") + "\n" });
        parts.push("custom CSS");
      }
      if (shareDirty()) {
        changes.push({ path: "data/share.json", text: shareJSON() });
        parts.push("share buttons");
      }
      if (fxDirty()) {
        changes.push({ path: "data/fx.json", text: fxJSON() });
        changes.push({ path: "fx-data.js", text: FX.dataJs(fx.cur) });
        parts.push("image effects");
      }
      return { changes: changes, summary: parts.join(", ") || "edit" };
    });
  }

  /* Discard */
  $("#ed-discard").addEventListener("click", function () {
    if (!window.confirm("Throw away all unsaved changes?")) return;
    pend = {}; autoTr = {}; manual.clear();
    if (slg.saved) { slg.cur = JSON.parse(JSON.stringify(slg.saved)); renderSlogan(); }
    if (px.saved) { px.cur = JSON.parse(JSON.stringify(px.saved)); renderParallax(); }
    if (bt.saved) { bt.cur = JSON.parse(JSON.stringify(bt.saved)); btRender(); }
    if (cc.saved != null) { cc.cur = cc.saved; $("#cc-text").value = cc.cur; ccGutter(); ccCheck(); ccLive(); }
    if (sh.saved) { sh.cur = JSON.parse(JSON.stringify(sh.saved)); shInitOrder(sh.cur); renderShare(); }
    if (fx && fx.saved) { fx.cur = JSON.parse(JSON.stringify(fx.saved)); if (fx.sel >= fx.cur.rules.length) fx.sel = fx.cur.rules.length - 1; renderFx(); }
    imgEdits.forEach(function (r) { if (r.url) URL.revokeObjectURL(r.url); }); imgEdits.clear();
    $("#ed-drawer").hidden = true;
    updateBar(); renderText(); renderImages(); loadFrame();
  });

  /* ================================================================== GO */
  if (!window.Translator) {
    // shown once the editor is open
    setTimeout(function () { if (!$("#ed-app").hidden) toast("This browser has no built-in translator. Text you change in English will be copied into the other languages. Use desktop Chrome to translate automatically.", false, 9000); }, 1200);
  }
  if (token) signIn().catch(function (e) { clearToken(); token = ""; showLogin(e.message); });
  else showLogin();

  /* ================================================================== CONTENT BOTS
     Each button saves a small request file (data/scrape-request.json or data/blog-request.json). Saving it starts
     the matching GitHub job (.github/workflows/news-scraper.yml or blog-writer.yml), which gathers the content,
     finds feature images, rebuilds the pages and commits. This page then watches data/news.json or data/blog.json
     until the job has written its result. The editor key needs no extra permissions for this. */
  var BOTS = {
    news: { data: "data/news.json", request: "data/scrape-request.json", name: "Tenshi Scraper", label: "Run Tenshi Scraper" },
    blog: { data: "data/blog.json", request: "data/blog-request.json", name: "Tenshi Blog Writer", label: "Run Tenshi Blog Writer" }
  };
  var botWatch = {};
  function readLive(path) {
    return gh(R + "/contents/" + path + "?ref=" + BRANCH).then(function (f) {
      if (f.content) return JSON.parse(b64ToText(f.content.replace(/\s/g, "")));
      return gh(R + "/git/blobs/" + f.sha).then(function (b) { return JSON.parse(b64ToText(b.content.replace(/\s/g, ""))); });
    }).catch(function (e) { if (e.status === 404) return null; throw e; });
  }
  function readLiveText(path) {
    return gh(R + "/contents/" + path + "?ref=" + BRANCH).then(function (f) {
      if (f.content) return b64ToText(f.content.replace(/\s/g, ""));
      return gh(R + "/git/blobs/" + f.sha).then(function (b) { return b64ToText(b.content.replace(/\s/g, "")); });
    }).catch(function (e) { if (e.status === 404) return null; throw e; });
  }
  /* For the other editor scripts (admin/games.js, the Game Studio): save, read the live files, messages. */
  window.TenshiEditor = { commit: commit, readJSON: readLive, readText: readLiveText, toast: toast, busy: busy, esc: esc, site: SITE, signedIn: function () { return !!token; } };
  function when(iso) {
    if (!iso) return "never";
    var d = new Date(iso);
    return isNaN(d) ? "never" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  function stat(label, value) { return "<div><dt>" + esc(label) + "</dt><dd>" + value + "</dd></div>"; }
  function renderBot(kind, d) {
    if (kind === "news") {
      var cats = (d && d.categories) || [], total = 0, photos = 0;
      cats.forEach(function (c) { c.items.forEach(function (s) { total++; if (s.image && !s.image.generated && s.image.src) photos++; }); });
      $("#bot-news-stats").innerHTML = stat("Last updated", esc(when(d && d.generatedAt))) +
        stat("Stories", total + " in " + cats.length + " categories") +
        stat("Feature images", photos + " free photos, " + (total - photos) + " Tenshi covers") +
        (d && d.lastRun ? stat("Last run", (d.lastRun.ok ? "✓ " : "⚠ ") + esc(d.lastRun.message)) : "");
      $("#bot-news-list").innerHTML = cats.map(function (c) {
        var s = c.items[0];
        return s ? "<li><b>" + esc(c.id.charAt(0).toUpperCase() + c.id.slice(1)) + ":</b> " + esc(s.title) + ' <span class="ed-src">— ' + esc(s.source) + "</span></li>" : "";
      }).join("");
    } else {
      var posts = (d && d.posts) || [], real = posts.filter(function (p) { return !p.placeholder; });
      $("#bot-blog-stats").innerHTML = stat("Last run", d && d.lastRun ? (d.lastRun.ok ? "✓ " : "⚠ ") + esc(when(d.lastRun.at)) + ": " + esc(d.lastRun.message) : "never") +
        stat("Posts", real.length + " written by the bot" + (posts.length > real.length ? ", " + (posts.length - real.length) + " placeholders" : ""));
      $("#bot-blog-list").innerHTML = posts.slice(0, 6).map(function (p) {
        return "<li>" + esc(p.title) + ' <span class="ed-src">— ' + (p.placeholder ? "placeholder" : esc(when(p.date)) + ", " + (p.sources || []).length + " sources") + "</span></li>";
      }).join("");
    }
  }
  function loadBots() {
    ["news", "blog"].forEach(function (kind) {
      if (botWatch[kind]) return;
      readLive(BOTS[kind].data).then(function (d) { renderBot(kind, d); })
        .catch(function (e) { $("#bot-" + kind + "-msg").textContent = e.message; });
    });
  }
  function runBot(kind) {
    var bot = BOTS[kind], btn = $("#bot-" + kind + "-run"), msg = $("#bot-" + kind + "-msg");
    var asked = new Date().toISOString();
    var req = { requestedAt: asked, by: ($(".ed-user").textContent || "").trim() || "Tenshi Editor" };
    if (kind === "blog") req.posts = parseInt($("#bot-blog-count").value, 10) || 3;
    busy(btn, true, "Starting…");
    msg.className = "ed-msg";
    var reset = function () { btn.classList.remove("busy"); btn.textContent = bot.label; };
    commit([{ path: bot.request, text: JSON.stringify(req, null, 2) + "\n" }], bot.name + ": run requested").then(function () {
      msg.textContent = bot.name + " is running on GitHub. It usually takes 1 to 4 minutes; you can keep editing meanwhile.";
      btn.textContent = "Running…";
      var started = Date.now();
      botWatch[kind] = setInterval(function () {
        readLive(bot.data).then(function (d) {
          var done = d && ((d.lastRun && d.lastRun.at > asked) || (kind === "news" && d.generatedAt > asked));
          if (done) {
            clearInterval(botWatch[kind]); botWatch[kind] = null;
            renderBot(kind, d); reset();
            var ok = !d.lastRun || d.lastRun.ok;
            msg.className = "ed-msg " + (ok ? "ok" : "err");
            msg.textContent = (d.lastRun ? d.lastRun.message + " " : "") + (ok ? "The live site shows it about a minute from now." : "");
            toast(bot.name + (ok ? " finished." : " finished with a note."), !ok);
          } else if (Date.now() - started > 12 * 60 * 1000) {
            clearInterval(botWatch[kind]); botWatch[kind] = null; reset();
            msg.className = "ed-msg err";
            msg.textContent = "No result after 12 minutes. Open “See runs on GitHub” to check what happened.";
          }
        }).catch(function () { /* try again on the next tick */ });
      }, 15000);
    }).catch(function (e) {
      reset();
      msg.className = "ed-msg err"; msg.textContent = e.message;
    });
  }
  $("#bot-news-run").addEventListener("click", function () { runBot("news"); });
  $("#bot-blog-run").addEventListener("click", function () { runBot("blog"); });

  /* ================================================================== DESIGN (fonts, typography, colors, motion)
     Every control maps to one setting in admin/theme.js. Changes show at once in the preview; Save writes
     site-theme.css (the settings ride along in its first line), and the site updates about a minute later. */
  var TH = window.TenshiTheme, dz = { fonts: null, saved: null, cur: null, ready: false };
  var DZ_UNITS = { rootSize: "px", heroSize: "px", pageTitleSize: "px", sectionSize: "px", featureSize: "px", cardSize: "px",
    bodySpacing: "em", motionDistance: "px", motionDistanceMobile: "px", charDelay: "ms", motionSpeed: "×", colorDuration: "s", headingOpacity: "%", sectionSpace: "px", flowSpace: "em", headingSpace: "em", cardPad: "px", gridGap: "px", gutter: "px", introHold: "s", introFade: "s", heroStep: "ms", heroDuration: "s" };
  function dzFontOptions() {
    var groups = { sans: "Sans serif", serif: "Serif", display: "Display", script: "Script", mono: "Monospace" };
    return Object.keys(groups).map(function (g) {
      return '<optgroup label="' + groups[g] + '">' + dz.fonts.filter(function (f) { return f.cat === g; }).map(function (f) {
        return '<option value="' + esc(f.slug) + '">' + esc(f.name) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }
  function dzFamily(slug) { for (var i = 0; i < dz.fonts.length; i++) if (dz.fonts[i].slug === slug) return dz.fonts[i]; return null; }
  function dzWeights(sel) {
    var f = dzFamily(dz.cur[sel.dataset.for]);
    var ws = f ? f.faces.filter(function (x) { return x.s === "normal"; }).map(function (x) { return x.w; }) : [400];
    ws = ws.filter(function (w, i) { return ws.indexOf(w) === i; }).sort();
    var names = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
    sel.innerHTML = ws.map(function (w) { return '<option value="' + w + '">' + (names[w] || w) + " (" + w + ")</option>"; }).join("");
    sel.value = String(TH.nearest(f || { faces: [] }, dz.cur[sel.dataset.k]));
  }
  function dzShow() {
    // Heading letter-spacing sliders follow the chosen unit
    var px = dz.cur.headingSpacingUnit === "px";
    ["h1Spacing", "h2Spacing", "h3Spacing", "h4Spacing"].forEach(function (k) {
      var r = $('#dz-form [data-k="' + k + '"]');
      r.min = px ? -8 : -0.12; r.max = px ? 8 : 0.15; r.step = px ? 0.1 : 0.005;
    });
    $$("#dz-form [data-k]").forEach(function (el) {
      var k = el.dataset.k, v = dz.cur[k];
      if (el.type === "checkbox") el.checked = !!v;
      else if (!el.classList.contains("dz-weight")) el.value = v;
      var out = el.parentNode.querySelector("output");
      var unit = /^h\dSpacing$/.test(k) ? dz.cur.headingSpacingUnit : (DZ_UNITS[k] || "");
      if (out) out.textContent = el.type === "color" ? String(v).toUpperCase() : (k === "motionSpeed" ? "×" + v : v + unit);
    });
    $$(".dz-weight").forEach(dzWeights);
    var hf = dzFamily(dz.cur.headingFont), bf = dzFamily(dz.cur.bodyFont);
    $("#dz-sample-h").style.cssText = "font-family:" + (hf ? '"' + hf.name + '"' : "inherit") + ";font-weight:" + dz.cur.headingWeight + ";letter-spacing:" + dz.cur.h1Spacing + dz.cur.headingSpacingUnit;
    $("#dz-sample-b").style.cssText = "font-family:" + (bf ? '"' + bf.name + '"' : "inherit") + ";font-weight:" + dz.cur.bodyWeight + ";letter-spacing:" + dz.cur.bodySpacing + "em;line-height:" + dz.cur.bodyLine;
    $$("#dz-form [data-k^=motion]:not([data-k=motion]), #dz-form [data-k=charDelay], #dz-form [data-k=colorDuration], #dz-form [data-k^=hero]").forEach(function (el) { el.disabled = !dz.cur.motion; });
    $$("#dz-form [data-k=introHold], #dz-form [data-k=introFade], #dz-form [data-k=introStyle]").forEach(function (el) { el.disabled = !dz.cur.intro; });
    $("#dz-save").disabled = JSON.stringify(dz.cur) === JSON.stringify(dz.saved);
    dzHsOutputs();
  }
  /* The preview frame picks this up: design.js in the frame reads it before measuring the motion settings */
  function dzLive() {
    var css = TH.css(dz.cur, dz.fonts);
    window.__tseLiveCss = css;
    var doc = $("#dz-frame").contentDocument;
    if (!doc || !doc.head) return;
    var st = doc.getElementById("tse-live-theme");
    if (!st) { st = doc.createElement("style"); st.id = "tse-live-theme"; doc.head.appendChild(st); }
    st.textContent = css;
  }
  function dzLoadFrame() {
    window.__tseLiveCss = TH.css(dz.cur, dz.fonts);
    $("#dz-frame").src = SITE + $("#dz-page").value + "?lang=en&motion=1&t=" + Date.now();
  }
  $("#dz-frame").addEventListener("load", dzLive);
  function loadDesign() {
    if (dz.ready) { dzShow(); return; }
    Promise.all([
      fetch(SITE + "fonts/fonts.json", { cache: "no-cache" }).then(function (r) { return r.json(); }),
      tree.has("site-theme.css") ? readText("site-theme.css") : Promise.resolve("")
    ]).then(function (r) {
      dz.fonts = r[0]; dz.saved = TH.parse(r[1]); dz.cur = JSON.parse(JSON.stringify(dz.saved)); dz.ready = true;
      $$(".dz-font").forEach(function (s) { s.innerHTML = dzFontOptions(); });
      // The preview covers top-level pages (fonts load from the site root)
      $("#dz-page").innerHTML = pages.filter(function (p) { return p.indexOf("/") < 0; }).map(function (p) { return '<option value="' + esc(p) + '">' + esc(prettyPage(p)) + "</option>"; }).join("");
      $("#dz-hs-level").innerHTML = TH.HS_LEVELS.map(function (L) { return '<option value="' + L.key + '">' + esc(L.label) + "</option>"; }).join("");
      dzHsRender(); dzShow(); dzLoadFrame();
    }).catch(function (e) { $("#dz-msg").className = "ed-msg err"; $("#dz-msg").textContent = "Couldn't load the design settings: " + e.message; });
  }

  /* Heading styles: one level at a time (H1, H2, H3, H4–H6), built from TH.HS_FIELDS. Values live in dz.cur.headingStyles. */
  function dzHsLevel() { return $("#dz-hs-level").value || "h1"; }
  function dzHsStyle() { return (dz.cur.headingStyles || {})[dzHsLevel()] || {}; }
  function dzHsFmt(f, v) { return (Math.round(v * 1000) / 1000) + (f.unit ? " " + f.unit : ""); }
  function dzHsRender() {
    var s = dzHsStyle();
    $("#dz-hs-fields").innerHTML = TH.HS_FIELDS.map(function (f) {
      var v = s[f.key], set = v !== undefined && v !== "", id = "dzhs-" + f.key,
        reset = '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small sl-reset" data-hs-reset="' + f.key + '"' + (set ? "" : " hidden") + ">Reset</button>";
      if (f.type === "font") return '<label class="sl-field"><span>' + esc(f.label) + '</span><select id="' + id + '" data-hs="' + f.key + '"><option value="">Site default</option>' + dzFontOptions() + "</select>" + reset + '<small class="sl-note" id="dzhs-font-note"></small></label>';
      if (f.type === "select") return '<label class="sl-field"><span>' + esc(f.label) + '</span><select id="' + id + '" data-hs="' + f.key + '">' + f.options.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("") + "</select>" + reset + "</label>";
      if (f.type === "range") return '<label class="sl-field sl-range"><span>' + esc(f.label) + '</span><input type="range" id="' + id + '" data-hs="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + (set ? v : f.start) + '"><output data-hs-out="' + f.key + '"></output>' + reset + "</label>";
      if (f.type === "color") return '<label class="sl-field sl-color"><span>' + esc(f.label) + '</span><input type="color" id="' + id + '" data-hs="' + f.key + '" value="' + (set ? v : f.start) + '"><output data-hs-out="' + f.key + '"></output>' + reset + "</label>";
      if (f.type === "check") return '<label class="ed-check sl-field"><input type="checkbox" id="' + id + '" data-hs="' + f.key + '"' + (v === true ? " checked" : "") + "> " + esc(f.label) + "</label>";
      return "";
    }).join("");
    TH.HS_FIELDS.forEach(function (f) { if (f.type === "font" || f.type === "select") $("#dzhs-" + f.key).value = s[f.key] === undefined ? "" : String(s[f.key]); });
    dzHsOutputs();
  }
  /* Labels, Reset buttons and the font note, without rebuilding the controls (keeps focus while dragging) */
  function dzHsOutputs() {
    if (!dz.ready || !$("#dz-hs-fields").firstChild) return;
    var s = dzHsStyle();
    TH.HS_FIELDS.forEach(function (f) {
      var set = s[f.key] !== undefined && s[f.key] !== "";
      var out = $('#dz-hs-fields [data-hs-out="' + f.key + '"]'); if (out) out.textContent = set ? (f.type === "range" ? dzHsFmt(f, s[f.key]) : String(s[f.key]).toUpperCase()) : "Site default";
      var r = $('#dz-hs-fields [data-hs-reset="' + f.key + '"]'); if (r) r.hidden = !set;
    });
    var note = $("#dzhs-font-note"), fam = dzFamily(s.font || dz.cur.headingFont);
    if (note) note.textContent = fam ? fam.name + " has weights " + Array.from(new Set(fam.faces.map(function (x) { return x.w; }))).sort(function (a, b) { return a - b; }).join(", ") +
      (fam.faces.some(function (x) { return x.s === "italic"; }) ? ", with italics" : ", no italics") + ". Other weights are drawn by the browser." : "";
    // Levels with their own styles get a dot in the list
    $$("#dz-hs-level option").forEach(function (o) {
      var L = TH.HS_LEVELS.filter(function (x) { return x.key === o.value; })[0];
      o.textContent = L.label + ((dz.cur.headingStyles || {})[L.key] ? " \u25CF" : "");
    });
  }
  function dzHsSet(key, v) {
    var hs = JSON.parse(JSON.stringify(dz.cur.headingStyles || {})), lv = dzHsLevel();
    hs[lv] = hs[lv] || {};
    if (v === undefined || v === "" || v === false) delete hs[lv][key]; else hs[lv][key] = v;
    dz.cur.headingStyles = hs; dz.cur = TH.clean(dz.cur);
    dzShow(); dzLive();
  }
  $("#dz-hs-fields").addEventListener("input", function (e) {
    var el = e.target, f = TH.HS_FIELDS.filter(function (x) { return x.key === el.dataset.hs; })[0]; if (!f || !dz.ready) return;
    dzHsSet(f.key, f.type === "check" ? el.checked : f.type === "range" ? parseFloat(el.value) : el.value);
  });
  $("#dz-hs-fields").addEventListener("click", function (e) {
    var b = e.target.closest("[data-hs-reset]"); if (!b) return;
    e.preventDefault(); dzHsSet(b.dataset.hsReset, undefined); dzHsRender();
  });
  $("#dz-hs-level").addEventListener("change", function (e) { e.stopPropagation(); dzHsRender(); });
  $("#dz-hs-reset").addEventListener("click", function () {
    if (!dz.ready) return;
    var hs = JSON.parse(JSON.stringify(dz.cur.headingStyles || {})); delete hs[dzHsLevel()];
    dz.cur.headingStyles = hs; dz.cur = TH.clean(dz.cur); dzHsRender(); dzShow(); dzLive();
  });
  $("#dz-form").addEventListener("input", function (e) {
    var el = e.target, k = el.dataset && el.dataset.k;
    if (!k || !dz.ready) return;
    dz.cur[k] = el.type === "checkbox" ? el.checked : (el.type === "range" || el.classList.contains("dz-weight") ? parseFloat(el.value) : el.value);
    if (k === "headingSpacingUnit") ["h1Spacing", "h2Spacing", "h3Spacing", "h4Spacing"].forEach(function (h) {
      dz.cur[h] = el.value === "px" ? Math.round(dz.cur[h] * 16 * 10) / 10 : Math.round(dz.cur[h] / 16 * 1000) / 1000;
    });
    if (k === "headingFont" || k === "bodyFont") { var w = $('.dz-weight[data-for="' + k + '"]'); dz.cur[w.dataset.k] = TH.nearest(dzFamily(dz.cur[k]) || { faces: [] }, dz.cur[w.dataset.k]); }
    dz.cur = TH.clean(dz.cur);
    dzShow(); dzLive();
    if (/^motion|charDelay|colorDuration|^intro|^hero/.test(k)) { clearTimeout(dz.replay); dz.replay = setTimeout(dzLoadFrame, 700); }
  });
  $("#dz-page").addEventListener("change", dzLoadFrame);
  $("#dz-replay").addEventListener("click", dzLoadFrame);
  $("#dz-width").addEventListener("change", function () { $("#dz-frame").style.width = this.value; });
  $("#dz-reset").addEventListener("click", function () {
    dz.cur = TH.clean({}); dzHsRender(); dzShow(); dzLive(); dzLoadFrame();
    $("#dz-msg").className = "ed-msg"; $("#dz-msg").textContent = "Defaults loaded. Save to put them on the site.";
  });
  $("#dz-save").addEventListener("click", function () {
    var btn = this, msg = $("#dz-msg");
    busy(btn, true, "Saving…");
    commit([{ path: "site-theme.css", text: TH.css(dz.cur, dz.fonts) }], "Design: update fonts, typography, heading styles, colors and motion").then(function () {
      dz.saved = JSON.parse(JSON.stringify(dz.cur));
      busy(btn, false); dzShow();
      msg.className = "ed-msg ok"; msg.textContent = "Saved. The live site shows the new design in about a minute.";
      toast("Design saved.");
    }).catch(function (e) { busy(btn, false); msg.className = "ed-msg err"; msg.textContent = e.message; });
  });

  /* ================================================================== SLOGAN (the animated strip on the homepage)
     The list of lines, their order and timing live in data/slogan.json; each line's words live in translations.js
     like any other text. Everything here saves with the main Save button (new or changed English is translated). */
  var slg = { saved: null, cur: null };
  var SLG_DEFAULT = { enabled: true, lines: ["motto", "tag1", "tag2", "tag3", "tag4"], hold: 7, japaneseFirst: true, japaneseHold: 1.9, wordPace: 90 };
  function sloganDirty() { return !!(slg.cur && slg.saved && JSON.stringify(slg.cur) !== JSON.stringify(slg.saved)); }
  function sloganJSON() { return JSON.stringify(slg.cur, null, 2) + "\n"; }
  function loadSlogan() {
    if (slg.cur) { renderSlogan(); return; }
    (tree.has("data/slogan.json") ? readText("data/slogan.json").then(JSON.parse) : Promise.resolve(SLG_DEFAULT)).catch(function () { return SLG_DEFAULT; }).then(function (d) {
      slg.saved = Object.assign({}, SLG_DEFAULT, d); slg.saved.lines = (slg.saved.lines || []).slice();
      slg.cur = JSON.parse(JSON.stringify(slg.saved));
      renderSlogan();
    });
  }
  function renderSlogan() {
    var c = slg.cur;
    $("#sl-enabled").checked = c.enabled !== false;
    $("#sl-ja").checked = c.japaneseFirst !== false;
    [["#sl-hold", "hold", "s"], ["#sl-jahold", "japaneseHold", "s"], ["#sl-pace", "wordPace", "ms"]].forEach(function (x) {
      $(x[0]).value = c[x[1]]; $(x[0]).parentNode.querySelector("output").textContent = c[x[1]] + " " + x[2];
    });
    $("#sl-jahold").disabled = !$("#sl-ja").checked;
    $("#sl-lines").innerHTML = c.lines.map(function (k, i) {
      return '<li class="sl-line" data-key="' + esc(k) + '">' +
        '<span class="sl-num">' + (i === 0 ? "Motto" : "Line " + (i + 1)) + "</span>" +
        '<input type="text" class="sl-text" value="' + esc(cur("en", k)) + '" aria-label="' + (i === 0 ? "Motto" : "Line " + (i + 1)) + ' (English)">' +
        '<span class="sl-ja" lang="ja" title="Japanese">' + esc(cur("ja", k) || "") + "</span>" +
        '<div class="sl-tools">' +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-act="langs">All languages</button>' +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-act="up" aria-label="Move up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-act="down" aria-label="Move down"' + (i === c.lines.length - 1 ? " disabled" : "") + ">↓</button>" +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-act="remove"' + (c.lines.length < 2 ? " disabled" : "") + ">Remove</button>" +
        "</div></li>";
    }).join("");
    updateBar();
  }
  $("#sl-lines").addEventListener("input", function (e) {
    var li = e.target.closest(".sl-line"); if (!li || !e.target.classList.contains("sl-text")) return;
    setPend("en", li.dataset.key, e.target.value);
  });
  $("#sl-lines").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var k = b.closest(".sl-line").dataset.key, L = slg.cur.lines, i = L.indexOf(k);
    if (b.dataset.act === "langs") { openText([k]); return; }
    if (b.dataset.act === "up" && i > 0) { L.splice(i - 1, 0, L.splice(i, 1)[0]); }
    if (b.dataset.act === "down" && i < L.length - 1) { L.splice(i + 1, 0, L.splice(i, 1)[0]); }
    if (b.dataset.act === "remove" && L.length > 1) { L.splice(i, 1); }
    renderSlogan();
  });
  $("#sl-add").addEventListener("click", function () {
    var n = 1; while ((T.en && T.en["slogan" + n] !== undefined) || (pend.en && pend.en["slogan" + n] !== undefined) || slg.cur.lines.indexOf("slogan" + n) >= 0) n++;
    var key = "slogan" + n, text = "A new line for the slogan";
    // A new text in every language; on Save the English is translated into the others (or copied where it can't be)
    LANGS.forEach(function (l) { setPend(l, key, text); });
    autoTr[key] = true;
    slg.cur.lines.push(key);
    renderSlogan();
    var last = $$("#sl-lines .sl-text").pop(); if (last) { last.focus(); last.select(); }
  });
  $("#sl-settings").addEventListener("input", function (e) {
    var c = slg.cur, el = e.target;
    if (el.id === "sl-enabled") c.enabled = el.checked;
    if (el.id === "sl-ja") c.japaneseFirst = el.checked;
    if (el.id === "sl-hold") c.hold = parseFloat(el.value);
    if (el.id === "sl-jahold") c.japaneseHold = parseFloat(el.value);
    if (el.id === "sl-pace") c.wordPace = parseFloat(el.value);
    renderSlogan();
  });

  /* ================================================================== SLOGAN › LOOK
     Font, weight, size, spacing, case, color, outline, shadow, alignment, background and space of the slogan.
     Kept in data/slogan.json "style"; admin/slogan-style.js turns it into CSS for the live preview here and, on the
     site, into slogan.css (written by tools/build-pages.mjs after Save). An empty setting keeps the site's normal look. */
  var SS = window.TenshiSloganStyle, slFonts = null, slFontsLoading = null;
  function slStyle() { return (slg.cur && slg.cur.style) || {}; }
  function slSetStyle(key, value) {
    var s = Object.assign({}, slStyle());
    if (value === undefined || value === null || value === "" || value === false) delete s[key]; else s[key] = value;
    if (Object.keys(s).length) slg.cur.style = s; else delete slg.cur.style;
    updateBar(); slPreviewStyle(); slLookOutputs();
  }
  function slLoadFonts() {
    if (slFonts) return Promise.resolve(slFonts);
    if (!slFontsLoading) slFontsLoading = fetch(SITE + "fonts/fonts.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; }).then(function (f) { slFonts = Array.isArray(f) ? f : []; return slFonts; });
    return slFontsLoading;
  }
  var CATS = { sans: "Sans serif", serif: "Serif", display: "Display", mono: "Monospace", hand: "Handwriting", jp: "Japanese" };
  function slFontOptions(cur) {
    var groups = {};
    (slFonts || []).forEach(function (f) { (groups[f.cat] = groups[f.cat] || []).push(f); });
    return '<option value="">Site default</option>' + Object.keys(groups).map(function (c) {
      return '<optgroup label="' + esc(CATS[c] || c) + '">' + groups[c].map(function (f) {
        return '<option value="' + esc(f.slug) + '"' + (f.slug === cur ? " selected" : "") + ">" + esc(f.name) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }
  function slFmt(f, v) { return (Math.round(v * 1000) / 1000) + (f.unit ? " " + f.unit : ""); }
  function renderLook() {
    var s = slStyle();
    $("#sl-look").innerHTML = SS.FIELDS.map(function (f) {
      var v = s[f.key], set = v !== undefined && v !== "", id = "slk-" + f.key, reset = '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small sl-reset" data-reset="' + f.key + '"' + (set ? "" : " hidden") + ">Reset</button>";
      if (f.type === "font") return '<label class="sl-field"><span>' + esc(f.label) + '</span><select id="' + id + '" data-key="' + f.key + '">' + slFontOptions(v) + "</select>" + reset + '<small class="sl-note" id="slk-font-note"></small></label>';
      if (f.type === "select") return '<label class="sl-field"><span>' + esc(f.label) + '</span><select id="' + id + '" data-key="' + f.key + '">' + f.options.map(function (o) { return '<option value="' + o[0] + '"' + (String(v === undefined ? "" : v) === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" + reset + "</label>";
      if (f.type === "range") { var mid = set ? v : (f.key === "lineHeight" ? 1.1 : f.key === "space" ? 96 : f.key === "sizeMax" ? 48 : f.key === "sizeMin" ? 26 : 0);
        return '<label class="sl-field sl-range"><span>' + esc(f.label) + '</span><input type="range" id="' + id + '" data-key="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + mid + '"><output data-out="' + f.key + '">' + (set ? slFmt(f, v) : "Site default") + "</output>" + reset + "</label>"; }
      if (f.type === "color") return '<label class="sl-field sl-color"><span>' + esc(f.label) + '</span><input type="color" id="' + id + '" data-key="' + f.key + '" value="' + (set ? v : (f.key === "background" ? "#ffffff" : "#16191e")) + '"><output data-out="' + f.key + '">' + (set ? esc(v) : "Site default") + "</output>" + reset + "</label>";
      if (f.type === "check") return '<label class="ed-check sl-field"><input type="checkbox" id="' + id + '" data-key="' + f.key + '"' + (v === true ? " checked" : "") + "> " + esc(f.label) + "</label>";
      return "";
    }).join("");
    slLookOutputs(); slPreviewStyle();
  }
  /* Refresh the value labels, Reset buttons and the font's weight note without rebuilding the form (keeps focus while dragging). */
  function slLookOutputs() {
    var s = slStyle();
    SS.FIELDS.forEach(function (f) {
      var set = s[f.key] !== undefined && s[f.key] !== "";
      var out = $('#sl-look [data-out="' + f.key + '"]'); if (out) out.textContent = set ? (f.type === "range" ? slFmt(f, s[f.key]) : s[f.key]) : "Site default";
      var r = $('#sl-look [data-reset="' + f.key + '"]'); if (r) r.hidden = !set;
    });
    var note = $("#slk-font-note"), fam = s.font && (slFonts || []).filter(function (x) { return x.slug === s.font; })[0];
    if (note) note.textContent = fam ? "This font has weights " + Array.from(new Set(fam.faces.map(function (x) { return x.w; }))).sort(function (a, b) { return a - b; }).join(", ") + (fam.faces.some(function (x) { return x.s === "italic"; }) ? ", with italics" : ", no italics") + ". Other weights are drawn by the browser." : "";
  }
  $("#sl-look").addEventListener("input", function (e) {
    var el = e.target, f = SS.FIELDS.filter(function (x) { return x.key === el.dataset.key; })[0]; if (!f) return;
    if (f.type === "check") slSetStyle(f.key, el.checked);
    else if (f.type === "range") slSetStyle(f.key, parseFloat(el.value));
    else slSetStyle(f.key, el.value);
  });
  $("#sl-look").addEventListener("click", function (e) {
    var b = e.target.closest("[data-reset]"); if (!b) return;
    e.preventDefault(); slSetStyle(b.dataset.reset, undefined); renderLook();
  });
  $("#sl-look-reset").addEventListener("click", function () { if (slg.cur) { delete slg.cur.style; updateBar(); renderLook(); } });

  /* Live preview: the real homepage slogan in a frame, with the unsaved look applied on top. */
  function slPreviewLoad() {
    var fr = $("#sl-preview-frame"); if (!fr) return;
    fr.style.width = $("#sl-preview-phone").checked ? "375px" : "100%";
    fr.src = SITE + "index.html?lang=" + $("#sl-preview-lang").value + "&slogan-preview=1";
  }
  function slPreviewStyle() {
    var fr = $("#sl-preview-frame"), doc; try { doc = fr && fr.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head || !slFonts) return;
    var tag = doc.getElementById("sl-look-preview");
    if (!tag) { tag = doc.createElement("style"); tag.id = "sl-look-preview"; doc.head.appendChild(tag); }
    // the saved slogan.css is switched off in the preview so a reset shows the site default again
    $$('link[href*="slogan.css"]', doc).forEach(function (l) { l.disabled = true; });
    tag.textContent = SS.css(slStyle(), slFonts, { prefix: SITE });
    slPreviewFit();
  }
  function slPreviewFit() {
    var fr = $("#sl-preview-frame"), doc; try { doc = fr.contentDocument; } catch (e) { return; }
    var band = doc && doc.querySelector("section.band"); if (!band) return;
    fr.style.height = Math.min(520, Math.max(120, Math.ceil(band.getBoundingClientRect().height) + 2)) + "px";
    fr.contentWindow.scrollTo(0, band.getBoundingClientRect().top + fr.contentWindow.scrollY);
  }
  $("#sl-preview-frame").addEventListener("load", function () {
    var doc; try { doc = this.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head) return;
    var st = doc.createElement("style");
    // show only the slogan strip: no header, ticker, intro screen, chat or scrolling
    st.textContent = "html,body{overflow:hidden!important}.site-header,.ticker,.stock-ticker,[class*=ticker],.chat-launcher,.chat-panel,[class^=tk-],.lang-dialog,.bw-intro,[class*=intro-screen],.skip-link{display:none!important}";
    doc.head.appendChild(st);
    slLoadFonts().then(function () { slPreviewStyle(); setTimeout(slPreviewFit, 400); setTimeout(slPreviewFit, 1500); });
  });
  $("#sl-preview-lang").addEventListener("change", slPreviewLoad);
  $("#sl-preview-phone").addEventListener("change", slPreviewLoad);
  window.addEventListener("resize", function () { if (!$("[data-panel=slogan]").hidden) slPreviewFit(); });

  // build the Look panel the first time the Slogan tab has its data
  var _renderSlogan = renderSlogan, slLookReady = false;
  renderSlogan = function () {
    _renderSlogan();
    if (!slLookReady && slg.cur) { slLookReady = true; slLoadFonts().then(function () { renderLook(); slPreviewLoad(); }); }
  };

  /* ================================================================== PARALLAX
     Two full-width photograph bands on the homepage, between Design, Development and Optimization.
     Settings live in data/parallax.json; heading, caption and alt text live in translations.js.
     Uploads go to img/parallax/<id>.ext so shared site photos are not overwritten.
     Everything here saves with the main Save button (new or changed English is translated). */
  var px = { saved: null, cur: null };
  var pxUploadIndex = -1;
  var phUploadKey = null;   // interior page header being given a new picture: "" = defaults, else a page key
  var ppUploadKey = null;   // content panel picture being given a new picture: "feature1" … "feature3"
  var PX_DEFAULT = { bands: [
    { id: "px1", enabled: true, image: "img/photos/kobe.jpg", altKey: "px1Alt", titleKey: "px1Title", textKey: "px1Text", speed: 0.35, height: 70, overlayMode: "solid", overlay: "#1a080c", overlayOpacity: 0.45,
      gradient: { type: "linear", angle: 180, from: "#1a080c", fromOpacity: 0.75, to: "#1a080c", toOpacity: 0.1, stop: 50 }, position: "center center",
      letters: { enabled: true, style: "rise", stagger: 40, duration: 0.8, delay: 0.1 },
      grayFade: { enabled: true, trigger: "enter", duration: 1.8, delay: 0.25, amount: 1 },
      rain: { enabled: false, style: "streaks", density: 18, speed: 1, angle: 10, color: "#d6dde8", opacity: 0.45 } },
    { id: "px2", enabled: true, image: "img/photos/osaka.jpg", altKey: "px2Alt", titleKey: "px2Title", textKey: "px2Text", speed: 0.4, height: 70, overlayMode: "gradient", overlay: "#12050a", overlayOpacity: 0.4,
      gradient: { type: "linear", angle: 180, from: "#12050a", fromOpacity: 0.1, to: "#12050a", toOpacity: 0.85, stop: 55 }, position: "center 40%",
      letters: { enabled: true, style: "blur", stagger: 45, duration: 0.9, delay: 0.1 },
      grayFade: { enabled: false, trigger: "enter", duration: 1.8, delay: 0.25, amount: 1 },
      rain: { enabled: true, style: "streaks", density: 14, speed: 1, angle: 10, color: "#d6dde8", opacity: 0.4 } },
    { id: "px3", enabled: true, image: "img/photos/tokyo.jpg", altKey: "px3Alt", titleKey: "px3Title", textKey: "px3Text", speed: 0.35, height: 60, overlayMode: "gradient", overlay: "#12050a", overlayOpacity: 0.45,
      gradient: { type: "linear", angle: 180, from: "#12050a", fromOpacity: 0.35, to: "#12050a", toOpacity: 0.8, stop: 55 }, position: "center center",
      letters: { enabled: true, style: "rise", stagger: 40, duration: 0.8, delay: 0.1 },
      grayFade: { enabled: false, trigger: "enter", duration: 1.8, delay: 0.25, amount: 1 },
      rain: { enabled: false, style: "streaks", density: 18, speed: 1, angle: 10, color: "#d6dde8", opacity: 0.45 },
      fireflies: { enabled: true, count: 28, color: "#f5e663", size: 4, sizeVar: 0.5, glow: 16, speed: 1, pulse: 2.5, opacity: 0.85, area: "all" } }
  ] };
  // Effects a band gets when its saved settings don't mention them (same as tools/build-pages.mjs): heading letters and
  // gray-to-color on, rain, fireflies and snow off.
  var PX_SNOW = { enabled: false, style: "flakes", density: 60, size: 3, sizeVar: 0.6, speed: 1, drift: 0.3, color: "#ffffff", opacity: 0.8 };
  var PX_FX = {
    letters: { enabled: true, style: "rise", stagger: 40, duration: 0.8, delay: 0.1 },
    grayFade: { enabled: true, trigger: "enter", duration: 1.8, delay: 0.25, amount: 1 },
    rain: { enabled: false, style: "streaks", density: 18, speed: 1, angle: 10, color: "#d6dde8", opacity: 0.45 },
    fireflies: { enabled: false, count: 30, color: "#f5e663", size: 4, sizeVar: 0.5, glow: 16, speed: 1, pulse: 2.5, opacity: 0.85, area: "all" },
    snow: PX_SNOW
  };
  // [group, key, label, min, max, step, unit]
  var PX_FX_RANGES = {
    letters: [["stagger", "Delay between letters", 5, 250, 5, " ms"], ["duration", "Each letter's animation", 0.1, 4, 0.05, " s"], ["delay", "Start delay", 0, 5, 0.05, " s"]],
    grayFade: [["amount", "Starting gray amount", 0, 1, 0.05, ""], ["duration", "Fade length", 0.1, 8, 0.1, " s"], ["delay", "Start delay", 0, 5, 0.05, " s"]],
    rain: [["density", "Amount of rain", 1, 60, 1, ""], ["speed", "Speed", 0.2, 3, 0.05, "×"], ["angle", "Angle / wind", -45, 45, 1, "°"], ["opacity", "Opacity", 0.05, 1, 0.05, ""]],
    fireflies: [["count", "How many", 1, 120, 1, ""], ["size", "Dot size", 1, 12, 0.5, " px"], ["sizeVar", "Size variety (0 = all the same)", 0, 1, 0.05, ""],
      ["glow", "Glow size", 0, 40, 1, " px"], ["speed", "Drift speed", 0.1, 4, 0.05, "×"], ["pulse", "Glow pulse length", 0.3, 10, 0.1, " s"], ["opacity", "Opacity", 0.05, 1, 0.05, ""]],
    snow: [["density", "Amount of snow", 1, 300, 1, ""], ["size", "Flake size", 1, 12, 0.5, " px"], ["sizeVar", "Size variety (0 = all the same)", 0, 1, 0.05, ""],
      ["speed", "Fall speed", 0.1, 4, 0.05, "×"], ["drift", "Wind (− left, + right)", -2, 2, 0.05, ""], ["opacity", "Opacity", 0.05, 1, 0.05, ""]]
  };
  var PX_FX_CHOICES = {
    letters: ["style", "Style", [["rise", "Rise and tilt (site default)"], ["fade", "Fade"], ["blur", "Blur in"], ["flip", "Flip up"]]],
    grayFade: ["trigger", "When", [["enter", "Once, when the band comes into view"], ["scroll", "In step with scrolling"]]],
    rain: ["style", "Look", [["streaks", "Rain streaks"], ["glyphs", "Falling characters"]]],
    fireflies: ["area", "Where", [["all", "The whole band"], ["lower", "Lower half only"]]],
    snow: ["style", "Look", [["flakes", "Soft flakes"], ["dots", "Crisp dots"]]]
  };
  var PX_FX_COLORS = { rain: ["Drop colour", "#d6dde8"], fireflies: ["Glow colour", "#f5e663"], snow: ["Snow colour", "#ffffff"] };
  // Overlay a band gets when its settings don't mention one: the solid colour + opacity it launched with.
  var PX_GRAD = { type: "linear", angle: 180, from: "#1a080c", fromOpacity: 0.75, to: "#1a080c", toOpacity: 0.1, stop: 50 };
  function pxNormalize(b, i) {
    var out = Object.assign({}, PX_DEFAULT.bands[i] || PX_DEFAULT.bands[0], b);
    out.overlayMode = b && b.overlayMode === "gradient" ? "gradient" : "solid";
    out.gradient = Object.assign({}, PX_GRAD, (b && b.gradient) || {});
    Object.keys(PX_FX).forEach(function (g) { out[g] = Object.assign({}, PX_FX[g], (b && b[g]) || {}); });
    return out;
  }
  var PX_POS = [
    ["center center", "Centre"],
    ["center top", "Top"],
    ["center 30%", "Upper third"],
    ["center 40%", "Slightly above centre"],
    ["center 60%", "Slightly below centre"],
    ["center bottom", "Bottom"],
    ["left center", "Left"],
    ["right center", "Right"]
  ];
  function parallaxDirty() { return !!(px.cur && px.saved && JSON.stringify(px.cur) !== JSON.stringify(px.saved)); }
  function parallaxJSON() { return JSON.stringify(px.cur, null, 2) + "\n"; }
  function loadParallax() {
    if (px.cur) { renderParallax(); return; }
    (tree.has("data/parallax.json") ? readText("data/parallax.json").then(JSON.parse) : Promise.resolve(PX_DEFAULT)).catch(function () { return PX_DEFAULT; }).then(function (d) {
      var src = (d && Array.isArray(d.bands) && d.bands.length) ? d.bands : PX_DEFAULT.bands;
      src = src.concat(PX_DEFAULT.bands.slice(src.length));   // a file from before the third band gets its default
      px.saved = { bands: src.map(pxNormalize), panels: ppNormalize(d && d.panels), pageHeader: phNormalize(d && d.pageHeader) };
      px.cur = JSON.parse(JSON.stringify(px.saved));
      renderParallax();
    });
  }
  function pxImgSrc(path) {
    var ed = imgEdits.get(path);
    if (ed && ed.url) return ed.url;
    for (var it = imgEdits.values(), n = it.next(); !n.done; n = it.next()) {
      if (n.value.newPath === path && n.value.url) return n.value.url;
    }
    var rec = tree.get(path);
    return SITE + path + (rec && rec.sha ? "?b=" + rec.sha.slice(0, 8) : "");
  }
  function pxPathOptions(cur) {
    var paths = imagePaths().slice();
    if (cur && paths.indexOf(cur) < 0) paths.unshift(cur);
    var groups = {}, order = [];
    paths.forEach(function (p) {
      var f = p.indexOf("/") < 0 ? "(main folder)" : p.slice(0, p.lastIndexOf("/"));
      if (!groups[f]) { groups[f] = []; order.push(f); }
      groups[f].push(p);
    });
    return order.map(function (f) {
      return '<optgroup label="' + esc(f) + '">' + groups[f].map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === cur ? " selected" : "") + ">" + esc(p.replace(/^.*\//, "")) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }
  function renderParallax() {
    if (!px.cur) return;
    var labels = ["Between Design and Development", "Between Development and Optimization", "Between Optimization and Contact"];
    $("#px-bands").innerHTML = px.cur.bands.map(function (b, i) {
      var posOpts = PX_POS.map(function (o) { return '<option value="' + o[0] + '"' + (b.position === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
      if (b.position && !PX_POS.some(function (o) { return o[0] === b.position; })) {
        posOpts += '<option value="' + esc(b.position) + '" selected>' + esc(b.position) + "</option>";
      }
      return '<article class="px-card" data-px="' + i + '">' +
        "<h2>" + (labels[i] || ("Band " + (i + 1))) + "</h2>" +
        '<label class="ed-check"><input type="checkbox" data-px-k="enabled"' + (b.enabled !== false ? " checked" : "") + "> Show this band on the homepage</label>" +
        '<div class="px-preview">' +
          '<img class="px-thumb" alt="" src="' + esc(pxImgSrc(b.image)) + '">' +
          '<div class="px-actions">' +
            '<label class="ed-inline ed-grow"><span>Picture</span> <select data-px-k="image">' + pxPathOptions(b.image) + "</select></label>" +
            '<button type="button" class="ed-btn" data-px-act="upload">Upload a new picture</button>' +
          "</div>" +
        "</div>" +
        '<div class="px-fields">' +
          '<label class="ed-field"><span>Heading (English, optional)</span><input type="text" data-px-text="titleKey" value="' + esc(cur("en", b.titleKey)) + '">' +
            (b.titleKey ? '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-px-act="langs" data-px-key="' + esc(b.titleKey) + '">All languages</button>' : "") + "</label>" +
          '<label class="ed-field"><span>Caption (English, optional)</span><input type="text" data-px-text="textKey" value="' + esc(cur("en", b.textKey)) + '">' +
            (b.textKey ? '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-px-act="langs" data-px-key="' + esc(b.textKey) + '">All languages</button>' : "") + "</label>" +
          '<label class="ed-field"><span>Alternative text (English, for screen readers)</span><input type="text" data-px-text="altKey" value="' + esc(cur("en", b.altKey)) + '">' +
            (b.altKey ? '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-px-act="langs" data-px-key="' + esc(b.altKey) + '">All languages</button>' : "") + "</label>" +
          '<label class="dz-range"><span>Parallax speed</span><input type="range" data-px-k="speed" min="-1" max="1" step="0.05" value="' + b.speed + '"><output>' + b.speed + "</output></label>" +
          '<label class="dz-range"><span>Height</span><input type="range" data-px-k="height" min="30" max="100" step="1" value="' + b.height + '"><output>' + b.height + " vh</output></label>" +
          pxOverlayHTML(b) +
          '<label class="ed-field"><span>Picture position</span><select data-px-k="position">' + posOpts + "</select></label>" +
        "</div>" + pxEffectsHTML(b) + "</article>";
    }).join("");
    renderPanels();
    renderPageHeaders();
    updateBar();
  }
  // allowNone: content panel pictures can have no overlay at all (their default)
  function pxOverlayHTML(b, allowNone) {
    var g = Object.assign({}, PX_GRAD, b.gradient || {}), grad = b.overlayMode === "gradient", none = allowNone && b.overlayMode === "none";
    var rng = function (k, label, min, max, step, unit) {
      return '<label class="dz-range"><span>' + label + '</span><input type="range" data-px-g="' + k + '" data-unit="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + g[k] + '"><output>' + g[k] + unit + "</output></label>";
    };
    var col = function (k, label) {
      return '<label class="sl-field sl-color"><span>' + label + '</span><input type="color" data-px-g="' + k + '" value="' + esc(g[k]) + '"><output>' + esc(g[k]) + "</output></label>";
    };
    return '<fieldset class="px-fx px-ov"><legend>Overlay</legend>' +
      '<label class="ed-field"><span>Overlay style</span><select data-px-k="overlayMode">' +
        (allowNone ? '<option value="none"' + (none ? " selected" : "") + ">None (the plain picture)</option>" : "") +
        '<option value="solid"' + (grad || none ? "" : " selected") + '>Solid colour</option><option value="gradient"' + (grad ? " selected" : "") + ">Gradient</option></select></label>" +
      '<div class="px-ov-solid"' + (grad || none ? " hidden" : "") + '>' +
        '<label class="sl-field sl-color"><span>Overlay colour</span><input type="color" data-px-k="overlay" value="' + esc(b.overlay || "#1a080c") + '"><output>' + esc(b.overlay || "#1a080c") + "</output></label>" +
        '<label class="dz-range"><span>Overlay opacity</span><input type="range" data-px-k="overlayOpacity" min="0" max="1" step="0.05" value="' + b.overlayOpacity + '"><output>' + b.overlayOpacity + "</output></label>" +
      "</div>" +
      '<div class="px-ov-grad"' + (grad ? "" : " hidden") + '>' +
        '<label class="ed-field"><span>Gradient type</span><select data-px-g="type"><option value="linear"' + (g.type === "radial" ? "" : " selected") + '>Linear</option><option value="radial"' + (g.type === "radial" ? " selected" : "") + ">Radial (from the centre out)</option></select></label>" +
        rng("angle", "Angle (linear; 180° = top to bottom)", 0, 360, 5, "°") +
        col("from", "Start colour") + rng("fromOpacity", "Start opacity", 0, 1, 0.05, "") +
        col("to", "End colour") + rng("toOpacity", "End opacity", 0, 1, 0.05, "") +
        rng("stop", "Midpoint", 1, 99, 1, "%") +
        '<div class="px-ov-swatch" style="background:' + esc(pxGradCss(g)) + '"></div>' +
      "</div></fieldset>";
  }
  function pxGradRgba(hex, a) {
    var h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex || "") ? hex.slice(1) : "1a080c";
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function pxGradCss(g) {
    var a = pxGradRgba(g.from, g.fromOpacity) + " 0%," + g.stop + "%," + pxGradRgba(g.to, g.toOpacity) + " 100%";
    return (g.type === "radial" ? "radial-gradient(ellipse at center," : "linear-gradient(" + g.angle + "deg,") + a + "), #888";
  }
  var PX_FX_TITLES = { letters: "Heading letter by letter", grayFade: "Photo fades from gray to color", rain: "Rain", fireflies: "Fireflies", snow: "Snow" };
  var PX_FX_NOTES = {
    letters: "The heading appears one letter at a time as the band scrolls into view. Off: the heading simply shows.",
    grayFade: "The photo starts black and white and turns to full color. Off: the photo is always in color.",
    rain: "Rain falls over the photo, behind the words. It only runs while the band is on screen.",
    fireflies: "Glowing dots drift slowly over the photo and pulse, behind the words. They pause while the band is off screen.",
    snow: "Snow falls gently over the photo, behind the words, drifting with the wind setting. It only runs while the band is on screen."
  };
  // title / note: optional wording for other places (the content panel cards)
  function pxFxGroupHTML(g, v, title, note) {
    v = v || PX_FX[g];
    var ch = PX_FX_CHOICES[g], colr = PX_FX_COLORS[g];
    var opts = ch[2].map(function (o) { return '<option value="' + o[0] + '"' + (v[ch[0]] === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
    var body = '<label class="ed-field"><span>' + ch[1] + '</span><select data-px-fx="' + g + "." + ch[0] + '">' + opts + "</select></label>" +
      PX_FX_RANGES[g].map(function (r) {
        return '<label class="dz-range"><span>' + r[1] + '</span><input type="range" data-px-fx="' + g + "." + r[0] + '" data-unit="' + esc(r[5]) + '" min="' + r[2] + '" max="' + r[3] + '" step="' + r[4] + '" value="' + v[r[0]] + '"><output>' + v[r[0]] + r[5] + "</output></label>";
      }).join("") +
      (colr ? '<label class="sl-field sl-color"><span>' + colr[0] + '</span><input type="color" data-px-fx="' + g + '.color" value="' + esc(v.color || colr[1]) + '"><output>' + esc(v.color || colr[1]) + "</output></label>" : "");
    return '<div class="px-fx-group" data-px-fx-group="' + g + '"' + (v.enabled ? "" : " data-off") + ">" +
      '<label class="ed-check"><input type="checkbox" data-px-fx="' + g + '.enabled"' + (v.enabled ? " checked" : "") + "> <b>" + (title || PX_FX_TITLES[g]) + "</b></label>" +
      '<p class="px-fx-note">' + (note || PX_FX_NOTES[g]) + "</p>" +
      '<div class="px-fx-body">' + body + "</div></div>";
  }
  var PX_RM_NOTE = '<p class="px-fx-note">Visitors who ask their device for reduced motion see the finished state: plain heading, full color, no rain, fireflies or snow.</p>';
  function pxEffectsHTML(b) {
    return '<fieldset class="px-fx"><legend>Effects</legend>' + Object.keys(PX_FX).map(function (g) { return pxFxGroupHTML(g, b[g]); }).join("") + PX_RM_NOTE + "</fieldset>";
  }
  $("#px-bands").addEventListener("input", function (e) {
    var card = e.target.closest(".px-card"); if (!card || !px.cur) return;
    var b = px.cur.bands[+card.dataset.px], el = e.target;
    if (el.dataset.pxG) {
      var gkey = el.dataset.pxG;
      b.gradient = Object.assign({}, PX_GRAD, b.gradient || {});
      b.gradient[gkey] = el.type === "range" ? parseFloat(el.value) : el.value;
      var go = el.parentNode.querySelector("output"); if (go) go.textContent = b.gradient[gkey] + (el.dataset.unit || "");
      var sw = card.querySelector(".px-ov-swatch"); if (sw) sw.style.background = pxGradCss(b.gradient);
      updateBar();
      return;
    }
    if (el.dataset.pxFx) {
      var gk = el.dataset.pxFx.split("."), g = gk[0], key = gk[1];
      b[g] = Object.assign({}, PX_FX[g], b[g] || {});
      if (key === "enabled") {
        b[g].enabled = el.checked;
        var grp = el.closest(".px-fx-group"); if (grp) grp.toggleAttribute("data-off", !el.checked);
      } else if (el.type === "range") {
        b[g][key] = parseFloat(el.value);
        el.parentNode.querySelector("output").textContent = b[g][key] + (el.dataset.unit || "");
      } else {
        b[g][key] = el.value;
        var o = el.parentNode.querySelector("output"); if (o) o.textContent = el.value;
      }
      updateBar();
      return;
    }
    if (el.dataset.pxText) {
      setPend("en", b[el.dataset.pxText], el.value);
      return;
    }
    var k = el.dataset.pxK; if (!k) return;
    if (k === "enabled") b.enabled = el.checked;
    else if (k === "speed" || k === "height" || k === "overlayOpacity") {
      b[k] = parseFloat(el.value);
      el.parentNode.querySelector("output").textContent = k === "height" ? b[k] + " vh" : String(b[k]);
    } else if (k === "overlay") {
      b.overlay = el.value;
      el.parentNode.querySelector("output").textContent = el.value;
    } else if (k === "overlayMode") {
      b.overlayMode = el.value === "gradient" ? "gradient" : "solid";
      card.querySelector(".px-ov-solid").hidden = b.overlayMode === "gradient";
      card.querySelector(".px-ov-grad").hidden = b.overlayMode !== "gradient";
    } else if (k === "image" || k === "position") {
      b[k] = el.value;
      if (k === "image") renderParallax();
    }
    updateBar();
  });
  $("#px-bands").addEventListener("click", function (e) {
    var act = e.target.closest("[data-px-act]"); if (!act) return;
    if (act.dataset.pxAct === "langs") { openText([act.dataset.pxKey]); return; }
    if (act.dataset.pxAct === "upload") {
      var card = act.closest(".px-card"); if (!card) return;
      var i = +card.dataset.px, b = px.cur.bands[i];
      var dest = /^img\/parallax\//.test(b.image) ? b.image : "img/parallax/" + (b.id || ("px" + (i + 1))) + ".jpg";
      pxUploadIndex = i;
      openImage(dest);
      $("#ed-imgdlg-old").src = pxImgSrc(b.image);
      $("#ed-imgdlg-path").textContent = dest;
    }
  });


  /* ================================================================== PARALLAX › INTERIOR PAGE HEADERS
     The photo title area at the top of every interior page (data/parallax.json "pageHeader"; tools/build-pages.mjs heroPx).
     "Defaults" apply to every interior page. An override (pageHeader.pages[key]) changes only the parts ticked
     "Customise" for a group of pages (services/*, projects/*, blog/*) or one page (its path without .html); the rest
     follows the defaults. Saved with the main Save button, together with the homepage bands. */
  var PH_BASE = {
    enabled: true, image: "img/photos/osaka.jpg", speed: 0.3, height: 0, position: "center center",
    overlayMode: "gradient", overlay: "#12050a", overlayOpacity: 0.6,
    gradient: { type: "linear", angle: 180, from: "#12050a", fromOpacity: 0.55, to: "#12050a", toOpacity: 0.8, stop: 55 },
    letters: { enabled: true, style: "rise", stagger: 30, duration: 0.8, delay: 0.1 },
    grayFade: { enabled: false, trigger: "enter", duration: 1.8, delay: 0.25, amount: 1 },
    rain: { enabled: false, style: "streaks", density: 14, speed: 1, angle: 10, color: "#d6dde8", opacity: 0.35 },
    fireflies: { enabled: false, count: 30, color: "#f5e663", size: 4, sizeVar: 0.5, glow: 16, speed: 1, pulse: 2.5, opacity: 0.85, area: "all" },
    snow: PX_SNOW
  };
  // Which fields each "Customise" group covers
  var PH_GROUPS = [
    ["picture", "Picture", ["image", "position"]],
    ["motion", "Parallax speed and height", ["speed", "height"]],
    ["overlay", "Overlay", ["overlayMode", "overlay", "overlayOpacity", "gradient"]],
    ["letters", "Heading letter by letter", ["letters"]],
    ["grayFade", "Photo fades from gray to color", ["grayFade"]],
    ["rain", "Rain", ["rain"]],
    ["fireflies", "Fireflies", ["fireflies"]],
    ["snow", "Snow", ["snow"]]
  ];
  var PH_NAMED = [
    ["about", "About"], ["team", "Team"], ["services", "Services (overview)"], ["services/*", "Every service page"],
    ["technology", "Technology"], ["projects", "Projects (overview)"], ["projects/*", "Every project page"],
    ["news", "News"], ["blog", "Blog (list)"], ["blog/*", "Every blog post"], ["contact", "Contact"], ["portal", "Portal"],
    ["legal", "Legal & Privacy"]
  ];
  var phOpen = {};
  function phIsObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function phMerge(a, b) {
    var o = Object.assign({}, a);
    if (!phIsObj(b)) return o;
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (k === "pages" || v === undefined || v === null) return;
      o[k] = phIsObj(v) && phIsObj(a[k]) ? Object.assign({}, a[k], v) : v;
    });
    return o;
  }
  function phNormalize(h) {
    var src = phIsObj(h) ? h : {};
    var out = phMerge(PH_BASE, src);
    out.pages = phIsObj(src.pages) ? JSON.parse(JSON.stringify(src.pages)) : {};
    return out;
  }
  // The object a card edits: the defaults ("") or one override
  function phTarget(key) {
    var ph = px.cur.pageHeader;
    if (!key) return ph;
    ph.pages[key] = ph.pages[key] || {};
    return ph.pages[key];
  }
  // What a page actually shows: defaults → its group (services/* …) → the page itself
  function phEffective(key) {
    var ph = px.cur.pageHeader, s = phMerge(PH_BASE, ph);
    if (!key) return s;
    if (key.indexOf("/") > 0 && key.slice(-2) !== "/*") s = phMerge(s, ph.pages[key.split("/")[0] + "/*"]);
    return phMerge(s, ph.pages[key]);
  }
  function phLabel(key) {
    for (var i = 0; i < PH_NAMED.length; i++) if (PH_NAMED[i][0] === key) return PH_NAMED[i][1];
    return key.replace(/^(services|projects|blog)\//, function (m, f) { return { services: "Service: ", projects: "Project: ", blog: "Blog post: " }[f]; });
  }
  function phPageKeys() {
    var keys = PH_NAMED.map(function (x) { return x[0]; });
    Array.from(tree.keys()).sort().forEach(function (p) {
      var m = /^(services|projects|blog)\/([a-z0-9-]+)\.html$/i.exec(p);
      if (m) keys.push(m[1] + "/" + m[2]);
    });
    return keys;
  }
  function phPosOpts(cur) {
    var o = PX_POS.map(function (x) { return '<option value="' + x[0] + '"' + (cur === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("");
    if (cur && !PX_POS.some(function (x) { return x[0] === cur; })) o += '<option value="' + esc(cur) + '" selected>' + esc(cur) + "</option>";
    return o;
  }
  function phGroupHTML(g, v) {
    if (g === "picture") {
      return '<div class="px-preview"><img class="px-thumb" alt="" src="' + esc(pxImgSrc(v.image)) + '"><div class="px-actions">' +
        '<label class="ed-inline ed-grow"><span>Picture</span> <select data-px-k="image">' + pxPathOptions(v.image) + "</select></label>" +
        '<button type="button" class="ed-btn" data-ph-act="upload">Upload a new picture</button></div></div>' +
        '<label class="ed-field"><span>Picture position</span><select data-px-k="position">' + phPosOpts(v.position) + "</select></label>";
    }
    if (g === "motion") {
      return '<label class="dz-range"><span>Parallax speed</span><input type="range" data-px-k="speed" min="-1" max="1" step="0.05" value="' + v.speed + '"><output>' + v.speed + "</output></label>" +
        '<label class="dz-range"><span>Minimum height (0 = fit the text)</span><input type="range" data-px-k="height" min="0" max="100" step="1" value="' + v.height + '"><output>' + (v.height ? v.height + " vh" : "fit") + "</output></label>";
    }
    if (g === "overlay") return pxOverlayHTML(v);
    return pxFxGroupHTML(g, v[g]);
  }
  function phCardHTML(key) {
    var isDef = !key, own = isDef ? null : (px.cur.pageHeader.pages[key] || {}), v = phEffective(key);
    var head = isDef
      ? "<h2>All interior pages (defaults)</h2>" +
        '<label class="ed-check"><input type="checkbox" data-px-k="enabled"' + (v.enabled !== false ? " checked" : "") + "> Show a photo header on interior pages</label>"
      : '<div class="ph-head"><h3>' + esc(phLabel(key)) + ' <code>' + esc(key) + "</code></h3>" +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-ph-act="remove">Remove override</button></div>' +
        '<label class="ed-field"><span>Photo header on this page</span><select data-ph-show>' +
          '<option value=""' + (own.enabled === undefined ? " selected" : "") + ">Same as the defaults</option>" +
          '<option value="on"' + (own.enabled === true ? " selected" : "") + ">Show</option>" +
          '<option value="off"' + (own.enabled === false ? " selected" : "") + ">Hide (plain light header)</option></select></label>";
    var groups = PH_GROUPS.map(function (gr) {
      var g = gr[0];
      if (isDef) {
        if (g === "picture" || g === "motion") return '<div class="px-fields">' + phGroupHTML(g, v) + "</div>";
        return g === "overlay" ? phGroupHTML(g, v) : "";
      }
      var custom = gr[2].some(function (f) { return own[f] !== undefined; });
      return '<div class="ph-group" data-ph-group="' + g + '">' +
        '<label class="ed-check"><input type="checkbox" data-ph-custom="' + g + '"' + (custom ? " checked" : "") + "> Customise: <b>" + gr[1] + "</b></label>" +
        (custom ? '<div class="ph-group-body">' + phGroupHTML(g, v) + "</div>" : "") + "</div>";
    }).join("");
    var fx = isDef ? '<fieldset class="px-fx"><legend>Effects</legend>' + ["letters", "grayFade", "rain", "fireflies", "snow"].map(function (g) { return pxFxGroupHTML(g, v[g]); }).join("") + PX_RM_NOTE + "</fieldset>" : "";
    var tag = isDef ? "article" : "details";
    return "<" + tag + ' class="px-card ph-card" data-ph="' + esc(key) + '"' + (!isDef && phOpen[key] ? " open" : "") + ">" +
      (isDef ? "" : "<summary>" + esc(phLabel(key)) + "</summary>") + head + groups + fx + "</" + tag + ">";
  }
  function renderPageHeaders() {
    var wrap = $("#ph-wrap"); if (!wrap || !px.cur) return;
    if (!px.cur.pageHeader) px.cur.pageHeader = phNormalize(null);
    var ph = px.cur.pageHeader, keys = phPageKeys();
    var have = keys.filter(function (k) { return ph.pages[k]; }).concat(Object.keys(ph.pages).filter(function (k) { return keys.indexOf(k) < 0; }));
    var free = keys.filter(function (k) { return !ph.pages[k]; });
    wrap.innerHTML = '<h2 class="ph-title">Interior page headers</h2>' +
      '<p class="ed-tip">The photo title area at the top of every page except the homepage (About, Services, each service, Projects, News, Blog and each post, Contact, Portal…). ' +
      "Breadcrumbs, the page title and its introduction sit over the photo in white. Set the look for all pages here, then add an override to give a page, or every service / project / blog post, its own picture, overlay or effects. " +
      "The page title is the heading the letter effect animates.</p>" +
      phCardHTML("") +
      '<h3 class="ph-sub">Page overrides</h3>' +
      '<div class="ph-add"><label class="ed-inline ed-grow"><span>Page</span> <select id="ph-add-key">' +
        free.map(function (k) { return '<option value="' + esc(k) + '">' + esc(phLabel(k)) + "</option>"; }).join("") +
      '</select></label> <button type="button" class="ed-btn" data-ph-act="add"' + (free.length ? "" : " disabled") + ">Add override</button></div>" +
      (have.length ? have.map(phCardHTML).join("") : '<p class="px-fx-note">No overrides: every interior page uses the defaults.</p>');
  }
  function phInput(e) {
    var card = e.target.closest(".ph-card"); if (!card || !px.cur) return;
    var key = card.dataset.ph, el = e.target, b;
    if (el.hasAttribute("data-ph-custom")) {
      var gr = PH_GROUPS.filter(function (x) { return x[0] === el.dataset.phCustom; })[0], own = phTarget(key);
      if (el.checked) {
        var eff = phEffective(key);
        gr[2].forEach(function (f) { own[f] = phIsObj(eff[f]) ? Object.assign({}, eff[f]) : eff[f]; });
      } else gr[2].forEach(function (f) { delete own[f]; });
      phOpen[key] = true;
      renderPageHeaders(); updateBar();
      return;
    }
    if (el.hasAttribute("data-ph-show")) {
      b = phTarget(key);
      if (el.value === "") delete b.enabled; else b.enabled = el.value === "on";
      updateBar();
      return;
    }
    b = phTarget(key);
    if (el.dataset.pxG) {
      var gkey = el.dataset.pxG;
      b.gradient = Object.assign({}, PX_GRAD, b.gradient || {});
      b.gradient[gkey] = el.type === "range" ? parseFloat(el.value) : el.value;
      var go = el.parentNode.querySelector("output"); if (go) go.textContent = b.gradient[gkey] + (el.dataset.unit || "");
      var sw = card.querySelector(".px-ov-swatch"); if (sw) sw.style.background = pxGradCss(b.gradient);
    } else if (el.dataset.pxFx) {
      var gk = el.dataset.pxFx.split("."), g = gk[0], k2 = gk[1];
      b[g] = Object.assign({}, PH_BASE[g], b[g] || {});
      if (k2 === "enabled") {
        b[g].enabled = el.checked;
        var grp = el.closest(".px-fx-group"); if (grp) grp.toggleAttribute("data-off", !el.checked);
      } else if (el.type === "range") {
        b[g][k2] = parseFloat(el.value);
        el.parentNode.querySelector("output").textContent = b[g][k2] + (el.dataset.unit || "");
      } else {
        b[g][k2] = el.value;
        var o = el.parentNode.querySelector("output"); if (o) o.textContent = el.value;
      }
    } else {
      var k = el.dataset.pxK; if (!k) return;
      if (k === "enabled") b.enabled = el.checked;
      else if (k === "speed" || k === "height" || k === "overlayOpacity") {
        b[k] = parseFloat(el.value);
        el.parentNode.querySelector("output").textContent = k === "height" ? (b[k] ? b[k] + " vh" : "fit") : String(b[k]);
      } else if (k === "overlay") {
        b.overlay = el.value;
        el.parentNode.querySelector("output").textContent = el.value;
      } else if (k === "overlayMode") {
        b.overlayMode = el.value === "gradient" ? "gradient" : "solid";
        card.querySelector(".px-ov-solid").hidden = b.overlayMode === "gradient";
        card.querySelector(".px-ov-grad").hidden = b.overlayMode !== "gradient";
      } else if (k === "image" || k === "position") {
        b[k] = el.value;
        if (k === "image") { var th = card.querySelector(".px-thumb"); if (th) th.src = pxImgSrc(el.value); }
      }
    }
    updateBar();
  }
  $("#ph-wrap").addEventListener("input", phInput);
  $("#ph-wrap").addEventListener("toggle", function (e) { var d = e.target; if (d.matches && d.matches("details.ph-card")) phOpen[d.dataset.ph] = d.open; }, true);
  $("#ph-wrap").addEventListener("click", function (e) {
    var act = e.target.closest("[data-ph-act]"); if (!act || !px.cur) return;
    var ph = px.cur.pageHeader, card = act.closest(".ph-card"), key = card ? card.dataset.ph : "";
    if (act.dataset.phAct === "add") {
      var k = $("#ph-add-key").value; if (!k) return;
      ph.pages[k] = ph.pages[k] || {};
      phOpen[k] = true;
      renderPageHeaders(); updateBar();
    } else if (act.dataset.phAct === "remove") {
      delete ph.pages[key];
      renderPageHeaders(); updateBar();
    } else if (act.dataset.phAct === "upload") {
      var cur0 = phEffective(key).image;
      var dest = /^img\/parallax\/header-/.test(cur0) && (key ? (ph.pages[key] || {}).image === cur0 : ph.image === cur0)
        ? cur0 : "img/parallax/header-" + (key ? key.replace(/\/\*$/, "-all").replace(/[^a-z0-9-]+/gi, "-") : "default") + ".jpg";
      phUploadKey = key;
      openImage(dest);
      $("#ed-imgdlg-old").src = pxImgSrc(cur0);
      $("#ed-imgdlg-path").textContent = dest;
    }
  });

  /* ================================================================== PARALLAX › CONTENT PANEL IMAGES
     The pictures of the Design, Development and Optimization panels (data/parallax.json "panels"; tools/build-pages.mjs
     panelPx). The rounded frame keeps its size; the picture moves gently inside it and can get an overlay, gray-to-color,
     rain, fireflies and snow, all inside the frame. "letters" animates the panel's heading. Saved with the main Save button. */
  var PP_BASE = {
    enabled: true, image: "", speed: 0.12, position: "center center", overlayMode: "none", overlay: "#12050a", overlayOpacity: 0.35,
    gradient: { type: "linear", angle: 180, from: "#12050a", fromOpacity: 0, to: "#12050a", toOpacity: 0.55, stop: 50 },
    letters: { enabled: false, style: "rise", stagger: 40, duration: 0.8, delay: 0.1 },
    grayFade: { enabled: false, trigger: "enter", duration: 1.8, delay: 0.25, amount: 1 },
    rain: { enabled: false, style: "streaks", density: 14, speed: 1, angle: 10, color: "#d6dde8", opacity: 0.4 },
    fireflies: { enabled: false, count: 14, color: "#f5e663", size: 3, sizeVar: 0.5, glow: 12, speed: 0.7, pulse: 2.5, opacity: 0.7, area: "all" },
    snow: PX_SNOW
  };
  // key, card name, picture and framing it launched with (same as tools/build-pages.mjs PP_PANELS)
  var PP_PANELS = [
    ["feature1", "Design", "img/photos/kyoto.jpg", "68% 70%"],
    ["feature2", "Development", "img/photos/tokyo.jpg", "42% 62%"],
    ["feature3", "Optimization", "img/photos/yokohama.jpg", "42% 66%"]
  ];
  var PP_FX_TITLES = { letters: "Heading character animation" };
  var PP_FX_NOTES = {
    letters: "The panel's gray heading appears one letter at a time as the panel scrolls into view. Its size and spacing stay exactly the same. Off: the site's normal heading animation.",
    grayFade: "The picture starts black and white and turns to full color. Off: the site's normal picture fade-in.",
    rain: "Rain falls over the picture, inside its rounded frame. It only runs while the panel is on screen.",
    fireflies: "Glowing dots drift slowly over the picture and pulse, inside its rounded frame. They pause while the panel is off screen.",
    snow: "Snow falls gently over the picture, inside its rounded frame. It only runs while the panel is on screen."
  };
  function ppNormalize(src) {
    var all = phIsObj(src) ? src : {}, out = {};
    PP_PANELS.forEach(function (p) {
      var base = Object.assign({}, PP_BASE, { image: p[2], position: p[3] });
      out[p[0]] = phMerge(base, all[p[0]]);
      out[p[0]].overlayMode = ["none", "solid", "gradient"].indexOf(out[p[0]].overlayMode) >= 0 ? out[p[0]].overlayMode : "none";
    });
    Object.keys(all).forEach(function (k) { if (!out[k]) out[k] = all[k]; });   // keep anything this editor doesn't know
    return out;
  }
  function ppCardHTML(p, n) {
    var v = px.cur.panels[p[0]];
    var posOpts = phPosOpts(v.position).replace('value="' + p[3] + '" selected>' + p[3], 'value="' + p[3] + '" selected>Original framing (' + p[3] + ")");
    if (v.position !== p[3]) posOpts += '<option value="' + p[3] + '">Original framing (' + p[3] + ")</option>";
    return '<article class="px-card pp-card" data-pp="' + p[0] + '">' +
      "<h2>" + p[1] + " panel picture</h2>" +
      '<label class="ed-check"><input type="checkbox" data-px-k="enabled"' + (v.enabled !== false ? " checked" : "") + "> Move the picture and use the effects below (off: the plain picture)</label>" +
      '<div class="px-preview">' +
        '<img class="px-thumb" alt="" src="' + esc(pxImgSrc(v.image)) + '">' +
        '<div class="px-actions">' +
          '<label class="ed-inline ed-grow"><span>Picture</span> <select data-px-k="image">' + pxPathOptions(v.image) + "</select></label>" +
          '<button type="button" class="ed-btn" data-pp-act="upload">Upload a new picture</button>' +
        "</div>" +
      "</div>" +
      '<div class="px-fields">' +
        '<label class="dz-range"><span>Parallax speed (0 = still)</span><input type="range" data-px-k="speed" min="-0.5" max="0.5" step="0.01" value="' + v.speed + '"><output>' + v.speed + "</output></label>" +
        '<label class="ed-field"><span>Picture position</span><select data-px-k="position">' + posOpts + "</select></label>" +
      "</div>" +
      pxOverlayHTML(v, true) +
      '<fieldset class="px-fx"><legend>Effects</legend>' +
        ["letters", "grayFade", "rain", "fireflies", "snow"].map(function (g) { return pxFxGroupHTML(g, v[g], PP_FX_TITLES[g], PP_FX_NOTES[g]); }).join("") +
        PX_RM_NOTE + "</fieldset></article>";
  }
  function renderPanels() {
    var wrap = $("#pp-wrap"); if (!wrap || !px.cur) return;
    if (!px.cur.panels) px.cur.panels = ppNormalize(null);
    wrap.innerHTML = '<h2 class="ph-title">Content panel images</h2>' +
      '<p class="ed-tip">The pictures beside the Design, Development and Optimization text on the homepage. Each keeps its rounded frame and size; ' +
      "the picture moves gently inside the frame as visitors scroll, and the overlay and effects stay inside the frame. " +
      "<b>Heading character animation</b> animates the panel's gray heading. Uploads are stored as <code>img/parallax/panel-1.jpg</code> … <code>panel-3.jpg</code>.</p>" +
      PP_PANELS.map(ppCardHTML).join("");
  }
  function ppInput(e) {
    var card = e.target.closest(".pp-card"); if (!card || !px.cur) return;
    var b = px.cur.panels[card.dataset.pp], el = e.target; if (!b) return;
    if (el.dataset.pxG) {
      var gkey = el.dataset.pxG;
      b.gradient = Object.assign({}, PP_BASE.gradient, b.gradient || {});
      b.gradient[gkey] = el.type === "range" ? parseFloat(el.value) : el.value;
      var go = el.parentNode.querySelector("output"); if (go) go.textContent = b.gradient[gkey] + (el.dataset.unit || "");
      var sw = card.querySelector(".px-ov-swatch"); if (sw) sw.style.background = pxGradCss(b.gradient);
    } else if (el.dataset.pxFx) {
      var gk = el.dataset.pxFx.split("."), g = gk[0], k2 = gk[1];
      b[g] = Object.assign({}, PP_BASE[g], b[g] || {});
      if (k2 === "enabled") {
        b[g].enabled = el.checked;
        var grp = el.closest(".px-fx-group"); if (grp) grp.toggleAttribute("data-off", !el.checked);
      } else if (el.type === "range") {
        b[g][k2] = parseFloat(el.value);
        el.parentNode.querySelector("output").textContent = b[g][k2] + (el.dataset.unit || "");
      } else {
        b[g][k2] = el.value;
        var o = el.parentNode.querySelector("output"); if (o) o.textContent = el.value;
      }
    } else {
      var k = el.dataset.pxK; if (!k) return;
      if (k === "enabled") b.enabled = el.checked;
      else if (k === "speed" || k === "overlayOpacity") {
        b[k] = parseFloat(el.value);
        el.parentNode.querySelector("output").textContent = String(b[k]);
      } else if (k === "overlay") {
        b.overlay = el.value;
        el.parentNode.querySelector("output").textContent = el.value;
      } else if (k === "overlayMode") {
        b.overlayMode = ["none", "solid", "gradient"].indexOf(el.value) >= 0 ? el.value : "none";
        card.querySelector(".px-ov-solid").hidden = b.overlayMode !== "solid";
        card.querySelector(".px-ov-grad").hidden = b.overlayMode !== "gradient";
      } else if (k === "image" || k === "position") {
        b[k] = el.value;
        if (k === "image") { var th = card.querySelector(".px-thumb"); if (th) th.src = pxImgSrc(el.value); }
      }
    }
    updateBar();
  }
  $("#pp-wrap").addEventListener("input", ppInput);
  $("#pp-wrap").addEventListener("click", function (e) {
    var act = e.target.closest("[data-pp-act]"); if (!act || !px.cur) return;
    var card = act.closest(".pp-card"); if (!card) return;
    var key = card.dataset.pp, b = px.cur.panels[key], n = key.replace(/\D/g, "");
    if (act.dataset.ppAct === "upload") {
      var dest = /^img\/parallax\/panel-/.test(b.image) ? b.image : "img/parallax/panel-" + n + ".jpg";
      ppUploadKey = key;
      openImage(dest);
      $("#ed-imgdlg-old").src = pxImgSrc(b.image);
      $("#ed-imgdlg-path").textContent = dest;
    }
  });

  /* ================================================================== BUTTONS (every kind of button on the site)
     Settings live in data/buttons.json; admin/buttons-style.js turns them into CSS for the live preview here and into
     buttons.css (saved with the settings, and rewritten by tools/build-pages.mjs). Every page loads buttons.css after
     site-theme.css. An empty setting keeps the site's normal look. The hero button's style (Flat red, the default, or Glass) is a
     setting of the "Hero button" type; saving commits buttons.css too, so the switch shows without a site rebuild. */
  var BS = window.TenshiButtonStyle;
  var bt = { saved: null, cur: null, fonts: null, ready: false, loading: false };
  // where each kind of button can be seen
  var BT_PAGE = { primary: "index.html", submit: "contact.html", light: "services/web-design.html", dark: "contact.html", more: "index.html",
    project: "projects.html", textLink: "index.html", tabs: "news.html", lang: "index.html", chat: "index.html", chatSend: "index.html", heroGlass: "index.html" };
  // the main buttons' words (translations.js keys)
  var BT_LABELS = [["cta", "Request Consultation buttons"], ["send", "Contact form Send button"], ["more", "Learn more (service cards)"],
    ["seeAll", "See all services (About page)"], ["aboutTeamBtn", "Meet the team (About page)"], ["portalClientBtn", "Client portal button"],
    ["portalAdminBtn", "Editor button (portal page)"], ["infoChatBtn", "Chat button (contact page)"], ["homeNewsAll", "All news link"], ["homeBlogAll", "All posts link"]];
  function buttonsDirty() { return !!(bt && bt.cur && bt.saved && JSON.stringify(BS.clean(bt.cur)) !== JSON.stringify(BS.clean(bt.saved))); }
  function buttonsCssFile() {
    return "/* Written by tools/build-pages.mjs from data/buttons.json (Tenshi Editor › Buttons). Don't edit by hand. */\n" + BS.css(BS.clean(bt.cur), bt.fonts || []);
  }
  function btType() { return $("#bt-type").value || "primary"; }
  function btStyle() { var t = btType(); bt.cur.types = bt.cur.types || {}; return bt.cur.types[t] || {}; }
  function btSet(k, v) {
    var t = btType(); bt.cur.types = bt.cur.types || {};
    var s = bt.cur.types[t] = bt.cur.types[t] || {};
    if (v === undefined || v === "" || v === null) delete s[k]; else s[k] = v;
    if (!Object.keys(s).length) delete bt.cur.types[t];
    updateBar(); btOutputs(); btLive();
  }
  function loadButtons() {
    if (bt.ready) { btRender(); return; }
    if (bt.loading) return;
    bt.loading = true;
    Promise.all([
      slLoadFonts(),
      tree.has("data/buttons.json") ? readText("data/buttons.json").then(JSON.parse).catch(function () { return {}; }) : Promise.resolve({})
    ]).then(function (r) {
      bt.fonts = r[0]; bt.saved = BS.clean(r[1]); bt.cur = JSON.parse(JSON.stringify(bt.saved)); bt.ready = true;
      $("#bt-type").innerHTML = BS.TYPES.map(function (T) { return '<option value="' + T.key + '">' + esc(T.label) + "</option>"; }).join("");
      $("#bt-page").innerHTML = pages.map(function (p) { return '<option value="' + esc(p) + '">' + esc(prettyPage(p)) + "</option>"; }).join("");
      btRender(); btLabels(); btPickPage();
    }).catch(function (e) { $("#bt-msg").className = "ed-msg err"; $("#bt-msg").textContent = "Couldn't load the button settings: " + e.message; })
      .then(function () { bt.loading = false; });
  }
  function btFmt(f, v) { return (Math.round(v * 1000) / 1000) + (f.unit ? " " + f.unit : ""); }
  function btRender() {
    if (!bt.cur) return;
    var s = btStyle(), T = BS.TYPES.filter(function (x) { return x.key === btType(); })[0];
    $("#bt-note").textContent = T ? T.note : "";
    var groups = ["Normal", "Text", "Hover"], names = { Normal: "Look", Text: "Text", Hover: "Hover and motion" };
    $("#bt-form").innerHTML = groups.map(function (g) {
      var list = BS.fieldsFor(T).filter(function (f) { return f.group === g; });
      if (!list.length) return "";
      return '<div class="bt-group"><h3>' + names[g] + '</h3><div class="sl-look">' + list.map(function (f) {
        var v = s[f.key], set = v !== undefined && v !== "", id = "btf-" + f.key,
          reset = '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small sl-reset" data-bt-reset="' + f.key + '"' + (set ? "" : " hidden") + ">Reset</button>";
        if (f.type === "font") return '<label class="sl-field"><span>' + esc(f.label) + '</span><select id="' + id + '" data-bt="' + f.key + '">' + slFontOptions(v) + "</select>" + reset + "</label>";
        if (f.type === "select") return '<label class="sl-field"><span>' + esc(f.label) + '</span><select id="' + id + '" data-bt="' + f.key + '">' + f.options.map(function (o) { return '<option value="' + o[0] + '"' + (String(set ? v : "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" + reset + "</label>";
        if (f.type === "range") return '<label class="sl-field sl-range"><span>' + esc(f.label) + '</span><input type="range" id="' + id + '" data-bt="' + f.key + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + (set ? v : f.start) + '"><output data-bt-out="' + f.key + '"></output>' + reset + "</label>";
        if (f.type === "color") return '<label class="sl-field sl-color"><span>' + esc(f.label) + '</span><input type="color" id="' + id + '" data-bt="' + f.key + '" value="' + (set ? esc(v) : f.def !== undefined ? esc(f.def) : (/color$/i.test(f.key) && !/border/i.test(f.key) ? "#ffffff" : "#c8102e")) + '"><output data-bt-out="' + f.key + '"></output>' + reset + "</label>";
        return "";
      }).join("") + "</div></div>";
    }).join("");
    btOutputs(); btLive();
  }
  /* Refresh value labels and Reset buttons without rebuilding the form (keeps focus while dragging). */
  function btOutputs() {
    var s = btStyle(), T = BS.TYPES.filter(function (x) { return x.key === btType(); })[0];
    BS.fieldsFor(T).forEach(function (f) {
      var set = s[f.key] !== undefined && s[f.key] !== "";
      var out = $('#bt-form [data-bt-out="' + f.key + '"]'); if (out) out.textContent = set ? (f.type === "range" ? btFmt(f, s[f.key]) : String(s[f.key]).toUpperCase()) : "Site default";
      var r = $('#bt-form [data-bt-reset="' + f.key + '"]'); if (r) r.hidden = !set;
    });
  }
  function btLabels() {
    $("#bt-labels").innerHTML = BT_LABELS.filter(function (l) { return T.en && T.en[l[0]] !== undefined; }).map(function (l) {
      return '<label class="sl-field"><span>' + esc(l[1]) + '</span><input type="text" data-bt-label="' + l[0] + '" value="' + esc(cur("en", l[0])) + '">' +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-bt-langs="' + l[0] + '">All languages</button></label>';
    }).join("");
  }
  $("#bt-labels").addEventListener("input", function (e) { var k = e.target.dataset.btLabel; if (k) { setPend("en", k, e.target.value); btLabelPaint(k); } });
  $("#bt-labels").addEventListener("click", function (e) { var b = e.target.closest("[data-bt-langs]"); if (b) { e.preventDefault(); openText([b.dataset.btLangs]); } });
  function btLabelPaint(k) {
    var doc; try { doc = $("#bt-frame").contentDocument; } catch (e) { return; }
    if (doc) $$('[data-i18n="' + k + '"]', doc).forEach(function (el) { el.textContent = cur("en", k); });
  }
  $("#bt-form").addEventListener("input", function (e) {
    var el = e.target, k = el.dataset.bt; if (!k) return;
    var f = BS.FIELDS.filter(function (x) { return x.key === k; })[0];
    btSet(k, f.type === "range" ? parseFloat(el.value) : el.value);
  });
  $("#bt-form").addEventListener("click", function (e) {
    var b = e.target.closest("[data-bt-reset]"); if (!b) return;
    e.preventDefault(); btSet(b.dataset.btReset, undefined); btRender();
  });
  $("#bt-type").addEventListener("change", function () { btRender(); btPickPage(); });
  $("#bt-page").addEventListener("change", btLoadFrame);
  $("#bt-hover").addEventListener("change", btLive);
  $("#bt-reset").addEventListener("click", function () { if (bt.cur && bt.cur.types) { delete bt.cur.types[btType()]; updateBar(); btRender(); } });
  $("#bt-reset-all").addEventListener("click", function () {
    if (!bt.cur || !window.confirm("Put every button back to the site's normal look?")) return;
    bt.cur = { types: {} }; updateBar(); btRender();
  });
  function btPickPage() {
    var p = BT_PAGE[btType()] || "index.html";
    if (pages.indexOf(p) < 0) p = "index.html";
    if ($("#bt-page").value !== p || !$("#bt-frame").getAttribute("src")) { $("#bt-page").value = p; btLoadFrame(); }
    else btScrollTo(btLive() || []);
  }
  // Bring the first visible button of the chosen kind into view in the preview (fixed ones are always in view)
  function btScrollTo(els) {
    var el = els.filter(function (x) { return x.getClientRects().length; })[0];
    if (el && getComputedStyle(el).position !== "fixed") el.scrollIntoView({ block: "center" });
  }
  function btLoadFrame() { $("#bt-frame").src = SITE + $("#bt-page").value + "?lang=en&t=" + Date.now(); }
  /* The unsaved look on the real page; the saved buttons.css is switched off so a reset shows the site default. */
  function btLive() {
    var fr = $("#bt-frame"), doc; try { doc = fr.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head || !bt.cur) return;
    $$('link[href*="buttons.css"]', doc).forEach(function (l) { l.disabled = true; });
    var st = doc.getElementById("tse-live-buttons");
    if (!st) { st = doc.createElement("style"); st.id = "tse-live-buttons"; doc.head.appendChild(st); }
    st.textContent = BS.css(BS.clean(bt.cur), bt.fonts || [], { prefix: SITE, forceHover: "bt-force-hover" }) +
      ".bt-spot{outline:3px dashed #ffc069!important;outline-offset:5px!important}";
    var T = BS.TYPES.filter(function (x) { return x.key === btType(); })[0]; if (!T) return;
    $$(".bt-spot, .bt-force-hover", doc).forEach(function (el) { el.classList.remove("bt-spot", "bt-force-hover"); });
    var els = $$(T.sel, doc);
    els.forEach(function (el) { el.classList.add("bt-spot"); if ($("#bt-hover").checked) el.classList.add("bt-force-hover"); });
    $("#bt-msg").className = "ed-msg"; $("#bt-msg").textContent = els.length ? els.length + (els.length === 1 ? " button" : " buttons") + " of this kind on this page (outlined in the preview)." : "There are no buttons of this kind on this page; pick another preview page.";
    return els;
  }
  $("#bt-frame").addEventListener("load", function () {
    var doc; try { doc = this.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head) return;
    var st = doc.createElement("style");
    st.textContent = ".bw-intro,[class*=intro-screen],.lang-dialog{display:none!important}";
    doc.head.appendChild(st);
    var frame = this;
    setTimeout(function () {
      var els = btLive() || [];
      if (btType() === "chatSend") { var l = doc.querySelector(".tk-launch"); if (l) { l.click(); setTimeout(btLive, 600); } return; }
      btScrollTo(els);
      setTimeout(btLive, 800);
    }, 700);
  });

  /* ================================================================== CUSTOM CSS (custom.css, loaded last on every page)
     Saved as typed. No tags: the file is linked, never inlined, and Save refuses <style> or <script>. */
  var cc = { saved: null, cur: null, ready: false, loading: false }, ccTimer;
  function customDirty() { return !!(cc && cc.saved != null && cc.cur != null && cc.cur !== cc.saved); }
  function ccStrip(css) { return css.replace(/\/\*[\s\S]*?(\*\/|$)/g, "").replace(/"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'/g, '""'); }
  function ccBlocked(css) {
    if (/<\s*\/?\s*(style|script)\b/i.test(css)) return "it contains a <style> or <script> tag. Only CSS rules can go here; remove the tag.";
    if (/<!--|-->|<\s*\/?\s*[a-z]/i.test(ccStrip(css))) return "it contains HTML. Only CSS rules can go here.";
    return "";
  }
  function ccBraces(css) {
    var s = ccStrip(css), depth = 0, line = 1;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === "\n") line++;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth < 0) return "there's an extra } on line " + line + "."; }
    }
    return depth > 0 ? (depth === 1 ? "a { has no closing }." : depth + " { have no closing }.") : "";
  }
  function ccCheck() {
    var m = $("#cc-msg"), bad = ccBlocked(cc.cur || ""), br = bad ? "" : ccBraces(cc.cur || "");
    m.className = "ed-msg" + (bad ? " err" : br ? " warn" : "");
    m.textContent = bad ? "Can't save: " + bad : br ? "Check the braces: " + br : (customDirty() ? "Unsaved changes. The preview shows them; Save puts them on the site." : "");
    if (br && !bad) m.style.color = "var(--warn)"; else m.style.color = "";
  }
  function ccGutter() {
    var n = ($("#cc-text").value.match(/\n/g) || []).length + 1, out = [];
    for (var i = 1; i <= n; i++) out.push(i);
    $("#cc-gutter").textContent = out.join("\n");
    $("#cc-gutter").scrollTop = $("#cc-text").scrollTop;
  }
  function loadCustom() {
    if (cc.ready) { ccLive(); return; }
    if (cc.loading) return;
    cc.loading = true;
    (tree.has("custom.css") ? readText("custom.css") : Promise.resolve("")).then(function (t) {
      cc.saved = t; cc.cur = t; cc.ready = true;
      $("#cc-text").value = t; ccGutter(); ccCheck();
      $("#cc-page").innerHTML = pages.map(function (p) { return '<option value="' + esc(p) + '">' + esc(prettyPage(p)) + "</option>"; }).join("");
      ccLoadFrame();
    }).catch(function (e) { $("#cc-msg").className = "ed-msg err"; $("#cc-msg").textContent = "Couldn't load custom.css: " + e.message; })
      .then(function () { cc.loading = false; });
  }
  $("#cc-text").addEventListener("input", function () {
    if (!cc.ready) return;
    cc.cur = this.value; ccGutter(); updateBar();
    clearTimeout(ccTimer); ccTimer = setTimeout(function () { ccCheck(); ccLive(); }, 250);
  });
  $("#cc-text").addEventListener("scroll", function () { $("#cc-gutter").scrollTop = this.scrollTop; });
  var ccEscaped = false;
  $("#cc-text").addEventListener("keydown", function (e) {
    if (e.key === "Escape") { ccEscaped = true; return; }
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) { ccEscaped = false; return; }
    if (ccEscaped) { ccEscaped = false; return; }   // Esc, then Tab: move focus on as usual
    e.preventDefault();
    var ta = this, a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    if (e.shiftKey) {
      // outdent the current line
      var ls = v.lastIndexOf("\n", a - 1) + 1, cut = v.slice(ls, ls + 2) === "  " ? 2 : v[ls] === " " ? 1 : 0;
      if (!cut) return;
      ta.setRangeText("", ls, ls + cut, "preserve");
    } else {
      ta.setRangeText("  ", a, b, "end");
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("#cc-page").addEventListener("change", ccLoadFrame);
  $("#cc-reload").addEventListener("click", ccLoadFrame);
  function ccLoadFrame() { $("#cc-frame").src = SITE + $("#cc-page").value + "?lang=en&t=" + Date.now(); }
  /* The unsaved CSS on the real page; the saved custom.css is switched off. Tags are never put in the page. */
  function ccLive() {
    var doc; try { doc = $("#cc-frame").contentDocument; } catch (e) { return; }
    if (!doc || !doc.head || cc.cur == null) return;
    $$('link[href*="custom.css"]', doc).forEach(function (l) { l.disabled = true; });
    var st = doc.getElementById("tse-live-custom");
    if (!st) { st = doc.createElement("style"); st.id = "tse-live-custom"; doc.head.appendChild(st); }
    st.textContent = ccBlocked(cc.cur) ? "" : cc.cur;
  }
  $("#cc-frame").addEventListener("load", function () {
    var doc; try { doc = this.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head) return;
    var st = doc.createElement("style");
    st.textContent = ".bw-intro,[class*=intro-screen],.lang-dialog{display:none!important}";
    doc.head.insertBefore(st, doc.head.firstChild);
    ccLive();
  });


  /* ================================================================== SHARE BUTTONS (end of every blog post)
     Settings live in data/share.json; tools/build-pages.mjs writes the Shareon row (plus LINE and Hatena) into
     each blog/<slug>.html. admin/share-networks.js holds the list of networks and the clean() helper. */
  var SH = window.TenshiShare;
  var sh = { saved: null, cur: null, posts: [], order: [], ready: false, loading: false, dragId: "" };
  function shareDirty() { return !!(sh && sh.cur && sh.saved && JSON.stringify(SH.clean(sh.cur)) !== JSON.stringify(SH.clean(sh.saved))); }
  function shareJSON() { return JSON.stringify(SH.clean(sh.cur), null, 2) + "\n"; }
  function shSyncNetworks() {
    sh.cur.networks = sh.order.filter(function (id) { return sh.cur._on[id]; });
  }
  function shInitOrder(cfg) {
    var enabled = (cfg.networks || []).slice();
    var rest = SH.NETWORKS.map(function (n) { return n.id; }).filter(function (id) { return enabled.indexOf(id) < 0; });
    sh.order = enabled.concat(rest);
    sh.cur._on = {};
    enabled.forEach(function (id) { sh.cur._on[id] = true; });
  }
  function loadShare() {
    if (sh.ready) { renderShare(); return; }
    if (sh.loading) return;
    sh.loading = true;
    Promise.all([
      tree.has("data/share.json") ? readText("data/share.json").then(JSON.parse).catch(function () { return {}; }) : Promise.resolve({}),
      tree.has("data/blog.json") ? readText("data/blog.json").then(JSON.parse).catch(function () { return { posts: [] }; }) : Promise.resolve({ posts: [] })
    ]).then(function (r) {
      sh.saved = SH.clean(r[0]); sh.cur = JSON.parse(JSON.stringify(sh.saved));
      shInitOrder(sh.cur);
      sh.posts = (r[1] && r[1].posts) || [];
      sh.ready = true; renderShare();
    }).catch(function (e) {
      $("#sh-msg").className = "ed-msg err";
      $("#sh-msg").textContent = "Couldn't load the share button settings: " + e.message;
    }).then(function () { sh.loading = false; });
  }
  function renderShare() {
    if (!sh.cur) return;
    $("#sh-enabled").checked = sh.cur.enabled !== false;
    $("#sh-heading").checked = sh.cur.heading !== false;
    $("#sh-site").value = sh.cur.siteUrl || "";
    $("#sh-fb").value = sh.cur.fbAppId || "";
    shSyncFb();
    var order = sh.order;
    $("#sh-nets").innerHTML = order.map(function (id, i) {
      var n = SH.BY_ID[id]; if (!n) return "";
      var on = !!sh.cur._on[id];
      var note = n.note ? '<span class="sh-note">' + esc(n.note) + "</span>" : "";
      return '<li class="sh-net" draggable="true" data-sh-id="' + esc(id) + '">' +
        '<span class="sh-handle" aria-hidden="true">::</span>' +
        '<label><input type="checkbox" data-sh-net="' + esc(id) + '"' + (on ? " checked" : "") + "> <span>" + esc(n.label) + note + "</span></label>" +
        '<span class="sh-move">' +
          '<button type="button" data-sh-move="-1" aria-label="Move up"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
          '<button type="button" data-sh-move="1" aria-label="Move down"' + (i === order.length - 1 ? " disabled" : "") + ">▼</button>" +
        "</span></li>";
    }).join("");
    $("#sh-posts").innerHTML = sh.posts.length ? sh.posts.map(function (post) {
      var key = post.slug || post.id || "";
      var hide = SH.isDisabledOn(sh.cur, post);
      var meta = (post.date ? esc(post.date) + " · " : "") + esc(post.slug || post.id || "");
      return '<li class="sh-post"><label><input type="checkbox" data-sh-post="' + esc(key) + '"' + (hide ? " checked" : "") + "> <span>" +
        esc(post.title || key) + '<span class="sh-meta">' + meta + "</span></span></label></li>";
    }).join("") : '<li class="ed-tip">No blog posts were found in data/blog.json.</li>';
    $("#sh-msg").className = "ed-msg";
    $("#sh-msg").textContent = (sh.cur.enabled === false)
      ? "Share buttons are off on every post."
      : sh.cur.networks.length + " network" + (sh.cur.networks.length === 1 ? "" : "s") + " will appear on posts (except any you hide below).";
  }
  function shSyncFb() {
    $("#sh-fb-wrap").hidden = !sh.cur._on.messenger;
  }
  function shMove(id, dir) {
    var i = sh.order.indexOf(id); if (i < 0) return;
    var j = i + dir; if (j < 0 || j >= sh.order.length) return;
    sh.order.splice(i, 1); sh.order.splice(j, 0, id);
    shSyncNetworks(); updateBar(); renderShare();
  }
  function shToggleNet(id, on) {
    sh.cur._on[id] = !!on;
    shSyncNetworks(); updateBar(); renderShare();
  }
  function shTogglePost(key, hide) {
    var list = (sh.cur.disabledPosts || []).slice();
    var i = list.indexOf(key);
    if (hide && i < 0) list.push(key);
    if (!hide && i >= 0) list.splice(i, 1);
    sh.cur.disabledPosts = list;
    updateBar(); renderShare();
  }
  $("#sh-enabled").addEventListener("change", function () { sh.cur.enabled = this.checked; updateBar(); renderShare(); });
  $("#sh-heading").addEventListener("change", function () { sh.cur.heading = this.checked; updateBar(); renderShare(); });
  $("#sh-site").addEventListener("input", function () { sh.cur.siteUrl = this.value.trim(); updateBar(); });
  $("#sh-fb").addEventListener("input", function () { sh.cur.fbAppId = this.value.trim(); updateBar(); });
  $("#sh-nets").addEventListener("change", function (e) {
    var box = e.target.closest("[data-sh-net]"); if (!box) return;
    shToggleNet(box.dataset.shNet, box.checked);
  });
  $("#sh-nets").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-sh-move]"); if (!btn || btn.disabled) return;
    var row = btn.closest("[data-sh-id]"); if (!row) return;
    shMove(row.dataset.shId, parseInt(btn.dataset.shMove, 10));
  });
  $("#sh-posts").addEventListener("change", function (e) {
    var box = e.target.closest("[data-sh-post]"); if (!box) return;
    shTogglePost(box.dataset.shPost, box.checked);
  });
  $("#sh-nets").addEventListener("dragstart", function (e) {
    var row = e.target.closest("[data-sh-id]"); if (!row) return;
    sh.dragId = row.dataset.shId;
    row.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", sh.dragId); } catch (err) {}
  });
  $("#sh-nets").addEventListener("dragend", function (e) {
    var row = e.target.closest("[data-sh-id]"); if (row) row.classList.remove("is-dragging");
    $$(".sh-net.is-over").forEach(function (el) { el.classList.remove("is-over"); });
    sh.dragId = "";
  });
  $("#sh-nets").addEventListener("dragover", function (e) {
    var row = e.target.closest("[data-sh-id]"); if (!row || !sh.dragId || row.dataset.shId === sh.dragId) return;
    e.preventDefault();
    $$(".sh-net.is-over").forEach(function (el) { if (el !== row) el.classList.remove("is-over"); });
    row.classList.add("is-over");
    e.dataTransfer.dropEffect = "move";
  });
  $("#sh-nets").addEventListener("drop", function (e) {
    var row = e.target.closest("[data-sh-id]"); if (!row || !sh.dragId) return;
    e.preventDefault();
    var from = sh.order.indexOf(sh.dragId), to = sh.order.indexOf(row.dataset.shId);
    if (from < 0 || to < 0 || from === to) return;
    sh.order.splice(from, 1);
    sh.order.splice(to, 0, sh.dragId);
    shSyncNetworks(); updateBar(); renderShare();
  });

  /* ================================================================== IMAGE EFFECTS (shimmer, sparkles, sprites on any picture)
     Settings live in data/fx.json. fx.js (loaded on every page and here) holds the defaults, the checks (clean) and
     dataJs(), which writes fx-data.js, the small file pages read. On Save both files are committed, like data/buttons.json
     and buttons.css; tools/build-pages.mjs writes the same fx-data.js again when the site rebuilds. */
  var FX = window.TenshiFX;
  var fx = { saved: null, cur: null, sel: -1, ready: false, loading: false, ctl: null };
  var FX_PICKS = [
    ["Header logo", ".brand-logo"], ["Homepage logo", ".hero-logo"], ["Footer logo", ".footer-logo"],
    ["Team photos", ".td-photo"], ["Project logos", ".prj-card-logo, .prj-logo, .prj-hero-logos img"],
    ["Service pictures", ".service-pic"], ["Story thumbnails", ".fw-thumb"]
  ];
  var FX_LABELS = { shimmer: "Shimmer", sparkles: "Sparkles", sprite: "Sprite", glow: "Glow pulse", tilt: "Hover tilt" };
  var FX_NOTES = {
    shimmer: "A diagonal band of light that sweeps across the picture.",
    sparkles: "Small four-point stars that twinkle on or around the picture.",
    sprite: "An animated sprite sheet (a strip of frames side by side) played over the picture.",
    glow: "A soft coloured glow from the picture's own shape that slowly breathes.",
    tilt: "The picture tilts toward the pointer on computers with a mouse."
  };
  var FX_SPRITES = [["img/fx/glint.svg", "Glint (white star, 8 frames)"], ["img/fx/starburst.svg", "Star-burst (red and white, 8 frames)"]];
  /* [key, label, type, unit or options] — number limits come from FX.RANGES */
  var FX_FIELDS = {
    shimmer: [["color", "Colour", "color"], ["opacity", "Strength", "range", "%"], ["angle", "Angle", "range", "°"], ["width", "Band width (share of the picture)", "range", "pct"],
      ["speed", "Sweep time", "range", "s"], ["delay", "Pause between sweeps (or before it, for Once)", "range", "s"],
      ["mode", "When", "select", [["loop", "Loop"], ["hover", "On hover"], ["scroll", "Once, when scrolled into view"]]],
      ["clip", "Only on the picture's own shape (skips see-through areas)", "check"]],
    sparkles: [["colors", "Colours", "colors"], ["count", "How many", "range", ""], ["sizeMin", "Smallest", "range", "px"], ["sizeMax", "Largest", "range", "px"],
      ["speed", "Twinkle time", "range", "s"], ["density", "Lit at once", "range", "%"],
      ["spread", "Where", "select", [["edge", "Around the edge"], ["inside", "Over the picture"]]], ["reach", "How far outside the edge", "range", "px"]],
    sprite: [["url", "Sprite sheet", "sprite"], ["frames", "Frames", "range", ""], ["frameWidth", "Frame width", "range", "px"], ["frameHeight", "Frame height", "range", "px"],
      ["fps", "Frames per second", "range", ""], ["scale", "Size", "range", "×"], ["loop", "Keep playing", "check"], ["gap", "Pause between plays", "range", "s"],
      ["position", "Position", "select", [["top-start", "Top corner, start side"], ["top-end", "Top corner, end side"], ["bottom-start", "Bottom corner, start side"], ["bottom-end", "Bottom corner, end side"], ["center", "Centre"]]],
      ["blend", "Blend", "select", FX.BLENDS.map(function (b) { return [b, b]; })]],
    glow: [["color", "Colour", "color"], ["opacity", "Strength", "range", "%"], ["size", "Size", "range", "px"], ["speed", "Breath time", "range", "s"]],
    tilt: [["max", "Most tilt", "range", "°"]]
  };
  function fxDirty() { return !!(fx && fx.cur && fx.saved && JSON.stringify(FX.clean(fx.cur)) !== JSON.stringify(FX.clean(fx.saved))); }
  function fxJSON() { return JSON.stringify(FX.clean(fx.cur), null, 2) + "\n"; }
  function fxRule() { return fx.cur && fx.cur.rules[fx.sel]; }
  function fxFmt(unit, v) { return unit === "%" ? Math.round(v * 100) + "%" : unit === "pct" ? v + "%" : v + (unit ? (unit === "×" ? "×" : " " + unit) : ""); }
  function loadFx() {
    if (fx.ready) { renderFx(); return; }
    if (fx.loading) return;
    fx.loading = true;
    (tree.has("data/fx.json") ? readText("data/fx.json").then(JSON.parse).catch(function () { return {}; }) : Promise.resolve({})).then(function (d) {
      fx.saved = FX.clean(d); fx.cur = JSON.parse(JSON.stringify(fx.saved));
      fx.sel = fx.cur.rules.length ? 0 : -1;
      fx.ready = true; renderFx();
    }).catch(function (e) {
      $("#fx-msg").className = "ed-msg err";
      $("#fx-msg").textContent = "Couldn't load the image effect settings: " + e.message;
    }).then(function () { fx.loading = false; });
  }
  function fxSummary(r) {
    var on = FX.EFFECTS.filter(function (e) { return r[e].on; }).map(function (e) { return FX_LABELS[e]; });
    return on.length ? on.join(", ") : "No effect switched on";
  }
  function renderFx() {
    if (!fx.cur) return;
    $("#fx-enabled").checked = fx.cur.enabled !== false;
    var rules = fx.cur.rules;
    $("#fx-rules").innerHTML = rules.length ? rules.map(function (r, i) {
      return '<li class="fx-rule' + (i === fx.sel ? " is-sel" : "") + (r.enabled ? "" : " is-off") + '" data-fx-i="' + i + '">' +
        '<label class="fx-rule-on" title="Rule on or off"><input type="checkbox" data-fx-on' + (r.enabled ? " checked" : "") + ' aria-label="Rule on"></label>' +
        '<button type="button" class="fx-rule-pick" data-fx-pick><b>' + esc(r.name || r.selector || "New rule") + "</b>" +
        '<span class="fx-rule-meta"><code>' + esc(r.selector || "no selector yet") + "</code> · " + esc(fxSummary(r)) + "</span></button>" +
        '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-fx-del>Remove</button></li>';
    }).join("") : '<li class="ed-tip">No rules yet. Press <b>Add rule</b> to start.</li>';
    $("#fx-msg").className = "ed-msg";
    var liveN = rules.filter(function (r) { return r.enabled && r.selector && FX.EFFECTS.some(function (e) { return r[e].on; }); }).length;
    $("#fx-msg").textContent = fx.cur.enabled === false ? "Image effects are off across the site." : liveN + " rule" + (liveN === 1 ? "" : "s") + " active on the site.";
    renderFxEditor();
  }
  function fxField(e, f, val) {
    var key = f[0], label = f[1], type = f[2], id = "fx-f-" + e + "-" + key, attrs = ' id="' + id + '" data-fx-e="' + e + '" data-fx-k="' + key + '"';
    if (type === "range") {
      var r = FX.RANGES[e][key];
      return '<label class="sl-field sl-range"><span>' + esc(label) + '</span><input type="range"' + attrs + ' min="' + r[0] + '" max="' + r[1] + '" step="' + r[2] + '" value="' + val + '"><output>' + esc(fxFmt(f[3], val)) + "</output></label>";
    }
    if (type === "color") return '<label class="sl-field sl-color"><span>' + esc(label) + '</span><input type="color"' + attrs + ' value="' + esc(val) + '"><output>' + esc(val) + "</output></label>";
    if (type === "select") return '<label class="sl-field"><span>' + esc(label) + '</span><select' + attrs + ">" + f[3].map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
    if (type === "check") return '<label class="ed-check sl-field"><input type="checkbox"' + attrs + (val ? " checked" : "") + "> " + esc(label) + "</label>";
    if (type === "colors") {
      var list = String(val).split(/\s*,\s*/); while (list.length < 3) list.push(list[list.length - 1] || "#ffffff");
      return '<div class="sl-field fx-colors"><span>' + esc(label) + "</span><div>" + list.slice(0, 3).map(function (c, i) {
        return '<input type="color" data-fx-e="' + e + '" data-fx-k="colors" data-fx-n="' + i + '" value="' + esc(c) + '" aria-label="Colour ' + (i + 1) + '">'; }).join("") + "</div></div>";
    }
    if (type === "sprite") {
      var known = FX_SPRITES.some(function (s) { return s[0] === val; });
      return '<label class="sl-field fx-sprite-pick"><span>' + esc(label) + '</span><select data-fx-e="' + e + '" data-fx-sprite>' +
        FX_SPRITES.map(function (s) { return '<option value="' + esc(s[0]) + '"' + (s[0] === val ? " selected" : "") + ">" + esc(s[1]) + "</option>"; }).join("") +
        '<option value=""' + (known ? "" : " selected") + '>My own image…</option></select>' +
        '<input type="text"' + attrs + ' value="' + esc(val) + '" spellcheck="false" placeholder="img/fx/my-sprite.png"' + (known ? " hidden" : "") + '>' +
        '<span class="sl-note">A strip of frames side by side, from the site\'s main folder. Set the frame count and size to match.</span></label>';
    }
    return "";
  }
  function renderFxEditor() {
    var r = fxRule();
    $("#fx-editor").hidden = !r;
    if (!r) { fxPreview(); return; }
    $("#fx-name").value = r.name;
    $("#fx-selector").value = r.selector;
    fxCheckSelector();
    $("#fx-picks").innerHTML = '<span class="fx-picks-label">Quick picks:</span>' + FX_PICKS.map(function (p) {
      return '<button type="button" class="ed-btn ed-btn--ghost ed-btn--small" data-fx-sel="' + esc(p[1]) + '" title="' + esc(p[1]) + '">' + esc(p[0]) + "</button>"; }).join("");
    $("#fx-effects").innerHTML = FX.EFFECTS.map(function (e) {
      var s = r[e];
      return '<fieldset class="fx-effect' + (s.on ? " is-on" : "") + '" data-fx-effect="' + e + '"><legend><label class="ed-check"><input type="checkbox" data-fx-e="' + e + '" data-fx-k="on"' + (s.on ? " checked" : "") + "> " + esc(FX_LABELS[e]) + "</label></legend>" +
        '<p class="ed-tip">' + esc(FX_NOTES[e]) + "</p>" +
        '<div class="sl-look fx-fields">' + FX_FIELDS[e].map(function (f) { return fxField(e, f, s[f[0]]); }).join("") + "</div></fieldset>";
    }).join("");
    fxPreview();
  }
  function fxCheckSelector() {
    var r = fxRule(), note = $("#fx-sel-note"); if (!r) return;
    var bad = false;
    if (r.selector) { try { document.createDocumentFragment().querySelector(r.selector); } catch (err) { bad = true; } }
    note.className = "ed-tip fx-sel-note" + (bad ? " err" : "");
    note.textContent = !r.selector ? "Pick the pictures this rule applies to." : bad ? "That isn't a valid CSS selector, so the rule won't match anything." :
      "A selector that matches a box (not a picture) applies to the pictures inside it.";
  }
  var fxTimer = 0;
  function fxPreview() {
    cancelAnimationFrame(fxTimer);
    fxTimer = requestAnimationFrame(function () {
      var img = $("#fx-sample-img"), r = fxRule();
      if (img.__fxCtl) img.__fxCtl.destroy();
      fx.ctl = r && FX.apply ? FX.apply(img, r) : null;
      var calmNow = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("#fx-preview-note").textContent = calmNow ? "This computer asks for reduced motion, so the preview (like the site) stays still." :
        !r || !FX.EFFECTS.some(function (e) { return r[e].on; }) ? "Switch on an effect to see it here." : "Live preview of this rule. Hover the picture to try “On hover” effects.";
    });
  }
  function fxSet(e, k, v) {
    var r = fxRule(); if (!r) return;
    r[e][k] = v;
    r[e] = FX.cleanEffect(e, r[e]);
    updateBar(); fxPreview();
  }
  $("#fx-enabled").addEventListener("change", function () { fx.cur.enabled = this.checked; updateBar(); renderFx(); });
  $("#fx-add").addEventListener("click", function () {
    if (!fx.cur) return;
    var n = fx.cur.rules.length + 1, ids = fx.cur.rules.map(function (r) { return r.id; });
    while (ids.indexOf("rule-" + n) >= 0) n++;
    var r = FX.cleanRule({ id: "rule-" + n, name: "", selector: "", shimmer: { on: true } }, 0);
    fx.cur.rules.push(r); fx.sel = fx.cur.rules.length - 1;
    updateBar(); renderFx();
    $("#fx-selector").focus();
  });
  $("#fx-rules").addEventListener("click", function (e) {
    var li = e.target.closest("[data-fx-i]"); if (!li) return;
    var i = parseInt(li.dataset.fxI, 10);
    if (e.target.closest("[data-fx-del]")) {
      var r = fx.cur.rules[i];
      if (!window.confirm("Remove the rule “" + (r.name || r.selector || "New rule") + "”?")) return;
      fx.cur.rules.splice(i, 1);
      if (fx.sel >= fx.cur.rules.length) fx.sel = fx.cur.rules.length - 1;
      updateBar(); renderFx(); return;
    }
    if (e.target.closest("[data-fx-pick]")) { fx.sel = i; renderFx(); }
  });
  $("#fx-rules").addEventListener("change", function (e) {
    if (!e.target.matches("[data-fx-on]")) return;
    var li = e.target.closest("[data-fx-i]"); fx.cur.rules[parseInt(li.dataset.fxI, 10)].enabled = e.target.checked;
    updateBar(); renderFx();
  });
  function fxRefreshRow() {
    var r = fxRule(), li = $('#fx-rules [data-fx-i="' + fx.sel + '"]'); if (!r || !li) return;
    li.querySelector("b").textContent = r.name || r.selector || "New rule";
    li.querySelector(".fx-rule-meta").innerHTML = "<code>" + esc(r.selector || "no selector yet") + "</code> · " + esc(fxSummary(r));
  }
  $("#fx-name").addEventListener("input", function () { var r = fxRule(); if (!r) return; r.name = this.value.replace(/[<>]/g, "").slice(0, 80); updateBar(); fxRefreshRow(); });
  $("#fx-selector").addEventListener("input", function () { var r = fxRule(); if (!r) return; r.selector = this.value.replace(/[<>{}]/g, "").slice(0, 300); updateBar(); fxCheckSelector(); fxRefreshRow(); });
  $("#fx-picks").addEventListener("click", function (e) {
    var b = e.target.closest("[data-fx-sel]"), r = fxRule(); if (!b || !r) return;
    r.selector = b.dataset.fxSel;
    if (!r.name) r.name = b.textContent;
    $("#fx-selector").value = r.selector; $("#fx-name").value = r.name;
    updateBar(); fxCheckSelector(); fxRefreshRow();
  });
  $("#fx-effects").addEventListener("input", function (e) {
    var t = e.target, eff = t.dataset.fxE, key = t.dataset.fxK; if (!eff) return;
    if (t.hasAttribute("data-fx-sprite")) return;
    if (key === "colors") {
      var list = $$('[data-fx-e="' + eff + '"][data-fx-k="colors"]').map(function (c) { return c.value; });
      fxSet(eff, "colors", list.join(", ")); fxRefreshRow(); return;
    }
    var v = t.type === "checkbox" ? t.checked : t.type === "range" ? parseFloat(t.value) : t.value;
    fxSet(eff, key, v);
    var out = t.parentElement.querySelector("output"), f = FX_FIELDS[eff] && FX_FIELDS[eff].filter(function (x) { return x[0] === key; })[0];
    if (out && f) out.textContent = f[2] === "range" ? fxFmt(f[3], fxRule()[eff][key]) : fxRule()[eff][key];
    if (key === "on") { t.closest(".fx-effect").classList.toggle("is-on", t.checked); fxRefreshRow(); }
  });
  $("#fx-effects").addEventListener("change", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-fx-sprite")) {
      var txt = t.parentElement.querySelector("input[type=text]");
      txt.hidden = !!t.value;
      if (t.value) { txt.value = t.value; fxSet("sprite", "url", t.value); } else txt.focus();
    }
  });
  $("#fx-sample").addEventListener("change", function () {
    var img = $("#fx-sample-img");
    if (img.__fxCtl) img.__fxCtl.destroy();
    img.onload = function () { img.onload = null; fxPreview(); };
    img.src = this.value;
  });
  $("#fx-bg").addEventListener("change", function () { $("#fx-stage").dataset.bg = this.value; });
  $("#fx-replay").addEventListener("click", fxPreview);

})();
