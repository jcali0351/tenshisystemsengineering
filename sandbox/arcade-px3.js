// arcade-px3.js: puts the Neon Arcade (arcade-embed.html, in a full-bleed iframe) into the homepage's third parallax band,
// "Let's build what's next" (#parallax-px3-title). The band's words stay on top but let clicks through to the game.
// The band itself is written by tools/build-pages.mjs from data/parallax.json, so this runs after the page loads and
// survives CMS rebuilds. The iframe loads lazily and is paused while the band is off screen. Styles: sandbox/arcade-px3.css
(function () {
  const title = document.getElementById("parallax-px3-title");
  const band = title && title.closest("section.parallax");
  if (!band || band.querySelector(".px3-arcade")) return;
  band.classList.add("has-arcade");
  const frame = document.createElement("iframe");
  frame.className = "px3-arcade";
  frame.title = "Neon Arcade: click or tap the sky to shoot the flying targets";
  frame.loading = "lazy";
  frame.src = "arcade-embed.html?v=202611251205";
  const view = band.querySelector(".parallax-viewport") || band;
  const copy = view.querySelector(".parallax-copy");
  view.insertBefore(frame, copy || null);
  let onScreen = true;
  const sync = () => { try { frame.contentWindow.tenshiArcadePause && frame.contentWindow.tenshiArcadePause(!onScreen); } catch (e) {} };
  frame.addEventListener("load", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; sync(); }, { rootMargin: "100px 0px" }).observe(band);
  }
})();
