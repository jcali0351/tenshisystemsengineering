/* Theme gallery: light/dark/both filter and a simple lightbox for the preset screenshots. */
(function () {
  const page = document.querySelector(".themes-page");
  if (!page) return;
  const grid = page.querySelector(".themes-grid");
  const buttons = page.querySelectorAll("[data-themes-mode]");
  const setMode = (mode) => {
    if (!grid) return;
    grid.dataset.mode = mode;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themesMode === mode)));
  };
  buttons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.themesMode)));
  setMode(grid && grid.dataset.mode ? grid.dataset.mode : "both");

  const dialog = page.querySelector("dialog.themes-lightbox");
  if (!dialog) return;
  const picture = dialog.querySelector("img");
  const caption = dialog.querySelector(".themes-lightbox-cap");
  const closeBtn = dialog.querySelector("[data-themes-close]");
  const close = () => { if (dialog.open) dialog.close(); };
  page.querySelectorAll("[data-themes-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const shot = btn.querySelector("img");
      if (!shot || !picture) return;
      picture.src = shot.currentSrc || shot.src;
      picture.alt = shot.alt || "";
      if (caption) {
        const card = btn.closest(".themes-card");
        const name = card ? (card.querySelector("h2") || {}).textContent || "" : "";
        const mode = (btn.closest("figure") || {}).querySelector("figcaption");
        caption.textContent = [name, mode && mode.textContent].filter(Boolean).join(" · ");
      }
      if (typeof dialog.showModal === "function") dialog.showModal();
    });
  });
  if (closeBtn) closeBtn.addEventListener("click", close);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
})();
