// neon-header.js: the see-through header changes colour to suit what's scrolling underneath it (neon preview only).
// Over dark areas (the neon hero, the photo strips, the purple band, the footer) the logo and menu stay white with a
// pink glow. Over the white content areas they turn black with a light gray glow. It adds or removes the class
// "neon-light" on <html>; neon-theme.css does the rest.
(function () {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const DARK = ".hero, .parallax, .band, .services, .feature, .contact, footer, .site-footer";   // the areas with dark backgrounds (all of them, for now)

  function check() {
    // What's just below the header, in the middle of the screen?
    const y = header.getBoundingClientRect().bottom + 4;
    const area = document.elementsFromPoint(window.innerWidth / 2, y)
      .map(el => el.closest("main > section, footer, section"))
      .find(Boolean);
    document.documentElement.classList.toggle("neon-light", !!area && !area.matches(DARK));
  }

  window.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check);
  // The site's own scripts don't always let the scroll event through, so also look again a few times a second.
  setInterval(check, 150);
  check();
})();
