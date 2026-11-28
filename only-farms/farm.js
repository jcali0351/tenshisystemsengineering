// Only Farms: builds the sections and the gallery from photos.json (made by tools/only-farms.py from the stock library).
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // the phone menu
  const btn = $(".menu-btn"), nav = $("#nav");
  btn.addEventListener("click", () => { const o = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
  nav.addEventListener("click", (e) => { if (e.target.tagName === "A") { nav.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); } });

  const KINDS = [
    { id: "field", name: "In the field", text: "Ploughing, tilling, planting and spraying", cover: "farmer-and-tractor-tilling-soil-be5bbfbb.webp" },
    { id: "harvest", name: "Hay & harvest", text: "Baling, haying and bringing it in", cover: "baling-small-square-bales-22228bdb.webp" },
    { id: "winter", name: "Winter work", text: "Snow ploughs, blowers and frosty mornings", cover: "david-brown-selectamatic-880-in-winter-97ff9334.webp" },
    { id: "vintage", name: "Vintage iron", text: "Farmall, Fordson, Allis, Massey Harris and more", cover: "field-marshall-tractor-green-at-rosudgeon-vintag-65114180.webp" },
    { id: "modern", name: "Modern machines", text: "Cabs, tracks, GPS and serious horsepower", cover: "kubota-tractor-in-a-grassy-field-332c3b75.webp" },
    { id: "shows", name: "Shows & rallies", text: "Tractor pulls, ploughing matches, farm shows", cover: "1920-moline-tractor-with-plough-e12d49b0.webp" },
    { id: "details", name: "Up close", text: "Grilles, badges, wheels and engines", cover: "pink-farmall-tractor-badge-and-grille-3430981b.webp" },
  ];
  const SEASONS = [
    { name: "Spring", text: "Ground is worked and seed goes in.", f: "farmer-and-tractor-planting-226fe511.webp" },
    { name: "Summer", text: "Hay is cut, rowed, baled and stacked.", f: "baling-hay-with-accumulator-f7d54c7d.webp" },
    { name: "Autumn", text: "Grain ripens and the harvest comes in.", f: "farm-equipment-hero-1-7f76c9c3.webp" },
    { name: "Winter", text: "The tractor clears the lane and feeds the stock.", f: "massey-ferguson-263as-in-the-snow-011e496f.webp" },
  ];
  const DECADES = ["1920-moline-tractor-with-plough", "1929-john-deere-tractor", "1930-farmall-regular", "1942-mccormick-deering-farmall-h",
    "1947-mccormick-farmall-cub", "1967-john-deere-model-4020", "deutz-d10006-1972", "massey-ferguson-274s-from-1985", "fendt-924-vario", "john-deere-8r-410", "2023-cox-farms-tractor"];
  const DECADE_LABEL = { "fendt-924-vario": "2000s", "john-deere-8r-410": "2020s" };

  let ALL = [], shown = [], limit = 0, kind = "all", query = "";
  const STEP = 36;

  // "All" opens on a varied mix (field and harvest scenes spread through), the same order every visit
  const mix = (rows) => rows.map((r, i) => [((i * 2654435761) >>> 0) % 1000 - (r.k.some((k) => k === "field" || k === "harvest") ? 300 : 0), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  fetch("photos.json").then((r) => r.json()).then((rows) => { ALL = mix(rows); start(); });

  function start() {
    const byFile = Object.fromEntries(ALL.map((r) => [r.f, r]));
    const count = (k) => ALL.filter((r) => r.k.includes(k)).length;
    $("[data-count=photos]").textContent = ALL.length;
    $("[data-count=makes]").textContent = new Set(ALL.map((r) => r.m).filter(Boolean)).size;

    $("#kindCards").innerHTML = KINDS.filter((k) => k.id !== "details").slice(0, 6).map((k) =>
      `<a class="card" href="#gallery" data-kind="${k.id}"><img src="thumbs/${k.cover}" alt="" loading="lazy"><span class="n">${count(k.id)} photos</span><div><h3>${k.name}</h3><p>${k.text}</p></div></a>`).join("");
    $("#kindCards").addEventListener("click", (e) => { const a = e.target.closest("[data-kind]"); if (a) setKind(a.dataset.kind); });

    $("#seasonCards").innerHTML = SEASONS.map((s) => `<div class="season"><img src="thumbs/${s.f}" alt="${esc(byFile[s.f]?.t || s.name)}" loading="lazy"><div><h3>${s.name}</h3><p>${s.text}</p></div></div>`).join("");

    const tl = DECADES.map((p) => ALL.find((r) => r.f.startsWith(p))).filter(Boolean);
    $("#timeline").innerHTML = tl.map((r, i) => {
      const key = DECADES.find((p) => r.f.startsWith(p));
      const when = DECADE_LABEL[key] || r.y || "";
      const name = r.t.replace(/^\d{4}\s+/, "").replace(/\s+(from\s+)?\d{4}(\s+\d+\s*PS)?$/i, "");
      return `<button class="tl" data-f="${r.f}"><img src="thumbs/${r.f}" alt="" loading="lazy"><div><b>${when}</b><span>${esc(name)}</span></div></button>`;
    }).join("");
    $("#timeline").addEventListener("click", (e) => { const b = e.target.closest(".tl"); if (b) openLb(tl, tl.findIndex((r) => r.f === b.dataset.f)); });

    const chips = [{ id: "all", name: "All" }, ...KINDS];
    $("#chips").innerHTML = chips.map((c) => `<button class="chip" data-kind="${c.id}" aria-pressed="${c.id === "all"}">${c.name}<small>${c.id === "all" ? ALL.length : count(c.id)}</small></button>`).join("");
    $("#chips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) setKind(c.dataset.kind, true); });
    let t; $("#q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim().toLowerCase(); render(true); }, 160); });
    $("#more").addEventListener("click", () => { limit += STEP * 2; draw(); });

    $("#credits").innerHTML = ALL.filter((r) => r.credit).map((r) => `<li>${esc(r.t)}: ${esc(r.by || "unknown")}, <a href="${esc(r.licUrl)}" rel="noopener license">${esc(r.lic)}</a>${r.src ? `, <a href="${esc(r.src)}" rel="noopener">source</a>` : ""}</li>`).join("");
    render(true);
  }

  function setKind(k, stay) {
    kind = k;
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.kind === k));
    render(true);
    if (!stay) $("#gallery").scrollIntoView({ behavior: "smooth" });
  }

  function render(reset) {
    const words = query.split(/\s+/).filter(Boolean);
    shown = ALL.filter((r) => (kind === "all" || r.k.includes(kind)) &&
      words.every((w) => (r.t + " " + r.m + " " + r.k.join(" ") + " " + (r.y || "")).toLowerCase().includes(w)));
    if (reset) { limit = STEP; $("#grid").innerHTML = ""; }
    draw();
  }

  function draw() {
    const grid = $("#grid"), have = grid.children.length, upto = Math.min(limit, shown.length);
    const html = [];
    for (let i = have; i < upto; i++) {
      const r = shown[i];
      html.push(`<button class="ph" data-i="${i}" style="aspect-ratio:${r.w}/${r.h}"><img src="thumbs/${r.f}" alt="${esc(r.t)}" loading="lazy" width="${r.w}" height="${r.h}" onload="this.classList.add('in')"><span>${esc(r.t)}</span></button>`);
    }
    grid.insertAdjacentHTML("beforeend", html.join(""));
    $("#count").textContent = shown.length ? `Showing ${upto} of ${shown.length} photos` : "No tractors match that. Try another word.";
    $("#more").hidden = upto >= shown.length;
  }
  $("#grid").addEventListener("click", (e) => { const b = e.target.closest(".ph"); if (b) openLb(shown, +b.dataset.i); });

  // the photo viewer
  const lb = $("#lb"); let list = [], at = 0, back = null;
  function openLb(l, i) { list = l; at = i; back = document.activeElement; lb.hidden = false; document.body.style.overflow = "hidden"; showLb(); $("#lbX").focus(); }
  function closeLb() { lb.hidden = true; document.body.style.overflow = ""; back?.focus?.(); }
  function showLb() {
    const r = list[at];
    $("#lbImg").src = "photos/" + r.f; $("#lbImg").alt = r.t;
    $("#lbTitle").textContent = r.t;
    $("#lbCredit").innerHTML = `Photo: ${esc(r.by || "unknown")} · ${r.licUrl ? `<a href="${esc(r.licUrl)}" target="_blank" rel="noopener license">${esc(r.lic)}</a>` : esc(r.lic)}${r.src ? ` · <a href="${esc(r.src)}" target="_blank" rel="noopener">source</a>` : ""} · ${at + 1} of ${list.length}`;
    [at - 1, at + 1].forEach((j) => { const n = list[(j + list.length) % list.length]; if (n) new Image().src = "photos/" + n.f; });
  }
  const step = (d) => { at = (at + d + list.length) % list.length; showLb(); };
  $("#lbX").onclick = closeLb; $("#lbPrev").onclick = () => step(-1); $("#lbNext").onclick = () => step(1);
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
  addEventListener("keydown", (e) => { if (lb.hidden) return; if (e.key === "Escape") closeLb(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  let sx = null;
  lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); sx = null; });
})();
