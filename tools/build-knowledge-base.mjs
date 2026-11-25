// Builds the Knowledge Base page body from data/glossary.json. Called by tools/build-pages.mjs.
import { readFileSync } from "node:fs";

export const KB_SECTIONS = [
  { key: "dev", source: "Web Development", slug: "web-development", labelKey: "kbSecDev" },
  { key: "design", source: "Web Design", slug: "web-design", labelKey: "kbSecDesign" },
  { key: "seo", source: "SEO", slug: "seo", labelKey: "kbSecSeo" },
  { key: "saas", source: "SaaS", slug: "saas", labelKey: "kbSecSaas" },
  { key: "ai", source: "AI", slug: "ai", labelKey: "kbSecAi" },
];

export function slugify(s) {
  return String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function loadGlossary() {
  const raw = JSON.parse(readFileSync("data/glossary.json", "utf8"));
  const sections = KB_SECTIONS.map((s) => {
    const items = Array.isArray(raw[s.source]) ? raw[s.source] : [];
    const entries = items.map((item) => ({
      term: String(item.term || "").trim(),
      def: String(item.d || "").trim(),
      why: String(item.why || "").trim(),
      see: Array.isArray(item.see) ? item.see.map((x) => String(x).trim()).filter(Boolean) : [],
      sec: s.key,
      secSlug: s.slug,
      labelKey: s.labelKey,
      id: `${s.slug}-${slugify(item.term || "")}`,
    }));
    return { ...s, entries };
  });
  const all = sections.flatMap((s) => s.entries);
  if (all.length !== 434) throw new Error(`Knowledge Base expected 434 terms, found ${all.length}`);
  const ids = new Set();
  for (const e of all) {
    if (!e.term || !e.def || !e.id) throw new Error(`Knowledge Base term is missing a name, definition or id`);
    if (ids.has(e.id)) throw new Error(`Knowledge Base duplicate id: ${e.id}`);
    ids.add(e.id);
  }
  const byName = new Map();
  for (const e of all) {
    const k = e.term.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(e);
  }
  const resolve = (name, fromSec) => {
    const hits = byName.get(String(name).toLowerCase()) || [];
    if (!hits.length) return null;
    return hits.find((e) => e.sec === fromSec) || hits[0];
  };
  return { sections, all, resolve };
}

const ICO = (key, cls = "kb-ico") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#kb-ico-${key}"></use></svg>`;

const KB_SPRITE = `    <svg class="kb-sprite" width="0" height="0" aria-hidden="true" focusable="false">
      <symbol id="kb-ico-dev" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.25 6.75 3.5 12l4.75 5.25"/>
          <path d="M15.75 6.75 20.5 12l-4.75 5.25"/>
          <path d="M13.6 5.75 10.4 18.25"/>
        </g>
      </symbol>
      <symbol id="kb-ico-design" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3.5" y="3.75" width="17" height="16.5" rx="3"/>
          <path d="M3.5 8.5h17"/>
          <rect x="6.5" y="11.5" width="7" height="5.5" rx="1.25"/>
        </g>
      </symbol>
      <symbol id="kb-ico-seo" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 17.25V13"/>
          <path d="M7.35 17.25V10.25"/>
          <path d="M10.7 17.25V7.5"/>
          <circle cx="15.1" cy="11.15" r="4.15"/>
          <path d="m18.1 14.2 3.15 3.15"/>
        </g>
      </symbol>
      <symbol id="kb-ico-saas" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6.6 14.15h10.9a3 3 0 0 0 .2-5.9 4.15 4.15 0 0 0-7.9-1.25 3.35 3.35 0 0 0-3.2 7.15z"/>
          <path d="M5.75 16.55h12.5"/>
          <path d="M6.85 18.8h10.3"/>
          <path d="M8.15 21.05h7.7"/>
        </g>
      </symbol>
      <symbol id="kb-ico-ai" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="7" width="10" height="10" rx="2"/>
          <path d="M9.25 7V4.4M12 7V4.4M14.75 7V4.4"/>
          <path d="M9.25 17v2.6M12 17v2.6M14.75 17v2.6"/>
          <path d="M7 9.25H4.4M7 12H4.4M7 14.75H4.4"/>
          <path d="M17 9.25h2.6M17 12h2.6M17 14.75h2.6"/>
          <path d="M12 8.45 13.05 11.15 15.55 12 13.05 12.85 12 15.55 10.95 12.85 8.45 12 10.95 11.15Z"/>
        </g>
      </symbol>
    </svg>`;

export function knowledgeBaseMain({ tx, esc, t, banner, cta, art = "" }) {
  const { sections, all, resolve } = loadGlossary();
  const letterOf = (term) => {
    const ch = String(term).trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : "#";
  };
  const byLetter = new Map();
  for (const e of [...all].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base", numeric: true }))) {
    const L = letterOf(e.term);
    if (!byLetter.has(L)) byLetter.set(L, []);
    byLetter.get(L).push(e);
  }
  const letters = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const filters = [
    `<button type="button" class="kb-chip" role="radio" aria-checked="true" data-kb-sec="all">${t("span", "kbAll")}<span class="kb-chip-n">${all.length}</span></button>`,
    ...sections.map((s) =>
      `<button type="button" class="kb-chip" role="radio" aria-checked="false" data-kb-sec="${s.key}">${ICO(s.key)}<span data-i18n="${s.labelKey}">${tx(s.labelKey)}</span><span class="kb-chip-n">${s.entries.length}</span></button>`
    ),
  ].join("\n            ");

  const renderSee = (e) => {
    if (!e.see.length) return "";
    const links = e.see.map((name) => {
      const target = resolve(name, e.sec);
      if (!target) return `<span>${esc(name)}</span>`;
      return `<a class="kb-also" href="#${target.id}" data-kb-jump="${target.id}">${esc(name)}</a>`;
    }).join("");
    return `<p class="kb-see"><span data-i18n="kbSeeAlso">${tx("kbSeeAlso")}</span> ${links}</p>`;
  };

  const renderTerm = (e) => `            <article class="kb-term" id="${e.id}" data-kb-sec="${e.sec}" data-kb-term="${esc(e.term)}" data-kb-id="${e.id}">
              <div class="kb-term-top">
                <span class="kb-badge kb-badge-sm" aria-hidden="true">${ICO(e.sec, "kb-ico kb-ico-md")}</span>
                <div class="kb-term-heading">
                  <h3 class="kb-term-name">${esc(e.term)}</h3>
                  <p class="kb-term-sec"><span data-i18n="${e.labelKey}">${tx(e.labelKey)}</span></p>
                </div>
              </div>
              <p class="kb-term-def">${esc(e.def)}</p>
${e.why ? `              <p class="kb-term-why"><span data-i18n="kbWhy">${tx("kbWhy")}</span> ${esc(e.why)}</p>\n` : ""}${renderSee(e)}            </article>`;

  const sectionBlocks = sections.map((s) => `          <section class="kb-sec" id="${s.slug}" data-kb-sec="${s.key}" aria-labelledby="kb-h-${s.key}">
            <div class="kb-sec-head">
              <span class="kb-badge" aria-hidden="true">${ICO(s.key, "kb-ico kb-ico-lg")}</span>
              <div class="kb-sec-copy">
                <h2 class="kb-sec-title" id="kb-h-${s.key}" data-i18n="${s.labelKey}">${tx(s.labelKey)}</h2>
                <p class="kb-sec-count"><span class="kb-sec-n">${s.entries.length}</span> <span data-i18n="kbTermsWord">${tx("kbTermsWord")}</span></p>
              </div>
            </div>
${s.entries.map(renderTerm).join("\n")}
          </section>`).join("\n");

  const azLinks = letters.map((L) => {
    const id = L === "#" ? "kb-letter-other" : `kb-letter-${L.toLowerCase()}`;
    const n = (byLetter.get(L) || []).length;
    if (!n) return `<span class="kb-az-link kb-az-off" aria-disabled="true" title="No terms">${L}</span>`;
    return `<a class="kb-az-link" href="#${id}">${L}</a>`;
  }).join("");

  const azGroups = letters.filter((L) => (byLetter.get(L) || []).length).map((L) => {
    const id = L === "#" ? "kb-letter-other" : `kb-letter-${L.toLowerCase()}`;
    const items = byLetter.get(L).map((e) =>
      `                <li><a class="kb-az-item" href="#${e.id}" data-kb-jump="${e.id}"><span class="kb-az-term">${esc(e.term)}</span><span class="kb-az-sec" data-i18n="${e.labelKey}">${tx(e.labelKey)}</span></a></li>`
    ).join("\n");
    return `            <div class="kb-az-group" id="${id}">
              <h3 class="kb-az-letter">${L === "#" ? "#" : L}</h3>
              <ul class="kb-az-list">
${items}
              </ul>
            </div>`;
  }).join("\n");

  return `${KB_SPRITE}

${banner("", [{ key: "navAbout", href: "about.html" }, { key: "navKnowledgeBase" }], "kbTitle", "kbLead", art)}

    <section class="kb-intro page-section" aria-labelledby="kb-intro-title">
      <div class="kb-shell">
        <h2 id="kb-intro-title" class="sr-only" data-i18n="kbTitle">${tx("kbTitle")}</h2>
        ${t("p", "kbIntro1")}
        ${t("p", "kbIntro2")}
        <p>${t("span", "kbIntro3")} <a href="contact.html" data-i18n="kbIntroCta">${tx("kbIntroCta")}</a></p>
      </div>
    </section>

    <section class="kb-find page-section" id="kb-find" aria-labelledby="kb-find-title">
      <div class="kb-shell">
        <h2 id="kb-find-title" class="kb-find-title" data-i18n="kbFindTitle">${tx("kbFindTitle")}</h2>
        <div class="kb-tools">
          <div class="kb-search">
            <label class="kb-search-label" for="kb-q" data-i18n="kbSearchLabel">${tx("kbSearchLabel")}</label>
            <input class="kb-search-input" id="kb-q" type="search" autocomplete="off" spellcheck="false" placeholder="${tx("kbSearchPlaceholder")}" data-i18n-attr="placeholder:kbSearchPlaceholder" enterkeyhint="search">
          </div>
          <div class="kb-chips" role="radiogroup" aria-label="${tx("kbFilters")}" data-i18n-attr="aria-label:kbFilters">
            ${filters}
          </div>
          <div class="kb-status">
            <p class="kb-status-text" data-kb-status aria-live="polite"></p>
            <button type="button" class="kb-clear" data-kb-clear hidden data-i18n="kbClear">${tx("kbClear")}</button>
          </div>
        </div>
        <p class="kb-empty" data-kb-empty hidden data-i18n="kbNoResults">${tx("kbNoResults")}</p>
        <div class="kb-results" data-kb-results aria-label="${tx("kbResults")}" data-i18n-attr="aria-label:kbResults">
${sectionBlocks}
        </div>
      </div>
    </section>

    <section class="kb-index page-section" id="kb-index" aria-labelledby="kb-index-title">
      <div class="kb-shell">
        <h2 id="kb-index-title" class="kb-index-title" data-i18n="kbIndexTitle">${tx("kbIndexTitle")}</h2>
        <p class="kb-index-lead" data-i18n="kbIndexCaption">${tx("kbIndexCaption")}</p>
        <nav class="kb-az" aria-label="${tx("kbJumpTo")}" data-i18n-attr="aria-label:kbJumpTo">
          ${azLinks}
        </nav>
${azGroups}
      </div>
    </section>

    <p class="kb-top-wrap"><a class="kb-top" href="#kb-find" data-i18n="kbBackToTop">${tx("kbBackToTop")}</a></p>

${cta("contact.html")}`;
}
