/* ai-assist.js: "✨ Help me write" under the builder's text boxes. Loaded only when the site has an AI key
   (ai_assist.py). The suggestion is shown first; it goes into the box only when the editor clicks "Use this". */
(function () {
  "use strict";
  var root = document.getElementById("builder");
  if (!root) return;
  var site = root.getAttribute("data-site");
  var ACTIONS = [["improve", "Improve it"], ["shorter", "Make it shorter"], ["longer", "Make it longer"], ["friendlier", "Friendlier"],
                 ["formal", "More professional"], ["fix", "Fix spelling & grammar"], ["draft", "Write it from my notes"]];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function attach(ta) {
    if (ta.dataset.ai || ta.classList.contains("code") || ta.id === "p-seo-desc") return;
    ta.dataset.ai = "1";
    var bar = document.createElement("div");
    bar.className = "ai-bar";
    bar.innerHTML = '<button type="button" class="btn btn-small ai-open">✨ Help me write</button>';
    ta.insertAdjacentElement("afterend", bar);
    bar.querySelector(".ai-open").addEventListener("click", function (e) { e.preventDefault(); open(ta, bar); });
  }

  function open(ta, bar) {
    if (bar.querySelector(".ai-pop")) return;
    var label = ((ta.closest("label") || {}).querySelector || function () { return null; }).call(ta.closest("label") || document, "span");
    var pop = document.createElement("div");
    pop.className = "ai-pop";
    pop.innerHTML = '<div class="ai-row"><select class="ai-act">' + ACTIONS.map(function (a) { return '<option value="' + a[0] + '">' + esc(a[1]) + "</option>"; }).join("") +
      '</select><button type="button" class="btn btn-small btn-primary ai-go">Suggest</button><button type="button" class="btn btn-small ai-x" aria-label="Close">✕</button></div>' +
      '<input type="text" class="ai-notes" placeholder="Notes for the AI (optional), e.g. mention free parking" maxlength="1000">' +
      '<div class="ai-out" hidden></div><small class="ai-msg">Suggestions are only shown: nothing changes until you click “Use this”.</small>';
    bar.appendChild(pop);
    var out = pop.querySelector(".ai-out"), msg = pop.querySelector(".ai-msg"), go = pop.querySelector(".ai-go");
    pop.querySelector(".ai-x").addEventListener("click", function (e) { e.preventDefault(); pop.remove(); });
    go.addEventListener("click", function (e) {
      e.preventDefault();
      go.disabled = true; msg.textContent = "Writing…"; out.hidden = true;
      fetch("/api/sites/" + site + "/ai/write", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Tenshi": "1" },
        body: JSON.stringify({ text: ta.value, action: pop.querySelector(".ai-act").value, notes: pop.querySelector(".ai-notes").value,
                               field: label ? label.textContent : "" })
      }).then(function (r) { return r.json().then(function (j) { return [r.ok, j]; }); }).then(function (res) {
        go.disabled = false;
        if (!res[0]) { msg.textContent = res[1].error || res[1].detail || "That didn't work. Try again."; return; }
        out.hidden = false;
        out.innerHTML = '<p class="ai-text"></p><div class="ai-row"><button type="button" class="btn btn-small btn-primary ai-use">Use this</button>' +
          '<button type="button" class="btn btn-small ai-again">Try again</button><button type="button" class="btn btn-small ai-drop">Discard</button></div>';
        out.querySelector(".ai-text").textContent = res[1].text;
        msg.textContent = "Check it before you use it: AI can get facts wrong.";
        out.querySelector(".ai-use").addEventListener("click", function (ev) {
          ev.preventDefault(); ta.value = res[1].text; ta.dispatchEvent(new Event("input", { bubbles: true })); pop.remove();
        });
        out.querySelector(".ai-again").addEventListener("click", function (ev) { ev.preventDefault(); go.click(); });
        out.querySelector(".ai-drop").addEventListener("click", function (ev) { ev.preventDefault(); pop.remove(); });
      }).catch(function () { go.disabled = false; msg.textContent = "Couldn't reach the server. Try again."; });
    });
  }

  function scan() { Array.prototype.forEach.call(root.querySelectorAll("textarea"), attach); }
  scan();
  new MutationObserver(scan).observe(root, { childList: true, subtree: true });
})();
