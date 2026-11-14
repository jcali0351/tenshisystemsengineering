// Builds every generated part of the site from translations.js and the homepage's header and footer:
//   - index.html: the nine service cards, the form's topic list, the current menu item
//   - about.html, services.html, contact.html
//   - services/<slug>.html, one full page per service
// All wording lives in translations.js. The header and footer are copied from index.html, so change them there.
// Run from the repository folder after changing text, services, the header or the footer, then stamp the versions:
//   node tools/build-pages.mjs && node tools/stamp-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";

// The order here is the order everywhere: on the homepage three sets of three.
const SERVICES = [
  { id: "software",   slug: "software-development",  img: "software.jpg",   w: 960,  h: 640 },
  { id: "consulting", slug: "technology-consulting", img: "consulting.jpg", w: 960,  h: 640 },
  { id: "media",      slug: "media-design",          img: "design.jpg",     w: 960,  h: 640 },
  { id: "webdesign",  slug: "web-design",            img: "webdesign.jpg",  w: 1024, h: 683 },
  { id: "webdev",     slug: "web-development",       img: "webdev.jpg",     w: 1024, h: 678 },
  { id: "hosting",    slug: "hosting",               img: "hosting.jpg",    w: 1024, h: 576 },
  { id: "ai",         slug: "ai-services",           img: "ai.jpg",         w: 1024, h: 1024 },
  { id: "cms",        slug: "content-management",    img: "cms.jpg",        w: 960,  h: 640 },
  { id: "branding",   slug: "branding",              img: "branding.jpg",   w: 960,  h: 644 },
];
const OFFERS = 5;

const sandbox = { window: {} };
vm.runInNewContext(readFileSync("translations.js", "utf8"), sandbox);
const EN = sandbox.window.TRANSLATIONS.en;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tx = (key) => { if (EN[key] === undefined) throw new Error("Missing translation: " + key); return esc(EN[key]); };
const k = (s, f) => `svc_${s.id}_${f}`;
const t = (tag, key, attrs = "") => `<${tag}${attrs ? " " + attrs : ""} data-i18n="${key}">${tx(key)}</${tag}>`;

/* ---------- artwork: small line icons and one illustration per page banner ---------- */
const ICON = {
  reliability: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  craft: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/><path d="M4 20l1-4"/>',
  partner: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  clarity: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  chat: '<path d="M5 5h14v10H9l-4 4z"/><path d="M9 9.5h6M9 12h4"/>',
};
const icon = (name, cls = "icon") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
const ART = {
  // Three connected points: hold, support, cooperate.
  about: `<svg class="page-art" viewBox="0 0 320 220" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round">
      <circle cx="160" cy="110" r="96" stroke-opacity=".18" stroke-width="1.5"/><circle cx="160" cy="110" r="70" stroke-opacity=".12" stroke-width="1.5" stroke-dasharray="4 7"/>
      <path d="M160 34 74 170h172z" stroke-opacity=".7" stroke-width="2.5"/><path d="M160 34v84M74 170l86-52 86 52" stroke-opacity=".35" stroke-width="1.5"/>
      <circle cx="160" cy="34" r="12" fill="#fff" fill-opacity=".95"/><circle cx="74" cy="170" r="12" fill="#fff" fill-opacity=".95"/><circle cx="246" cy="170" r="12" fill="#fff" fill-opacity=".95"/>
      <circle cx="160" cy="118" r="7" fill="#fff" fill-opacity=".6"/>
    </svg>`,
  // Nine tiles, one for each service.
  services: `<svg class="page-art" viewBox="0 0 320 220" aria-hidden="true" fill="none" stroke="#fff">
      ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${86 + c * 52}" y="${32 + r * 52}" width="42" height="42" rx="9" stroke-opacity="${(r + c) % 2 ? 0.45 : 0.75}" stroke-width="2"${r === 1 && c === 1 ? ' fill="#fff" fill-opacity=".9"' : ""}/>`).join("")).join("")}
      <path d="M40 60h30M40 110h30M40 160h30M250 60h30M250 110h30M250 160h30" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="3 6"/>
    </svg>`,
  // A letter on its way, with a speech bubble for the chat.
  contact: `<svg class="page-art" viewBox="0 0 320 220" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
      <rect x="70" y="70" width="150" height="104" rx="12" stroke-opacity=".85" stroke-width="2.5"/><path d="m70 82 75 52 75-52" stroke-opacity=".85" stroke-width="2.5"/>
      <path d="M232 52h58v40h-34l-14 12V92h-10z" fill="#fff" fill-opacity=".9" stroke="none"/><path d="M246 66h30M246 78h20" stroke="#c8102e" stroke-width="3"/>
      <path d="M30 150c20-30 30-60 70-80" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="4 7"/>
    </svg>`,
};

/* ---------- homepage: cards in three sets, the form's topic list, the current menu item ---------- */
const card = (s, pad, prefix) => `${pad}<article class="service-card">
${pad}  <h3 data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</h3>
${pad}  <img class="service-pic" src="${prefix}img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}" loading="lazy">
${pad}  <p data-i18n="${k(s, "short")}">${tx(k(s, "short"))}</p>
${pad}  <a class="btn-more" href="${prefix}services/${s.slug}.html"><span data-i18n="more">${tx("more")}</span><span class="sr-only">: <span data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</span></span><span class="btn-more-arrow" aria-hidden="true">→</span></a>
${pad}</article>`;

const sets = [0, 1, 2].map((n) => SERVICES.slice(n * 3, n * 3 + 3));
const carousel = `      <div class="svc-carousel">
        <div class="svc-sets">
${sets.map((set, n) => `          <div class="svc-set${n === 0 ? " is-active" : ""}" data-set="${n}" role="group">
${set.map((s) => card(s, "            ", "")).join("\n")}
          </div>`).join("\n")}
        </div>
      </div>`;
const topics = SERVICES.map((s) => `              <option value="${k(s, "title")}" data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</option>`).join("\n");

let index = readFileSync("index.html", "utf8");
const between = (html, name, body) => {
  const re = new RegExp(`(<!-- ${name}:start[^>]*-->\\n)[\\s\\S]*?(\\s*<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`Marker ${name} not found in index.html`);
  return html.replace(re, (m, a, b) => a + body + b);
};
const markCurrent = (html, current) => html
  .replace(/ aria-current="page"(?= data-nav=)/g, "")
  .replace(new RegExp(`(<a [^>]*?)( data-nav="${current}")`, "g"), `$1 aria-current="page"$2`);
index = between(index, "services", carousel);
index = between(index, "topics", topics);
index = markCurrent(index, "home");
writeFileSync("index.html", index);

/* ---------- shared page frame ---------- */
const HEADER = index.match(/  <header class="site-header">[\s\S]*?<\/header>/)[0];
const FOOTER = index.match(/  <footer class="site-footer">[\s\S]*?<\/footer>/)[0].replace(/\n\s*<p class="photo-credits">[\s\S]*?<\/p>/, "");
const FORM = index.match(/        <form class="contact-form"[\s\S]*?<\/form>/)[0];

// Point the copied links at the right folder and mark the current menu item.
function chrome(html, prefix, current) {
  return markCurrent(html, current)
    .replace('href="#top"', `href="${prefix}index.html"`)
    .replace(/src="logo\.png"/g, `src="${prefix}logo.png"`)
    .replace(/href="(index|about|services|contact)\.html"/g, `href="${prefix}$1.html"`);
}

function frame({ prefix, current, titleKey, descKey, bodyClass, main, photoCredits = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${tx(titleKey)} | ${tx("brandName")}</title>
  <meta name="description" content="${tx(descKey)}">
  <meta name="theme-color" content="#c8102e">
  <meta property="og:title" content="${tx(titleKey)} | ${tx("brandName")}">
  <meta property="og:description" content="${tx(descKey)}">
  <meta property="og:type" content="website">
  <link rel="icon" href="${prefix}logo.png" type="image/png">
  <link rel="apple-touch-icon" href="${prefix}logo.png">
  <link rel="stylesheet" href="${prefix}styles.css">
  <link rel="stylesheet" href="${prefix}chat.css">
</head>
<body class="${bodyClass}" data-title-key="${titleKey}" data-desc-key="${descKey}">
  <!-- Written by tools/build-pages.mjs: edit translations.js and the script, not this file. -->
  <a class="skip-link" href="#main" data-i18n="skip">${tx("skip")}</a>

${chrome(HEADER, prefix, current)}

  <main id="main">
${main}
  </main>

${chrome(FOOTER, prefix, current).replace("    </div>\n  </footer>", photoCredits + "    </div>\n  </footer>")}

  <script src="${prefix}translations.js"></script>
  <script src="${prefix}app.js"></script>
  <script src="${prefix}chat.js"></script>
</body>
</html>
`;
}

const banner = (prefix, crumbs, titleKey, leadKey, art = "") => `    <section class="svc-hero${art ? " has-art" : ""}">
      <div class="svc-hero-inner">
        <div class="svc-hero-text">
          <nav class="crumbs" aria-label="${tx("crumbLabel")}" data-i18n-attr="aria-label:crumbLabel">
            <ol>
              <li><a href="${prefix}index.html" data-i18n="crumbHome">${tx("crumbHome")}</a></li>
${crumbs.map((c) => c.href ? `              <li><a href="${c.href}" data-i18n="${c.key}">${tx(c.key)}</a></li>` : `              <li aria-current="page" data-i18n="${c.key}">${tx(c.key)}</li>`).join("\n")}
            </ol>
          </nav>
          <h1 data-i18n="${titleKey}">${tx(titleKey)}</h1>
          <p class="svc-hero-lead" data-i18n="${leadKey}">${tx(leadKey)}</p>
        </div>
${art ? "        " + art + "\n" : ""}      </div>
    </section>`;

const process = () => `    <section class="svc-process" aria-labelledby="process-title">
      <div class="svc-process-inner">
        <h2 id="process-title" data-i18n="processTitle">${tx("processTitle")}</h2>
        <ol class="svc-steps">
${[1, 2, 3, 4].map((n) => `          <li class="svc-step">
            <span class="svc-step-num" aria-hidden="true">0${n}</span>
            <h3 data-i18n="proc${n}Title">${tx(`proc${n}Title`)}</h3>
            <p data-i18n="proc${n}Text">${tx(`proc${n}Text`)}</p>
          </li>`).join("\n")}
        </ol>
      </div>
    </section>`;

const cta = (href) => `    <section class="svc-cta" aria-labelledby="cta-title">
      <h2 id="cta-title" data-i18n="ctaTitle">${tx("ctaTitle")}</h2>
      <p data-i18n="ctaText">${tx("ctaText")}</p>
      <a class="btn btn-light" href="${href}" data-i18n="cta">${tx("cta")}</a>
    </section>`;

/* ---------- About ---------- */
const about = frame({
  prefix: "", current: "about", titleKey: "aboutTitle", descKey: "aboutLead", bodyClass: "page about-page",
  photoCredits: `      <p class="photo-credits"><span data-i18n="photoCredits">${tx("photoCredits")}</span> <span data-i18n="city0">${tx("city0")}</span> –
        <a href="https://commons.wikimedia.org/wiki/File:Osaka,_Japan_-_Umeda_district_-_city_view_of_Osaka,_Japan.jpg">Marek Ślusarczyk (Tupungato)</a>,
        <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a></p>
`,
  main: `${banner("", [{ key: "navAbout" }], "aboutTitle", "aboutLead", ART.about)}

    <section class="page-section" aria-labelledby="who-title">
      <div class="page-inner split">
        <div>
          <h2 id="who-title" class="section-title" data-i18n="aboutWhoTitle">${tx("aboutWhoTitle")}</h2>
          ${t("p", "aboutWho1", 'class="page-lead"')}
          ${t("p", "aboutWho2")}
        </div>
        <aside class="name-card" aria-labelledby="name-title">
          <span class="name-kanji" lang="ja" aria-hidden="true">天使</span>
          <h3 id="name-title" data-i18n="aboutNameTitle">${tx("aboutNameTitle")}</h3>
          ${t("p", "aboutName")}
        </aside>
      </div>
    </section>

    <section class="page-section tinted" aria-labelledby="values-title">
      <div class="page-inner">
        <h2 id="values-title" class="section-title center" data-i18n="aboutValuesTitle">${tx("aboutValuesTitle")}</h2>
        <ul class="value-grid">
${[["reliability", 1], ["craft", 2], ["partner", 3], ["clarity", 4]].map(([ic, n]) => `          <li class="value-card">
            <span class="value-icon">${icon(ic)}</span>
            <h3 data-i18n="val${n}Title">${tx(`val${n}Title`)}</h3>
            <p data-i18n="val${n}Text">${tx(`val${n}Text`)}</p>
          </li>`).join("\n")}
        </ul>
      </div>
    </section>

    <section class="page-section" aria-labelledby="osaka-title">
      <div class="page-inner split media-split">
        <figure class="page-photo">
          <img src="img/photos/osaka.jpg" alt="${tx("aboutPhotoAlt")}" data-i18n-attr="alt:aboutPhotoAlt" width="1920" height="1080" loading="lazy">
        </figure>
        <div>
          <h2 id="osaka-title" class="section-title" data-i18n="aboutOsakaTitle">${tx("aboutOsakaTitle")}</h2>
          ${t("p", "aboutOsaka", 'class="page-lead"')}
          <h3 class="sub-title" data-i18n="aboutWhatTitle">${tx("aboutWhatTitle")}</h3>
          ${t("p", "aboutWhat")}
          <a class="btn btn-primary" href="services.html" data-i18n="seeAll">${tx("seeAll")}</a>
        </div>
      </div>
    </section>

${cta("contact.html")}`,
});
writeFileSync("about.html", about);

/* ---------- Services overview ---------- */
const servicesPage = frame({
  prefix: "", current: "services", titleKey: "navServices", descKey: "servicesLead", bodyClass: "page services-page",
  main: `${banner("", [{ key: "navServices" }], "servicesTitle", "servicesLead", ART.services)}

    <section class="page-section red-section" aria-labelledby="all-title">
      <div class="page-inner">
        <h2 id="all-title" class="sr-only" data-i18n="servicesTitle">${tx("servicesTitle")}</h2>
        ${t("p", "servicesIntro", 'class="section-intro"')}
        <div class="svc-grid">
${SERVICES.map((s) => card(s, "          ", "")).join("\n")}
        </div>
      </div>
    </section>

${process()}

${cta("contact.html")}`,
});
writeFileSync("services.html", servicesPage);

/* ---------- Contact ---------- */
const contactPage = frame({
  prefix: "", current: "contact", titleKey: "contactPageTitle", descKey: "contactPageLead", bodyClass: "page contact-page",
  main: `${banner("", [{ key: "navContact" }], "contactPageTitle", "contactPageLead", ART.contact)}

    <section class="page-section contact" id="contact" aria-labelledby="form-title" tabindex="-1">
      <div class="page-inner contact-layout">
        <div class="contact-main">
          <h2 id="form-title" class="section-title" data-i18n="formTitle">${tx("formTitle")}</h2>
          ${t("p", "contactLead", 'class="contact-note"')}
${FORM}
        </div>
        <aside class="contact-aside" aria-labelledby="info-title">
          <h2 id="info-title" class="aside-title" data-i18n="infoTitle">${tx("infoTitle")}</h2>
          <ul class="info-list">
            <li>${icon("mail", "info-icon")}<div><b data-i18n="infoEmail">${tx("infoEmail")}</b><a class="contact-email" href="#contact"></a></div></li>
            <li>${icon("pin", "info-icon")}<div><b data-i18n="infoLocation">${tx("infoLocation")}</b><span data-i18n="location">${tx("location")}</span></div></li>
            <li>${icon("globe", "info-icon")}<div><b data-i18n="infoLanguages">${tx("infoLanguages")}</b><span>English · <span lang="ja">日本語</span> · <span lang="ko">한국어</span> · <span lang="de">Deutsch</span></span></div></li>
          </ul>
          <div class="chat-card">
            ${icon("chat", "info-icon")}
            <h3 data-i18n="infoChat">${tx("infoChat")}</h3>
            ${t("p", "infoChatText")}
            <button type="button" class="btn btn-dark" data-open-chat data-i18n="infoChatBtn">${tx("infoChatBtn")}</button>
          </div>
        </aside>
      </div>
    </section>

    <section class="page-section tinted" aria-labelledby="faq-title">
      <div class="page-inner narrow">
        <h2 id="faq-title" class="section-title center" data-i18n="faqTitle">${tx("faqTitle")}</h2>
        <div class="faq">
${[1, 2, 3, 4].map((n) => `          <details>
            <summary data-i18n="faq${n}Q">${tx(`faq${n}Q`)}</summary>
            <p data-i18n="faq${n}A">${tx(`faq${n}A`)}</p>
          </details>`).join("\n")}
        </div>
      </div>
    </section>`,
});
writeFileSync("contact.html", contactPage);

/* ---------- one page per service ---------- */
function servicePage(s) {
  const others = SERVICES.filter((o) => o !== s);
  const offers = Array.from({ length: OFFERS }, (_, i) => `            <li data-i18n="${k(s, "o" + (i + 1))}">${tx(k(s, "o" + (i + 1)))}</li>`).join("\n");
  const ask = `../contact.html?topic=${k(s, "title")}`;
  return frame({
    prefix: "../", current: "services", titleKey: k(s, "title"), descKey: k(s, "short"), bodyClass: "svc-page",
    main: `${banner("../", [{ key: "crumbServices", href: "../services.html" }, { key: k(s, "title") }], k(s, "title"), k(s, "short"))}

    <section class="svc-body" aria-labelledby="offer-title">
      <div class="svc-body-inner">
        <div class="svc-copy">
          <p class="svc-intro" data-i18n="${k(s, "intro")}">${tx(k(s, "intro"))}</p>
          <h2 id="offer-title" data-i18n="offerTitle">${tx("offerTitle")}</h2>
          <ul class="svc-offers">
${offers}
          </ul>
          <a class="btn btn-primary" href="${ask}" data-i18n="cta">${tx("cta")}</a>
        </div>
        <figure class="svc-figure">
          <img src="../img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}">
        </figure>
      </div>
    </section>

${process()}

${cta(ask)}

    <section class="svc-others" aria-labelledby="others-title">
      <div class="svc-others-inner">
        <h2 id="others-title" data-i18n="othersTitle">${tx("othersTitle")}</h2>
        <ul class="svc-other-list">
${others.map((o) => `          <li><a class="svc-other" href="${o.slug}.html">
            <img src="../img/services/${o.img}" alt="" width="${o.w}" height="${o.h}" loading="lazy">
            <span data-i18n="${k(o, "title")}">${tx(k(o, "title"))}</span>
          </a></li>`).join("\n")}
        </ul>
        <p class="svc-back"><a href="../services.html" data-i18n="seeAll">${tx("seeAll")}</a></p>
      </div>
    </section>`,
  });
}
mkdirSync("services", { recursive: true });
for (const s of SERVICES) writeFileSync(`services/${s.slug}.html`, servicePage(s));
console.log(`index.html updated; about.html, services.html, contact.html and ${SERVICES.length} service pages written`);
