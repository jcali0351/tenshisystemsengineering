/* =====================================================================================================================
   THE TENSHI LAUNCH SEQUENCE  (launch.html)

   What this file does, top to bottom:
     1. Settings you might want to change
     2. Little helpers
     3. The designs (read from the page, which got them from data/templates.json)
     4. Moving between screens (welcome → step 1 → step 2 → step 3 → deploying → done)
     5. Checking the answers on each step
     6. The logo drop zone
     7. Step 3: recommending a design, the preview picture and the web address
     8. Turning the answers into one "business profile" (the Business Data Engine's shape)
     9. Deploy now
    10. Remembering unfinished answers, and starting up

   The words on the screens are in tools/build-pages.mjs (search for "Launch: the Tenshi Launch Sequence").
   The look is in launch.css. Nothing here needs a build step: edit, save, refresh.
   ===================================================================================================================== */
(function () {
  "use strict";

  /* ---------- 1. Settings ---------- */

  // When the Tenshi platform server exists, put its address here, e.g. "https://api.tenshisystems.com/deployments".
  // Deploy now will then send the business profile there, and the server answers with the new site's admin address,
  // e.g. { "admin_url": "https://johnsplumbing.tenshisystems.com/admin" }, and the visitor is taken straight there.
  // While it is empty, Deploy now prepares a launch request that the visitor emails to the Tenshi team.
  var LAUNCH_ENDPOINT = "https://cms.tenshisystems.com/api/launch";

  // Where launch requests go by email. app.js already has the address (CONTACT_EMAIL), so use that when it exists.
  var TEAM_EMAIL = (typeof CONTACT_EMAIL !== "undefined" && CONTACT_EMAIL) || "tenshisystemsengineering@gmail.com";

  var BASE_DOMAIN = "tenshisystems.com";       // every site gets <name>.tenshisystems.com
  var LOGO_MAX_BYTES = 2 * 1024 * 1024;     // 2 MB
  var DRAFT_KEY = "tenshi-launch-draft";    // where unfinished answers are kept in this browser

  /* ---------- 2. Little helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var stillPlease = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wait = function (ms) { return new Promise(function (done) { setTimeout(done, stillPlease ? 0 : ms); }); };
  // Make text safe to put inside HTML (so a business called "<b>Joe's</b>" shows exactly that, not bold text)
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  var root = $(".lx");
  if (!root) return;                         // not the Launch page
  var form = $(".lx-form", root);
  var panels = $$(".lx-panel", root);
  var progress = $(".lx-progress", root);

  // Fill the screen exactly under the sticky header
  var header = $(".site-header");
  var fitHeight = function () { if (header) root.style.setProperty("--header-h", header.offsetHeight + "px"); };
  window.addEventListener("resize", fitHeight);
  fitHeight();

  /* ---------- 3. The designs ---------- */
  var DATA = { groups: [], templates: [] };
  try { DATA = JSON.parse($("#tpl-data").textContent); } catch (e) { /* no designs on the page: the wizard still works */ }
  var TEMPLATES = DATA.templates || [];
  var templateById = function (id) { return TEMPLATES.filter(function (t) { return t.id === id; })[0]; };

  /* ---------- 4. Moving between screens ---------- */
  // Steps: 0 welcome, 1 business, 2 profile, 3 launch preview, 4 deploying, 5 done
  var current = 0;

  function show(step) {
    if (step === current) return;
    var from = panels[current], to = panels[step];
    var forward = step > current;

    // The old panel slides out, the new one slides in
    if (from) {
      from.classList.remove("is-entering", "from-left");
      from.classList.add("is-leaving");
      from.classList.toggle("to-right", !forward);
      setTimeout(function () { from.hidden = true; from.classList.remove("is-leaving", "to-right"); }, stillPlease ? 0 : 340);
    }
    to.hidden = false;
    to.classList.remove("is-entering", "from-left");
    void to.offsetWidth;                                  // restart the animation
    to.classList.add("is-entering");
    to.classList.toggle("from-left", !forward);
    current = step;

    // Progress bar: shown for steps 1-3 only
    progress.hidden = !(step >= 1 && step <= 3);
    $(".lx-step-n", progress).textContent = Math.min(Math.max(step, 1), 3);
    $$(".lx-progress-bar li", progress).forEach(function (li) {
      var n = +li.getAttribute("data-for");
      li.classList.toggle("is-done", n < step);
      li.classList.toggle("is-current", n === step);
    });

    if (step === 3) prepareStep3();

    // Move keyboard and screen-reader focus to the new screen's title, and scroll to the top
    var title = $("h1, h2", to);
    window.scrollTo({ top: 0, behavior: stillPlease ? "auto" : "smooth" });
    if (title) setTimeout(function () { title.focus({ preventScroll: true }); }, stillPlease ? 0 : 120);
  }

  $(".lx-start", root).addEventListener("click", function () { show(1); });
  $$(".lx-back", root).forEach(function (b) { b.addEventListener("click", function () { show(current - 1); }); });
  $$(".lx-next", root).forEach(function (b) {
    b.addEventListener("click", function () { if (checkStep(current)) show(current + 1); });
  });
  // Pressing Enter in a one-line box means Continue (not "submit the whole form")
  form.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT" || e.target.type === "file") return;
    e.preventDefault();
    if (current === 3) form.requestSubmit ? form.requestSubmit() : deploy();
    else if (current >= 1 && current <= 2 && checkStep(current)) show(current + 1);
  });

  /* ---------- 5. Checking the answers on each step ---------- */
  var RULES = {
    "lx-name": function (v) { return v.trim().length >= 2 || "Please enter your business name."; },
    "lx-category": function (v) { return !!v || "Please choose a category."; },
    "lx-goal": function (v) { return !!v || "Please choose what your website is for."; },
    "lx-email": function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || "Please enter an email address like name@example.com."; },
    "lx-phone": function (v) { return !v.trim() || /^[+()\-.\s\d]{6,}$/.test(v.trim()) || "That doesn't look like a phone number."; },
    "lx-desc": function (v) { return v.trim().length >= 20 || "Tell us a little more: at least a sentence or two."; },
    "lx-sub": function (v) { return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(v) || "Use 3 to 40 letters, numbers or dashes (no dash at the start or end)."; },
  };

  // Show or clear one box's error message. Returns true when the answer is fine.
  function checkBox(input) {
    var rule = RULES[input.id];
    if (!rule) return true;
    var result = rule(input.value || "");
    var ok = result === true;
    var msg = $("#" + input.id + "-error");
    input.setAttribute("aria-invalid", String(!ok));
    var describedBy = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    if (!ok && describedBy.indexOf(input.id + "-error") < 0) input.setAttribute("aria-describedby", describedBy.concat(input.id + "-error").join(" "));
    if (msg) msg.textContent = ok ? "" : result;
    return ok;
  }

  // The business type tiles (one must be picked)
  function checkType() {
    var picked = $('input[name="company.type"]:checked', form);
    $("#lx-type-error").textContent = picked ? "" : "Please pick the one that fits best.";
    return !!picked;
  }

  // Social links are optional, but if one is filled in it should be a web address
  function checkSocial() {
    var bad = $$(".lx-social input", form).filter(function (i) { return i.value.trim() && !/^https?:\/\/\S+\.\S+/.test(i.value.trim()); });
    $$(".lx-social input", form).forEach(function (i) { i.setAttribute("aria-invalid", String(bad.indexOf(i) >= 0)); });
    $("#lx-social-error").textContent = bad.length ? "Social links should start with https://" : "";
    return !bad.length;
  }

  // Check everything on one step; jump to the first problem
  function checkStep(step) {
    var panel = panels[step];
    var boxes = $$("input, select, textarea", panel).filter(function (i) { return RULES[i.id]; });
    var problems = boxes.filter(function (i) { return !checkBox(i); });
    if (step === 1 && !checkType()) problems.push($("#lx-type"));
    if (step === 2 && !checkSocial()) problems.push($$(".lx-social input[aria-invalid=true]", form)[0]);
    if (problems.length) { problems[0].focus(); return false; }
    return true;
  }

  // Re-check a box when the visitor leaves it, and as they type once it has shown an error
  form.addEventListener("focusout", function (e) { if (RULES[e.target.id] && e.target.value) checkBox(e.target); });
  form.addEventListener("input", function (e) {
    if (e.target.getAttribute("aria-invalid") === "true" && RULES[e.target.id]) checkBox(e.target);
    saveDraft();
  });
  form.addEventListener("change", function (e) { if (e.target.name === "company.type") checkType(); saveDraft(); });

  /* ---------- 6. The logo drop zone ---------- */
  var logo = null;                                     // { name, type, dataUrl } once chosen
  var drop = $(".lx-drop", root), fileInput = $("#lx-logo"), logoImg = $(".lx-logo-preview", root), logoClear = $(".lx-logo-clear", root);

  function useLogo(file) {
    var err = $("#lx-logo-error");
    err.textContent = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { err.textContent = "Please choose a PNG, JPG, WebP or SVG picture."; return; }
    if (file.size > LOGO_MAX_BYTES) { err.textContent = "That file is over 2 MB. Please choose a smaller one."; return; }
    var reader = new FileReader();
    reader.onload = function () { logo = { name: file.name, type: file.type, dataUrl: reader.result }; showLogo(); saveDraft(); };
    reader.readAsDataURL(file);
  }
  function showLogo() {
    logoImg.hidden = !logo;
    logoClear.hidden = !logo;
    if (logo) logoImg.src = logo.dataUrl; else logoImg.removeAttribute("src");
  }
  fileInput.addEventListener("change", function () { useLogo(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove("is-over"); }); });
  drop.addEventListener("drop", function (e) { e.preventDefault(); useLogo(e.dataTransfer.files[0]); });
  logoClear.addEventListener("click", function () { logo = null; fileInput.value = ""; showLogo(); saveDraft(); });

  /* ---------- 7. Step 3: recommending a design, the preview picture and the web address ---------- */
  var templateSelect = $(".lx-template", root);
  var subInput = $("#lx-sub");
  var chosenByVisitor = false;      // true once they pick a design themselves (or arrive with ?template=)
  var subEdited = false;            // true once they type their own web address

  // Fill the design list once
  TEMPLATES.forEach(function (t) {
    var o = document.createElement("option");
    o.value = t.id; o.textContent = t.name;
    templateSelect.appendChild(o);
  });
  templateSelect.addEventListener("change", function () { chosenByVisitor = true; drawPreview(); saveDraft(); });

  // Pick the design that best fits their category and goal:
  // a design that matches both wins, then one that matches the category, then the goal, then Tenshi Corporate.
  function recommend(category, goal) {
    var both = TEMPLATES.filter(function (t) { return t.categories.indexOf(category) >= 0 && t.goals.indexOf(goal) >= 0; });
    var cat = TEMPLATES.filter(function (t) { return t.categories.indexOf(category) >= 0; });
    var gol = TEMPLATES.filter(function (t) { return t.goals.indexOf(goal) >= 0; });
    var best = both[0] || cat[0] || gol[0] || templateById("corporate") || TEMPLATES[0];
    return best ? best.id : "";
  }

  // "Johnson's Plumbing & Heating" → "johnsons-plumbing-heating"
  function slugify(name) {
    var s = String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/&/g, " ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
    return s.length >= 3 ? s : (s + "-site").replace(/^-/, "");
  }
  subInput.addEventListener("input", function () {
    subEdited = true;
    // Tidy as they type: lowercase, spaces become dashes, anything else is dropped
    var tidy = subInput.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (tidy !== subInput.value) subInput.value = tidy;
    $$(".lx-sum-domain", root).forEach(function (el) { el.textContent = tidy + "." + BASE_DOMAIN; });
    drawPreview();
  });

  function prepareStep3() {
    var name = $("#lx-name").value.trim();
    $(".lx-sum-name", root).textContent = name;
    var rec = recommend($("#lx-category").value, $("#lx-goal").value);
    if (!chosenByVisitor && rec) templateSelect.value = rec;
    $(".lx-recommended", root).hidden = templateSelect.value !== rec;
    if (!subEdited || !subInput.value) subInput.value = slugify(name);
    drawPreview();
  }

  // The preview picture: the chosen design, drawn in its colours, with their name (or logo) and a headline
  function drawPreview() {
    var t = templateById(templateSelect.value);
    var box = $(".lx-preview", root);
    $(".lx-recommended", root).hidden = templateSelect.value !== recommend($("#lx-category").value, $("#lx-goal").value);
    if (!t) { box.innerHTML = ""; return; }
    var name = $("#lx-name").value.trim() || t.sample;
    var firstSentence = ($("#lx-desc").value.trim().split(/(?<=[.!?])\s/)[0] || t.headline).slice(0, 70);
    var brand = logo ? '<img class="tpl-logo-img" src="' + esc(logo.dataUrl) + '" alt="">' : "";
    box.innerHTML =
      '<div class="tpl-mock tpl-' + esc(t.style) + '" style="--p:' + esc(t.colors.primary) + ";--a:" + esc(t.colors.accent) + ";--s:" + esc(t.colors.surface) + ";--i:" + esc(t.colors.ink) + '">' +
        '<div class="tpl-chrome"><span></span><span></span><span></span><i>' + esc(subInput.value || "yourname") + "." + BASE_DOMAIN + "</i></div>" +
        '<div class="tpl-site">' +
          '<div class="tpl-nav">' + brand + '<b class="tpl-logo">' + esc(name) + '</b><span class="tpl-links"><span></span><span></span><span></span></span><span class="tpl-cta"></span></div>' +
          '<div class="tpl-hero"><strong class="tpl-head">' + esc(firstSentence) + '</strong><span class="tpl-sub"></span><span class="tpl-btn"></span></div>' +
          '<div class="tpl-tiles"><span></span><span></span><span></span></div>' +
        "</div>" +
      "</div>";
  }

  /* ---------- 8. Turning the answers into one business profile ----------
     Every Tenshi design reads this same shape (the Business Data Engine; see docs/ARCHITECTURE.md and
     platform/schema/business.schema.json). The design is only how it looks; this is the business itself. */
  function buildProfile() {
    var val = function (id) { return ($("#" + id) || {}).value ? $("#" + id).value.trim() : ""; };
    var opt = function (id) { var s = $("#" + id); return s && s.selectedIndex > 0 ? s.options[s.selectedIndex].text : ""; };
    var social = {};
    $$(".lx-social input", form).forEach(function (i) { if (i.value.trim()) social[i.name.split(".")[1]] = i.value.trim(); });
    var type = $('input[name="company.type"]:checked', form);
    var description = val("lx-desc");
    var name = val("lx-name");
    var sub = subInput.value;

    return {
      schema: "tenshi.business/1",
      created_at: new Date().toISOString(),
      company: {
        name: name,
        category: val("lx-category"),
        category_label: opt("lx-category"),
        type: type ? type.value : "",
        phone: val("lx-phone"),
        email: val("lx-email"),
        address: val("lx-address"),
        service_areas: val("lx-areas").split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        description: description,
        logo: logo ? { filename: logo.name, type: logo.type, data_url: logo.dataUrl } : null,
      },
      site: {
        goal: val("lx-goal"),
        template: templateSelect.value,
        subdomain: sub,
        domain: sub + "." + BASE_DOMAIN,
      },
      // These lists start empty: the visitor fills them in their Control Center after launch
      services: [], products: [], staff: [], gallery: [], portfolio: [], testimonials: [],
      social: social,
      seo: {
        title: name + (opt("lx-category") ? " | " + opt("lx-category") : ""),
        description: description.length > 155 ? description.slice(0, 152).replace(/\s+\S*$/, "") + "…" : description,
      },
    };
  }

  /* ---------- 9. Deploy now ---------- */
  var deploying = false;
  form.addEventListener("submit", function (e) { e.preventDefault(); deploy(); });

  // The steps shown while launching. With a server (LAUNCH_ENDPOINT) these are what it does;
  // without one, the list says honestly what happens: the request is prepared and the team does the setup.
  var TASKS_SERVER = ["Creating your client account", "Creating your deployment record", "Reserving {domain}", "Setting up your content manager",
    "Creating your media storage", "Building your pages from your business profile", "Connecting your address and security certificate", "Opening your Control Center"];
  var TASKS_REQUEST = ["Building your business profile", "Matching your design", "Checking {domain}", "Preparing your launch request"];

  async function deploy() {
    if (deploying) return;
    if (!checkStep(1)) { show(1); return; }
    if (!checkStep(2)) { show(2); return; }
    if (!checkStep(3)) return;
    deploying = true;
    var profile = buildProfile();
    $$(".lx-sum-domain", root).forEach(function (el) { el.textContent = profile.site.domain; });
    $$(".lx-sum-email", root).forEach(function (el) { el.textContent = profile.company.email; });
    show(4);

    var list = $(".lx-tasks", root);
    var tasks = (LAUNCH_ENDPOINT ? TASKS_SERVER : TASKS_REQUEST).map(function (t) { return t.replace("{domain}", profile.site.domain); });
    list.innerHTML = tasks.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var items = $$("li", list);

    // With a server: send the profile while the list ticks along
    var request = LAUNCH_ENDPOINT
      ? fetch(LAUNCH_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      : Promise.resolve(null);

    for (var i = 0; i < items.length; i++) {
      items[i].classList.add("is-working");
      await wait(550 + Math.random() * 350);
      items[i].classList.remove("is-working");
      items[i].classList.add("is-done");
    }

    var result = null, failed = false;
    try { result = await request; } catch (err) { failed = true; }
    deploying = false;

    if (result && result.admin_url) {                 // the real platform: straight into their Control Center
      clearDraft();
      window.location.href = result.admin_url;
      return;
    }
    finish(profile, failed);
  }

  // The done screen: email the request to the team, or download the profile
  function finish(profile, serverFailed) {
    $(".lx-done-text", root).textContent = serverFailed
      ? "Our launch server didn't answer just now, so nothing was set up yet. Send your request by email instead and we'll take it from here."
      : "Send it to the Tenshi team with the button below. We set up " + profile.site.domain + " and email your login. Your answers are kept in this browser until you send it.";

    // The email, line by line. null = leave the line out (an answer they skipped); "" = a blank line on purpose.
    var typeTile = $('input[name="company.type"]:checked + span b', form);
    var lines = [
      "LAUNCH REQUEST: " + profile.company.name,
      "",
      "Web address: " + profile.site.domain,
      "Design: " + ((templateById(profile.site.template) || {}).name || profile.site.template),
      "Category: " + profile.company.category_label,
      "Website goal: " + $("#lx-goal").options[$("#lx-goal").selectedIndex].text,
      "Business type: " + (typeTile ? typeTile.textContent : profile.company.type),
      "Email: " + profile.company.email,
      profile.company.phone ? "Phone: " + profile.company.phone : null,
      profile.company.address ? "Business address: " + profile.company.address : null,
      profile.company.service_areas.length ? "Service areas: " + profile.company.service_areas.join(", ") : null,
      "",
      "About the business:",
      profile.company.description,
      Object.keys(profile.social).length ? "" : null,
      Object.keys(profile.social).length ? "Social: " + Object.keys(profile.social).map(function (k) { return k + " " + profile.social[k]; }).join(" · ") : null,
      profile.company.logo ? "" : null,
      profile.company.logo ? "Logo: I'll attach " + profile.company.logo.filename + " to this email." : null,
    ].filter(function (l) { return l !== null; });
    $(".lx-mail", root).href = "mailto:" + TEAM_EMAIL +
      "?subject=" + encodeURIComponent("Launch request: " + profile.company.name + " (" + profile.site.domain + ")") +
      "&body=" + encodeURIComponent(lines.join("\n"));
    $(".lx-mail", root).onclick = function () { clearDraft(); };

    $(".lx-download", root).onclick = function () {
      var blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = profile.site.subdomain + "-business-profile.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    show(5);
  }

  $(".lx-restart", root).addEventListener("click", function () {
    clearDraft();
    form.reset(); logo = null; showLogo(); chosenByVisitor = false; subEdited = false;
    $$("[aria-invalid]", form).forEach(function (i) { i.removeAttribute("aria-invalid"); });
    $$(".lx-error", form).forEach(function (e) { e.textContent = ""; });
    show(0);
  });

  /* ---------- 10. Remembering unfinished answers, and starting up ----------
     Answers are kept only in this browser (localStorage), so a refresh doesn't lose them. Nothing is sent anywhere
     until the visitor presses Deploy now and then sends the email. */
  function saveDraft() {
    try {
      var data = {};
      $$("input[name], select[name], textarea[name]", form).forEach(function (i) {
        if (i.type === "radio") { if (i.checked) data[i.name] = i.value; }
        else data[i.name] = i.value;
      });
      data._chosen = chosenByVisitor; data._subEdited = subEdited;
      if (logo && logo.dataUrl.length < 400000) data._logo = logo;   // small logos only
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch (e) { /* private browsing or storage full: fine, just not remembered */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* nothing to clear */ } }
  function loadDraft() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { data = null; }
    if (!data) return false;
    $$("input[name], select[name], textarea[name]", form).forEach(function (i) {
      if (!(i.name in data)) return;
      if (i.type === "radio") i.checked = data[i.name] === i.value;
      else i.value = data[i.name];
    });
    chosenByVisitor = !!data._chosen; subEdited = !!data._subEdited;
    if (data._logo) { logo = data._logo; showLogo(); }
    return true;
  }

  loadDraft();
  // Arriving from a Portfolio card (launch.html?template=restaurant): use that design
  var asked = new URLSearchParams(location.search).get("template");
  if (asked && templateById(asked)) { templateSelect.value = asked; chosenByVisitor = true; }
})();
