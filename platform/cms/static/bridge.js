/* =====================================================================================================================
   bridge.js: runs INSIDE the page builder's preview (only when the CMS adds ?edit=1).
     - Clicking a block tells the builder to select it.
     - Words marked data-edit in the block templates can be clicked and typed over; the new words go to the builder,
       which saves them. Plain fields stay plain text; data-rich fields (the Text block) keep simple formatting.
     - Links and forms don't navigate away while editing.
     - The Theme panel's unsaved colours, fonts, corners and spacing are shown by swapping <style id="tenshi-tokens">.
   ===================================================================================================================== */
(function () {
  "use strict";
  var parentWin = window.parent;
  if (!parentWin || parentWin === window) return;
  function send(msg) { msg.tenshi = msg.tenshi || "x"; parentWin.postMessage(msg, location.origin); }

  // Make the marked words editable
  Array.prototype.forEach.call(document.querySelectorAll(".tb-block [data-edit]"), function (el) {
    el.setAttribute("contenteditable", el.hasAttribute("data-rich") ? "true" : "plaintext-only");
    el.setAttribute("spellcheck", "true");
    var timer;
    el.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var block = el.closest(".tb-block");
        send({ tenshi: "edit", block: block.getAttribute("data-block"), field: el.getAttribute("data-edit"),
               // textContent, not innerText: innerText would save "BUILT RIGHT" when the design only *shows* capitals
               value: el.hasAttribute("data-rich") ? el.innerHTML : el.textContent.replace(/\s+/g, " ").trim() });
      }, 300);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !el.hasAttribute("data-rich")) { e.preventDefault(); el.blur(); }   // one line only
    });
  });

  // Clicking a block selects it; links and buttons don't navigate while editing
  document.addEventListener("click", function (e) {
    var link = e.target.closest("a, button[type=submit]");
    if (link) e.preventDefault();
    var block = e.target.closest(".tb-block");
    if (block) send({ tenshi: "select", block: block.getAttribute("data-block") });
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);

  // The builder's Theme panel sends an unsaved theme: swap the tokens style and the shape class, no reload
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.tenshi !== "tokens") return;
    var tag = document.getElementById("tenshi-tokens");
    if (!tag) { tag = document.createElement("style"); tag.id = "tenshi-tokens"; document.head.appendChild(tag); }
    tag.textContent = String(e.data.css || "");
    if (/^(clean|bold|elegant)$/.test(e.data.style || "")) {
      document.body.className = document.body.className.replace(/\bstyle-\w+/g, "").trim() + " style-" + e.data.style;
    }
  });

  // The builder tells us which block is selected: outline it and bring it into view
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.tenshi !== "highlight") return;
    Array.prototype.forEach.call(document.querySelectorAll(".tb-block.tb-on"), function (b) { b.classList.remove("tb-on"); });
    var el = e.data.block && document.querySelector('.tb-block[data-block="' + e.data.block + '"]');
    if (el) {
      el.classList.add("tb-on");
      var r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight - 80) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
})();
