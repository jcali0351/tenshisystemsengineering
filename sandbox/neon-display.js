// Tenshi display detection (window.TenshiDisplay).
// Works out what kind of screen the visitor is on, so the hero game and the neon canvases can fit it:
//   - kind: "phone", "tablet", "laptop", "desktop" or "large" (big and 4K monitors), plus ultrawide and portrait
//   - touch or mouse, hover, pixel density, the screen's refresh rate (60, 120, 144 Hz...)
//   - a drawing quality ("high", "medium" or "low") from the device's power, Save-Data, and how smoothly it actually runs
// It sets classes on <html> (disp-phone, disp-touch, disp-q-low, disp-portrait, disp-ultrawide, disp-hidpi...) and fires
// a "tenshi:display" event whenever something changes (resize, rotation, a quality drop).
// Nothing leaves the browser. For testing: add ?display=low (or medium / high) to the address.
(function () {
  if (window.TenshiDisplay) return;
  const mq = q => window.matchMedia(q).matches;
  const nav = navigator, conn = nav.connection || {};
  const QUALITY = ["low", "medium", "high"];
  const PIXEL_CAP = { low: 1, medium: 1.5, high: 2 };                 // most canvas pixels per CSS pixel
  const PIXEL_BUDGET = { low: 1.2e6, medium: 2.4e6, high: 4.4e6 };    // most pixels in one full-screen canvas

  const forced = (new URLSearchParams(location.search).get("display") || "").toLowerCase();
  const cores = nav.hardwareConcurrency || 4, memory = nav.deviceMemory || 4;

  const D = {
    kind: "desktop", w: 0, h: 0, dpr: 1, touch: false, hover: true, portrait: false, ultrawide: false, hidpi: false,
    refreshHz: 60, lowPower: false, quality: "high", forced: QUALITY.includes(forced),

    // Canvas pixel ratio for a canvas of w x h CSS pixels: sharp, but never more pixels than the device can draw smoothly.
    pixelRatio(w = D.w, h = D.h) {
      const fit = Math.sqrt(PIXEL_BUDGET[D.quality] / Math.max(1, w * h));
      return Math.max(0.75, Math.min(D.dpr, PIXEL_CAP[D.quality], fit));
    },
    // How much to multiply particles and effects by.
    effects() { return { low: 0.45, medium: 0.7, high: 1 }[D.quality]; },
    // Glow (shadowBlur) is the most expensive thing canvases draw; weaker screens get less of it.
    glow() { return { low: 0.35, medium: 0.7, high: 1 }[D.quality]; },
    setQuality(q, why) {
      if (!QUALITY.includes(q) || q === D.quality) return;
      D.quality = q; D.qualityReason = why || "set"; apply(); emit();
    },
  };

  function measure() {
    D.w = window.innerWidth; D.h = window.innerHeight;
    D.dpr = window.devicePixelRatio || 1;
    D.touch = mq("(pointer: coarse)") || (!mq("(any-pointer: fine)") && nav.maxTouchPoints > 0);
    D.hover = mq("(hover: hover)");
    D.portrait = D.h > D.w;
    D.ultrawide = D.w / Math.max(1, D.h) >= 2.1;
    D.hidpi = D.dpr >= 1.5;
    const short = Math.min(D.w, D.h), long = Math.max(D.w, D.h);
    D.kind = short <= 520 && long <= 1000 ? "phone"
      : D.touch && long <= 1400 ? "tablet"
      : D.w >= 2200 ? "large"
      : D.w < 1500 ? "laptop" : "desktop";
  }

  function startQuality() {
    D.lowPower = !!conn.saveData || cores <= 2 || memory <= 2 || (D.touch && (cores <= 4 || memory <= 3));
    if (D.forced) D.quality = forced;
    else D.quality = D.lowPower ? "low" : D.kind === "phone" || D.kind === "tablet" ? "medium" : "high";
    D.qualityReason = D.forced ? "forced" : "device";
  }

  function apply() {
    const cl = document.documentElement.classList;
    for (const c of [...cl]) if (c.startsWith("disp-")) cl.remove(c);
    cl.add("disp-" + D.kind, "disp-q-" + D.quality, D.touch ? "disp-touch" : "disp-mouse", D.portrait ? "disp-portrait" : "disp-landscape");
    if (D.ultrawide) cl.add("disp-ultrawide");
    if (D.hidpi) cl.add("disp-hidpi");
  }
  const emit = () => window.dispatchEvent(new CustomEvent("tenshi:display", { detail: D }));

  measure(); startQuality(); apply();

  // Re-measure after resizing or rotating (once things settle).
  let t, settleUntil = 0;
  const changed = () => { clearTimeout(t); t = setTimeout(() => { measure(); apply(); emit(); settleUntil = performance.now() + 1500; }, 150); };
  window.addEventListener("resize", changed);
  window.addEventListener("orientationchange", changed);
  if (window.matchMedia) try { matchMedia(`(resolution: ${D.dpr}dppx)`).addEventListener("change", changed); } catch (e) { /* old browser */ }

  // Refresh rate and smoothness: watch frame times while the page is visible.
  // If frames keep running slow (under ~40 per second for 3 seconds), step the quality down one notch, never back up.
  // The first few seconds (page still loading) and the moments after a resize don't count.
  let last = 0, samples = [], slowFor = 0; settleUntil = performance.now() + 4000;
  function watch(now) {
    if (last && !document.hidden) {
      const dt = now - last;
      if (dt < 250) {
        samples.push(dt);
        if (samples.length === 90 && !D.measured) {
          const sorted = [...samples].sort((a, b) => a - b), mid = sorted[45];
          const hz = 1000 / mid, steps = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360];
          D.refreshHz = steps.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
          D.measured = true; document.documentElement.dataset.refresh = D.refreshHz;   // recorded only: nothing needs redrawing
        }
        if (samples.length > 90) samples.shift();
        slowFor = dt > 25 ? slowFor + dt : Math.max(0, slowFor - dt * 2);
        if (now < settleUntil) slowFor = 0;
        if (slowFor > 3000 && !D.forced && D.quality !== "low") {
          slowFor = 0; D.setQuality(QUALITY[QUALITY.indexOf(D.quality) - 1], "slow frames");
        }
      }
    }
    last = now;
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);
  document.addEventListener("visibilitychange", () => { last = 0; slowFor = 0; });

  window.TenshiDisplay = D;
})();
