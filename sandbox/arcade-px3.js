// arcade-px3.js: the Neon Arcade (arcade-embed.html, in a full-bleed iframe) in the homepage's third parallax band,
// "Let's build what's next" (#parallax-px3-title). The band's words stay on top but let clicks through to the game.
// The band itself is written by tools/build-pages.mjs from data/parallax.json, so this runs after the page loads and
// survives CMS rebuilds. Styles: sandbox/arcade-px3.css
//
// The game never starts by itself. Until someone presses PLAY NOW the band shows a still picture of the arcade
// (img/photos/arcade-poster*.webp) and nothing runs: no game, no canvases, no animation frames. PLAY NOW loads the
// arcade and starts it; closing the GAME OVER box puts the band back to its still picture and unloads the game.
// While playing, the arcade is paused whenever the band is scrolled out of view. People who ask for reduced motion
// get the still picture only (the game's scripts switch themselves off for them anyway).
(function () {
  if (document.documentElement.classList.contains("white")) return;   // white corporate theme: no neon extras (white-theme.js)
  const title = document.getElementById("parallax-px3-title");
  const band = title && title.closest("section.parallax");
  if (!band || band.querySelector(".px3-poster")) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  band.classList.add("has-arcade", "is-idle");
  const view = band.querySelector(".parallax-viewport") || band;
  const copy = view.querySelector(".parallax-copy");

  const poster = document.createElement("div");
  poster.className = "px3-poster";
  poster.setAttribute("aria-hidden", "true");
  view.insertBefore(poster, copy || null);

  if (reduce || !copy) return;
  const play = document.createElement("button");
  play.type = "button";
  play.className = "px3-play";
  play.setAttribute("aria-label", "Play now: start the Neon Arcade game");
  play.innerHTML = '<span class="px3-play-icon" aria-hidden="true"></span><span class="px3-play-label">PLAY NOW</span>';
  copy.appendChild(play);

  let frame = null, onScreen = true;
  const sync = () => { try { frame && frame.contentWindow.tenshiArcadePause && frame.contentWindow.tenshiArcadePause(!onScreen); } catch (e) {} };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => { onScreen = entries[entries.length - 1].isIntersecting; sync(); }, { rootMargin: "100px 0px" }).observe(band);
  }

  function start() {
    if (frame) return;
    play.disabled = true; play.setAttribute("aria-busy", "true");
    play.querySelector(".px3-play-label").textContent = "LOADING…";
    frame = document.createElement("iframe");
    frame.className = "px3-arcade";
    frame.title = "Neon Arcade: click or tap the sky to shoot the flying targets";
    frame.src = "arcade-embed.html?v=20261125g&play=1";
    frame.addEventListener("load", () => {
      sync();
      band.classList.remove("is-idle"); band.classList.add("is-playing");
      try { frame.focus(); } catch (e) {}
    }, { once: true });
    view.insertBefore(frame, copy);
  }
  // Back to the still picture (the arcade calls this when its GAME OVER box is closed).
  window.tenshiArcadeClosed = () => {
    if (!frame) return;
    const f = frame; frame = null;
    band.classList.remove("is-playing"); band.classList.add("is-idle");
    play.disabled = false; play.removeAttribute("aria-busy");
    play.querySelector(".px3-play-label").textContent = "PLAY NOW";
    setTimeout(() => f.remove(), 0);
    play.focus({ preventScroll: true });
  };
  play.addEventListener("click", start);
})();
