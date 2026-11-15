/* Tenshi Editor (admin.html): a small CMS for the Tenshi Systems Engineering site.
   The site is static on GitHub Pages, so saving means committing changed files to the repository through the GitHub
   API, with the editor's own fine-grained key (Contents: read and write). The key stays in this browser.

   - Text: every word on the site lives in translations.js in ten languages. The editor changes single entries there
     (admin/tr.js) and, when the English changes, fills the other languages with Chrome's built-in translator on Save.
   - Pictures: replacing one overwrites the same file (resized and re-encoded in the browser). If the type changes
     (a photo over an SVG), the new file gets the new extension and every page and script that named the old file
     is updated in the same commit.
   - After a save, .github/workflows/cms-rebuild.yml rebuilds the generated pages and restamps assets. */
(function () {
  "use strict";

  var REPO = "jcali0351/tenshisystemsengineering", BRANCH = "main", API = "https://api.github.com";
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

  /* ------------------------------------------------------------------ key storage */
  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function getToken() { try { return (store("sessionStorage") || {}).getItem(KEY) || (store("localStorage") || {}).getItem(KEY) || ""; } catch (e) { return ""; } }
  function setToken(t, remember) {
    try { store("sessionStorage").setItem(KEY, t); } catch (e) {}
    try { if (remember) store("localStorage").setItem(KEY, t); else store("localStorage").removeItem(KEY); } catch (e) {}
  }
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
  function pendingCount() { return changedKeys().size + imgEdits.size; }
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
    signIn().then(function () { setToken(t, $("#ed-remember").checked); $("#ed-token").value = ""; })
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
    if (dlg.returnValue !== "ok" || !dlgPrepared) return;
    var old = imgEdits.get(dlgPath); if (old && old.url) URL.revokeObjectURL(old.url);
    imgEdits.set(dlgPath, dlgPrepared);
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
    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      job.langs.forEach(function (l) {
        chain = chain.then(function () {
          var waiting = setInterval(function () {
            if (dlProgress[l] != null && dlProgress[l] < 1) status("Getting " + LANG_NAMES[l] + "… " + Math.round(dlProgress[l] * 100) + "%");
          }, 500);
          return translators[l].then(function (tr) { clearInterval(waiting); return tr; });
        }).then(function (tr) {
          if (!tr) { missing.add(l); return job.text; }
          return timeout(tr.translate(job.text), 20000, null).then(function (o) {
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
      imgEdits.forEach(function (r, p) { if (r.newPath !== p) { tree.delete(p); } tree.set(r.newPath, { sha: "saved" + Date.now(), size: r.blob.size }); });
      imgEdits.clear();
      updateBar(); renderImages(); renderText();
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
    }).then(function () { return { changes: changes, summary: parts.join(", ") || "edit" }; });
  }

  /* Discard */
  $("#ed-discard").addEventListener("click", function () {
    if (!window.confirm("Throw away all unsaved changes?")) return;
    pend = {}; autoTr = {}; manual.clear();
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
    bodySpacing: "em", motionDistance: "px", motionDistanceMobile: "px", charDelay: "ms", motionSpeed: "×", colorDuration: "s" };
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
    $$("#dz-form [data-k^=motion]:not([data-k=motion]), #dz-form [data-k=charDelay], #dz-form [data-k=colorDuration]").forEach(function (el) { el.disabled = !dz.cur.motion; });
    $("#dz-save").disabled = JSON.stringify(dz.cur) === JSON.stringify(dz.saved);
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
      dzShow(); dzLoadFrame();
    }).catch(function (e) { $("#dz-msg").className = "ed-msg err"; $("#dz-msg").textContent = "Couldn't load the design settings: " + e.message; });
  }
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
    if (/^motion|charDelay|colorDuration/.test(k)) { clearTimeout(dz.replay); dz.replay = setTimeout(dzLoadFrame, 700); }
  });
  $("#dz-page").addEventListener("change", dzLoadFrame);
  $("#dz-replay").addEventListener("click", dzLoadFrame);
  $("#dz-width").addEventListener("change", function () { $("#dz-frame").style.width = this.value; });
  $("#dz-reset").addEventListener("click", function () {
    dz.cur = TH.clean({}); dzShow(); dzLive(); dzLoadFrame();
    $("#dz-msg").className = "ed-msg"; $("#dz-msg").textContent = "Defaults loaded. Save to put them on the site.";
  });
  $("#dz-save").addEventListener("click", function () {
    var btn = this, msg = $("#dz-msg");
    busy(btn, true, "Saving…");
    commit([{ path: "site-theme.css", text: TH.css(dz.cur, dz.fonts) }], "Design: update fonts, typography, colors and motion").then(function () {
      dz.saved = JSON.parse(JSON.stringify(dz.cur));
      busy(btn, false); dzShow();
      msg.className = "ed-msg ok"; msg.textContent = "Saved. The live site shows the new design in about a minute.";
      toast("Design saved.");
    }).catch(function (e) { busy(btn, false); msg.className = "ed-msg err"; msg.textContent = e.message; });
  });
})();
