// neon-recolor-live.js: catches reds that the site's scripts add while the page runs (inline styles and <style> tags)
// and turns them purple, the same way make-recolor.py does for the stylesheets. Neon preview only.
(function () {
  if (document.documentElement.classList.contains("white")) return;   // white corporate theme: no neon extras (white-theme.js)
  const PURPLE_HUE = 270;
  const COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;

  // Turn one colour purple if it's a red (keeping its brightness and strength); leave anything else alone.
  function toPurple(text) {
    let r, g, b, alpha = null, isHex = text[0] === "#";
    if (isHex) {
      let h = text.slice(1);
      if (h.length === 3) h = h.split("").map(c => c + c).join("");
      [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      alpha = h.length === 8 ? h.slice(6) : "";
    } else {
      const n = text.match(/[\d.]+%?/g) || [];
      if (n.length < 3 || n.slice(0, 3).some(x => x.endsWith("%"))) return text;
      [r, g, b] = n.slice(0, 3).map(Number);
      alpha = n[3] ?? null;
    }
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
    if (d === 0) return text;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r / 255 ? ((g - b) / 255 / d) % 6 : max === g / 255 ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4;
    h = (h * 60 + 360) % 360;
    if (!(s >= 0.35 && l > 0.03 && l < 0.97 && (h <= 20 || h >= 340))) return text;
    // Back to RGB with the purple hue.
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((PURPLE_HUE / 60) % 2) - 1)), m = l - c / 2;
    const [nr, ng, nb] = [x + m, m, c + m].map(v => Math.round(v * 255));   // hue 270 sits between blue and magenta
    if (isHex) return "#" + [nr, ng, nb].map(v => v.toString(16).padStart(2, "0")).join("") + alpha;
    return alpha !== null ? `rgba(${nr}, ${ng}, ${nb}, ${alpha})` : `rgb(${nr}, ${ng}, ${nb})`;
  }
  const recolor = text => text.replace(COLOR, toPurple);

  function fixElement(el) {
    if (el.nodeType !== 1) return;
    const style = el.getAttribute("style");
    if (style) { const fixed = recolor(style); if (fixed !== style) el.setAttribute("style", fixed); }
    if (el.tagName === "STYLE") { const fixed = recolor(el.textContent); if (fixed !== el.textContent) el.textContent = fixed; }
  }
  function fixTree(root) { fixElement(root); root.querySelectorAll && root.querySelectorAll("[style], style").forEach(fixElement); }

  fixTree(document.documentElement);
  new MutationObserver(changes => {
    for (const ch of changes) {
      if (ch.type === "attributes") fixElement(ch.target);
      else ch.addedNodes.forEach(n => (n.nodeType === 1 ? fixTree(n) : n.parentNode && n.parentNode.tagName === "STYLE" && fixElement(n.parentNode)));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"], characterData: false });
})();
