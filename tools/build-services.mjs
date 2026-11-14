// Builds the nine service cards on the homepage and a full page for each service (services/<slug>.html).
// All wording lives in translations.js (keys svc_<id>_title, _short, _alt, _intro, _o1 … _o5, plus the shared keys).
// Run from the repository folder after changing a service, then stamp the asset versions:
//   node tools/build-services.mjs && node tools/stamp-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";

// The order here is the order on the homepage: three sets of three.
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

/* ---------- Homepage: cards in three sets, and the form's topic list ---------- */
const card = (s, pad) => `${pad}<article class="service-card">
${pad}  <h3 data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</h3>
${pad}  <img class="service-pic" src="img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}" loading="lazy">
${pad}  <p data-i18n="${k(s, "short")}">${tx(k(s, "short"))}</p>
${pad}  <a class="btn-more" href="services/${s.slug}.html"><span data-i18n="more">${tx("more")}</span><span class="sr-only">: <span data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</span></span><span class="btn-more-arrow" aria-hidden="true">→</span></a>
${pad}</article>`;

const sets = [0, 1, 2].map((n) => SERVICES.slice(n * 3, n * 3 + 3));
const carousel = `      <div class="svc-carousel">
        <div class="svc-sets">
${sets.map((set, n) => `          <div class="svc-set${n === 0 ? " is-active" : ""}" data-set="${n}" role="group">
${set.map((s) => card(s, "            ")).join("\n")}
          </div>`).join("\n")}
        </div>
        <div class="svc-controls" hidden>
          <button type="button" class="svc-arrow svc-prev"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg><span class="sr-only" data-i18n="svcPrev">${tx("svcPrev")}</span></button>
          <div class="svc-dots" role="group" aria-label="${tx("svcGroups")}" data-i18n-attr="aria-label:svcGroups">
${[0, 1, 2].map((n) => `            <button type="button" class="svc-dot" data-set="${n}"${n === 0 ? ' aria-current="true"' : ""}><span class="sr-only"></span></button>`).join("\n")}
          </div>
          <button type="button" class="svc-arrow svc-next"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg><span class="sr-only" data-i18n="svcNext">${tx("svcNext")}</span></button>
          <button type="button" class="svc-arrow svc-pause" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M5 3v10M11 3v10"/><path class="i-play" d="M5 3l8 5-8 5z"/></svg><span class="sr-only" data-i18n="svcPause">${tx("svcPause")}</span></button>
        </div>
      </div>`;

const topics = SERVICES.map((s) => `              <option value="${k(s, "title")}" data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</option>`).join("\n");

let index = readFileSync("index.html", "utf8");
const between = (html, name, body) => {
  const re = new RegExp(`(<!-- ${name}:start[^>]*-->\\n)[\\s\\S]*?(\\s*<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`Marker ${name} not found in index.html`);
  return html.replace(re, (m, a, b) => a + body + b);
};
index = between(index, "services", carousel);
index = between(index, "topics", topics);
writeFileSync("index.html", index);

/* ---------- Service pages ---------- */
// Header and footer are copied from the homepage so they stay identical; links are pointed one folder up.
const header = index.match(/  <header class="site-header">[\s\S]*?<\/header>/)[0]
  .replace('href="#top"', 'href="../index.html"')
  .replace(/src="logo\.png"/g, 'src="../logo.png"');
const footer = index.match(/  <footer class="site-footer">[\s\S]*?<\/footer>/)[0]
  .replace(/\n\s*<p class="photo-credits">[\s\S]*?<\/p>/, "")
  .replace(/src="logo\.png"/g, 'src="../logo.png"');

function page(s) {
  const others = SERVICES.filter((o) => o !== s);
  const offers = Array.from({ length: OFFERS }, (_, i) => `            <li data-i18n="${k(s, "o" + (i + 1))}">${tx(k(s, "o" + (i + 1)))}</li>`).join("\n");
  const steps = [1, 2, 3, 4].map((n) => `          <li class="svc-step">
            <span class="svc-step-num" aria-hidden="true">0${n}</span>
            <h3 data-i18n="proc${n}Title">${tx(`proc${n}Title`)}</h3>
            <p data-i18n="proc${n}Text">${tx(`proc${n}Text`)}</p>
          </li>`).join("\n");
  const otherLinks = others.map((o) => `          <li><a class="svc-other" href="${o.slug}.html">
            <img src="../img/services/${o.img}" alt="" width="${o.w}" height="${o.h}" loading="lazy">
            <span data-i18n="${k(o, "title")}">${tx(k(o, "title"))}</span>
          </a></li>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${tx(k(s, "title"))} | ${tx("brandName")}</title>
  <meta name="description" content="${tx(k(s, "short"))}">
  <meta name="theme-color" content="#c8102e">
  <meta property="og:title" content="${tx(k(s, "title"))} | ${tx("brandName")}">
  <meta property="og:description" content="${tx(k(s, "short"))}">
  <meta property="og:type" content="website">
  <link rel="icon" href="../logo.png" type="image/png">
  <link rel="apple-touch-icon" href="../logo.png">
  <link rel="stylesheet" href="../styles.css">
</head>
<body class="svc-page" data-title-key="${k(s, "title")}" data-desc-key="${k(s, "short")}">
  <!-- Written by tools/build-services.mjs: edit translations.js and the script, not this file. -->
  <a class="skip-link" href="#main" data-i18n="skip">${tx("skip")}</a>

${header}

  <main id="main">
    <section class="svc-hero">
      <div class="svc-hero-inner">
        <nav class="crumbs" aria-label="${tx("crumbLabel")}" data-i18n-attr="aria-label:crumbLabel">
          <ol>
            <li><a href="../index.html" data-i18n="crumbHome">${tx("crumbHome")}</a></li>
            <li><a href="../index.html#services" data-i18n="crumbServices">${tx("crumbServices")}</a></li>
            <li aria-current="page" data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</li>
          </ol>
        </nav>
        <h1 data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</h1>
        <p class="svc-hero-lead" data-i18n="${k(s, "short")}">${tx(k(s, "short"))}</p>
      </div>
    </section>

    <section class="svc-body" aria-labelledby="offer-title">
      <div class="svc-body-inner">
        <div class="svc-copy">
          <p class="svc-intro" data-i18n="${k(s, "intro")}">${tx(k(s, "intro"))}</p>
          <h2 id="offer-title" data-i18n="offerTitle">${tx("offerTitle")}</h2>
          <ul class="svc-offers">
${offers}
          </ul>
          <a class="btn btn-primary" href="../index.html?topic=${k(s, "title")}#contact" data-i18n="cta">${tx("cta")}</a>
        </div>
        <figure class="svc-figure">
          <img src="../img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}">
        </figure>
      </div>
    </section>

    <section class="svc-process" aria-labelledby="process-title">
      <div class="svc-process-inner">
        <h2 id="process-title" data-i18n="processTitle">${tx("processTitle")}</h2>
        <ol class="svc-steps">
${steps}
        </ol>
      </div>
    </section>

    <section class="svc-cta" aria-labelledby="cta-title">
      <h2 id="cta-title" data-i18n="ctaTitle">${tx("ctaTitle")}</h2>
      <p data-i18n="ctaText">${tx("ctaText")}</p>
      <a class="btn btn-light" href="../index.html?topic=${k(s, "title")}#contact" data-i18n="cta">${tx("cta")}</a>
    </section>

    <section class="svc-others" aria-labelledby="others-title">
      <div class="svc-others-inner">
        <h2 id="others-title" data-i18n="othersTitle">${tx("othersTitle")}</h2>
        <ul class="svc-other-list">
${otherLinks}
        </ul>
        <p class="svc-back"><a href="../index.html" data-i18n="backHome">${tx("backHome")}</a></p>
      </div>
    </section>
  </main>

${footer}

  <script src="../translations.js"></script>
  <script src="../app.js"></script>
</body>
</html>
`;
}

mkdirSync("services", { recursive: true });
for (const s of SERVICES) writeFileSync(`services/${s.slug}.html`, page(s));
console.log(`index.html updated, ${SERVICES.length} service pages written to services/`);
