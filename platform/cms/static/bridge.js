/* =====================================================================================================================
   bridge.js: runs INSIDE the page builder's preview (only when the CMS adds ?edit=1). It makes the page itself the editor:
     - Click a block to select it. A small bar on the block moves it up or down, copies it, deletes it, or drags it.
     - Words marked data-edit can be clicked and typed over. Formatted text (data-rich) gets a formatting bar:
       bold, italic, underline, headings, lists, links. Pasted text arrives as plain words.
     - Drag from the builder's Blocks or Photos lists, or photos from your computer, straight onto the page:
       a line shows where a new block will go; dropping a photo on a picture replaces that picture.
     - Click a picture to choose another one.
     - Links and forms don't navigate away while editing.
     - The Theme panel's unsaved colours, fonts, corners and spacing are shown by swapping <style id="tenshi-tokens">.
   Everything it changes goes to the builder (builder.js) as a message; the builder keeps the page and saves it.
   ===================================================================================================================== */
(function () {
  "use strict";
  var parentWin = window.parent;
  if (!parentWin || parentWin === window) return;
  function send(msg) { msg.tenshi = msg.tenshi || "x"; parentWin.postMessage(msg, location.origin); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function blocks() { return $$(".tb-block"); }
  function blockOf(el) { return el && el.closest ? el.closest(".tb-block") : null; }
  function idOf(b) { return b ? b.getAttribute("data-block") : null; }

  /* ---------- 1. Words you can type over, and the formatting bar ---------- */
  var bar = document.createElement("div");
  bar.className = "tb-fmt"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Text formatting"); bar.hidden = true;
  var FMT = [["bold", "<b>B</b>", "Bold"], ["italic", "<i>I</i>", "Italic"], ["underline", "<u>U</u>", "Underline"], ["|"],
    ["h2", "H2", "Big heading"], ["h3", "H3", "Small heading"], ["p", "¶", "Normal text"], ["|"],
    ["insertUnorderedList", "•", "Bullet list"], ["insertOrderedList", "1.", "Numbered list"], ["blockquote", "❝", "Quote"], ["|"],
    ["link", "🔗", "Add a link"], ["unlink", "⛓̸", "Remove the link"], ["removeFormat", "✕", "Clear formatting"]];
  bar.innerHTML = FMT.map(function (f) {
    return f[0] === "|" ? '<span class="tb-sep"></span>' : '<button type="button" data-cmd="' + f[0] + '" title="' + f[2] + '" aria-label="' + f[2] + '">' + f[1] + "</button>";
  }).join("");
  document.body.appendChild(bar);
  var editing = null;
  function placeBar() {
    if (!editing) { bar.hidden = true; return; }
    var r = editing.getBoundingClientRect();
    bar.hidden = false;
    var top = r.top + scrollY - bar.offsetHeight - 8;
    if (top < scrollY + 4) top = r.bottom + scrollY + 8;
    bar.style.top = top + "px";
    bar.style.left = Math.max(6, Math.min(r.left + scrollX, scrollX + innerWidth - bar.offsetWidth - 6)) + "px";
  }
  bar.addEventListener("mousedown", function (e) { e.preventDefault(); });      // keep the text selected
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cmd]"); if (!b || !editing) return;
    var c = b.getAttribute("data-cmd");
    if (c === "h2" || c === "h3" || c === "p" || c === "blockquote") document.execCommand("formatBlock", false, "<" + c + ">");
    else if (c === "link") {
      var url = prompt("Link to (a web address like https://example.com, or a page like contact):", "https://");
      if (url && url !== "https://") document.execCommand("createLink", false, url.trim());
    } else document.execCommand(c, false, null);
    editing.dispatchEvent(new Event("input", { bubbles: true }));
  });

  $$(".tb-block [data-edit]").forEach(function (el) {
    var rich = el.hasAttribute("data-rich");
    el.setAttribute("contenteditable", rich ? "true" : "plaintext-only");
    el.setAttribute("spellcheck", "true");
    var timer;
    el.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        send({ tenshi: "edit", block: idOf(blockOf(el)), field: el.getAttribute("data-edit"),
               // textContent, not innerText: innerText would save "BUILT RIGHT" when the design only *shows* capitals
               value: rich ? el.innerHTML : el.textContent.replace(/\s+/g, " ").trim() });
      }, 300);
      if (rich) placeBar();
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !rich) { e.preventDefault(); el.blur(); }   // one line only
      if (rich && (e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) {
        e.preventDefault(); document.execCommand({ b: "bold", i: "italic", u: "underline" }[e.key.toLowerCase()]);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) e.stopPropagation();     // undo inside the words, not the page
    });
    el.addEventListener("paste", function (e) {                  // paste plain words, never another site's styling
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      if (text == null) return;
      e.preventDefault();
      document.execCommand("insertText", false, rich ? text : text.replace(/\s+/g, " "));
    });
    el.addEventListener("focus", function () { if (rich) { editing = el; placeBar(); } });
    el.addEventListener("blur", function () { if (editing === el) { editing = null; setTimeout(placeBar, 120); } });
  });
  addEventListener("scroll", placeBar, { passive: true });
  addEventListener("resize", placeBar);

  /* ---------- 2. The block bar: drag, up, down, copy, delete ---------- */
  var tools = document.createElement("div");
  tools.className = "tb-tools"; tools.hidden = true;
  tools.innerHTML = '<span class="tb-name"></span><button type="button" draggable="true" class="tb-drag" title="Drag to move" aria-label="Drag to move">⠿</button>' +
    '<button type="button" data-act="up" title="Move up" aria-label="Move up">↑</button><button type="button" data-act="down" title="Move down" aria-label="Move down">↓</button>' +
    '<button type="button" data-act="dup" title="Duplicate" aria-label="Duplicate">⧉</button><button type="button" data-act="del" title="Delete" aria-label="Delete">✕</button>';
  document.body.appendChild(tools);
  var toolsFor = null, selectedEl = null;
  function showTools(b) {
    if (!b) { if (selectedEl) b = selectedEl; else { tools.hidden = true; toolsFor = null; return; } }
    toolsFor = b;
    var r = b.getBoundingClientRect(), all = blocks(), i = all.indexOf(b);
    tools.querySelector(".tb-name").textContent = (b.getAttribute("data-label") || b.getAttribute("data-type") || "").replace(/_/g, " ");
    tools.querySelector('[data-act="up"]').disabled = i <= 0;
    tools.querySelector('[data-act="down"]').disabled = i >= all.length - 1;
    tools.hidden = false;
    tools.style.top = Math.max(scrollY + 4, r.top + scrollY + 6) + "px";
    tools.style.left = Math.max(6, r.right + scrollX - tools.offsetWidth - 8) + "px";
  }
  document.addEventListener("mouseover", function (e) {
    if (e.target.closest(".tb-tools, .tb-fmt")) return;
    var b = blockOf(e.target);
    if (b && b !== toolsFor) showTools(b);
  });
  addEventListener("scroll", function () { if (toolsFor) showTools(toolsFor); }, { passive: true });
  tools.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || !toolsFor) return;
    e.preventDefault(); e.stopPropagation();
    send({ tenshi: "block", act: b.getAttribute("data-act"), block: idOf(toolsFor) });
  });

  /* ---------- 3. Clicks: select a block, choose a picture; links don't navigate ---------- */
  function mediaTarget(el) {
    var b = blockOf(el); if (!b) return null;
    var slot = el.closest("[data-media]");
    if (slot && b.contains(slot)) return { block: idOf(b), field: slot.getAttribute("data-media") };
    var img = el.closest("img");
    if (img && b.contains(img)) return { block: idOf(b), index: $$("img", b).indexOf(img) };
    return null;
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest(".tb-tools, .tb-fmt")) return;
    var link = e.target.closest("a, button[type=submit]");
    if (link && !link.isContentEditable && !link.querySelector("[contenteditable]")) e.preventDefault();
    else if (link) e.preventDefault();
    var block = blockOf(e.target);
    if (!block) return;
    send({ tenshi: "select", block: idOf(block) });
    var pic = !e.target.closest("[data-edit]") && mediaTarget(e.target);
    if (pic && (e.target.tagName === "IMG" || e.target.closest(".tb-col-drop, [data-media]"))) send(Object.assign({ tenshi: "pick-media" }, pic));
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  /* ---------- 4. Drag and drop onto the page ---------- */
  var line = document.createElement("div"); line.className = "tb-line"; line.hidden = true; document.body.appendChild(line);
  var hot = null;
  function kindOf(dt) {
    var t = Array.prototype.slice.call(dt.types || []).map(function (x) { return String(x).toLowerCase(); });
    if (t.indexOf("application/x-tenshi-move") >= 0) return "move";
    if (t.indexOf("application/x-tenshi-block") >= 0) return "block";
    if (t.indexOf("application/x-tenshi-media") >= 0) return "media";
    if (t.indexOf("files") >= 0) return "files";
    return null;
  }
  function insertAt(y) {
    var all = blocks();
    for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return { i: i, y: r.top }; }
    var last = all[all.length - 1];
    return { i: all.length, y: last ? last.getBoundingClientRect().bottom : 40 };
  }
  function clearHot() { if (hot) hot.classList.remove("tb-hot"); hot = null; line.hidden = true; }
  var moving = null;
  tools.querySelector(".tb-drag").addEventListener("dragstart", function (e) {
    moving = idOf(toolsFor);
    e.dataTransfer.setData("application/x-tenshi-move", moving || "");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setDragImage(toolsFor, 20, 20); } catch (err) { /* older browsers */ }
  });
  document.addEventListener("dragend", function () { moving = null; clearHot(); });
  document.addEventListener("dragover", function (e) {
    var kind = kindOf(e.dataTransfer); if (!kind) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = kind === "move" ? "move" : "copy";
    if (kind === "media" || kind === "files") {
      var target = e.target.closest && (e.target.closest("[data-media]") || e.target.closest("img"));
      if (target && blockOf(target)) {
        if (hot !== target) { clearHot(); hot = target; hot.classList.add("tb-hot"); }
        return;
      }
    }
    if (hot) { hot.classList.remove("tb-hot"); hot = null; }
    var at = insertAt(e.clientY);
    line.hidden = false;
    line.style.top = (at.y + scrollY - 3) + "px";
    line.textContent = kind === "move" ? "Move here" : kind === "block" ? "Add the block here" : "Add the photo here";
  });
  document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) clearHot(); });
  document.addEventListener("drop", function (e) {
    var kind = kindOf(e.dataTransfer); if (!kind) return;
    e.preventDefault();
    var pic = hot ? mediaTarget(hot) : null;
    var at = insertAt(e.clientY).i;
    clearHot();
    var msg = { tenshi: "drop", what: kind, at: at };
    if (pic && (kind === "media" || kind === "files")) { msg.block = pic.block; msg.field = pic.field; msg.index = pic.index; }
    if (kind === "move") msg.value = e.dataTransfer.getData("application/x-tenshi-move") || moving;
    if (kind === "block") msg.value = e.dataTransfer.getData("application/x-tenshi-block");
    if (kind === "media") msg.value = e.dataTransfer.getData("application/x-tenshi-media");
    if (kind === "files") msg.files = Array.prototype.slice.call(e.dataTransfer.files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (kind === "files" && !msg.files.length) return;
    send(msg);
  });

  /* ---------- 5. Messages from the builder ---------- */
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data) return;
    var d = e.data;
    if (d.tenshi === "tokens") {           // the Theme panel's unsaved theme: swap the tokens style and the shape class
      var tag = document.getElementById("tenshi-tokens");
      if (!tag) { tag = document.createElement("style"); tag.id = "tenshi-tokens"; document.head.appendChild(tag); }
      tag.textContent = String(d.css || "");
      if (/^(clean|bold|elegant)$/.test(d.style || "")) document.body.className = document.body.className.replace(/\bstyle-\w+/g, "").trim() + " style-" + d.style;
    }
    if (d.tenshi === "scheme") {           // "Preview in" light or dark
      if (d.value === "light" || d.value === "dark") document.documentElement.setAttribute("data-theme", d.value);
      else document.documentElement.removeAttribute("data-theme");
    }
    if (d.tenshi === "labels" && d.labels) {    // the builder's names for each block type
      blocks().forEach(function (b) { var l = d.labels[b.getAttribute("data-type")]; if (l) b.setAttribute("data-label", l); });
      if (toolsFor) showTools(toolsFor);
    }
    if (d.tenshi === "highlight") {        // the selected block: outline it and bring it into view
      $$(".tb-block.tb-on").forEach(function (b) { b.classList.remove("tb-on"); });
      var el = d.block && document.querySelector('.tb-block[data-block="' + d.block + '"]');
      selectedEl = el || null;
      if (el) {
        el.classList.add("tb-on");
        var r = el.getBoundingClientRect();
        if (d.scroll !== false && (r.top < 0 || r.top > innerHeight - 80)) el.scrollIntoView({ behavior: "smooth", block: "start" });
        showTools(el);
      }
    }
  });
  send({ tenshi: "ready" });
})();
