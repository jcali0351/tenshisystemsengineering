// Builds every generated part of the site from translations.js and the homepage's header and footer:
//   - index.html: the nine service cards, the form's topic list, the current menu item
//   - about.html, services.html, contact.html, news.html, blog.html
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

// The Technology page: groups (pictures from img/services) and the tools in each, with their logos (img/tech, from
// Simple Icons, CC0) and official sites. Descriptions are in translations.js (tech_<slug>, techG<n>Title/Text).
const TECH_GROUPS = [
  { n: 1, img: "design.jpg", items: [["figma", "Figma", "https://www.figma.com"], ["adobephotoshop", "Adobe Photoshop", "https://www.adobe.com/products/photoshop.html"], ["adobeillustrator", "Adobe Illustrator", "https://www.adobe.com/products/illustrator.html"], ["adobeaftereffects", "Adobe After Effects", "https://www.adobe.com/products/aftereffects.html"], ["adobepremierepro", "Adobe Premiere Pro", "https://www.adobe.com/products/premiere.html"], ["blender", "Blender", "https://www.blender.org"]] },
  { n: 2, img: "webdev.jpg", items: [["html5", "HTML5", "https://developer.mozilla.org/docs/Web/HTML"], ["css3", "CSS", "https://developer.mozilla.org/docs/Web/CSS"], ["javascript", "JavaScript", "https://developer.mozilla.org/docs/Web/JavaScript"], ["typescript", "TypeScript", "https://www.typescriptlang.org"], ["react", "React", "https://react.dev"], ["vuedotjs", "Vue.js", "https://vuejs.org"], ["nextdotjs", "Next.js", "https://nextjs.org"], ["tailwindcss", "Tailwind CSS", "https://tailwindcss.com"], ["sass", "Sass", "https://sass-lang.com"]] },
  { n: 3, img: "software.jpg", items: [["nodedotjs", "Node.js", "https://nodejs.org"], ["python", "Python", "https://www.python.org"], ["php", "PHP", "https://www.php.net"], ["postgresql", "PostgreSQL", "https://www.postgresql.org"], ["mysql", "MySQL", "https://www.mysql.com"]] },
  { n: 4, img: "cms.jpg", items: [["wordpress", "WordPress", "https://wordpress.org"], ["shopify", "Shopify", "https://www.shopify.com"], ["strapi", "Strapi", "https://strapi.io"]] },
  { n: 5, img: "hosting.jpg", items: [["github", "GitHub", "https://github.com"], ["docker", "Docker", "https://www.docker.com"], ["cloudflare", "Cloudflare", "https://www.cloudflare.com"], ["googlecloud", "Google Cloud", "https://cloud.google.com"], ["vercel", "Vercel", "https://vercel.com"]] },
  { n: 6, img: "ai.jpg", items: [["claude", "Claude", "https://www.anthropic.com/claude"]] },
];
// Product logos (img/tech, Simple Icons, CC0) shown on the Technology and service pages, in each brand's official colour.
const BRAND = {"adobeaftereffects":"#9999FF","adobeillustrator":"#FF9A00","adobephotoshop":"#31A8FF","adobepremierepro":"#9999FF","blender":"#E87D0D","claude":"#D97757","cloudflare":"#F38020","css3":"#1572B6","docker":"#2496ED","figma":"#F24E1E","github":"#181717","googlecloud":"#4285F4","html5":"#E34F26","javascript":"#F7DF1E","mysql":"#4479A1","nextdotjs":"#000000","nodedotjs":"#5FA04E","php":"#777BB4","postgresql":"#4169E1","python":"#3776AB","react":"#61DAFB","sass":"#CC6699","shopify":"#7AB55C","strapi":"#4945FF","tailwindcss":"#06B6D4","typescript":"#3178C6","vercel":"#000000","vuedotjs":"#4FC08D","wordpress":"#21759B"};


// The team page. To use real photos, put them in img/team/ and change img here; names, roles and bios are in
// translations.js (staff1Name, staff1Role, staff1Bio …).
const TEAM = [
  { n: 1, img: "illustrated-1.svg", skills: ["software", "webdev", "cms"] },
  { n: 2, img: "illustrated-2.svg", skills: ["consulting", "ai", "hosting"] },
  { n: 3, img: "illustrated-3.svg", skills: ["webdesign", "media", "branding"] },
  { n: 4, img: "illustrated-4.svg", skills: ["ai", "hosting", "software"] },
];

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
  // A folded newspaper with a signal going out.
  news: `<svg class="page-art" viewBox="0 0 320 220" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
      <rect x="64" y="46" width="160" height="128" rx="10" stroke-opacity=".85" stroke-width="2.5"/><path d="M224 74h20a10 10 0 0 1 10 10v74a16 16 0 0 1-32 0" stroke-opacity=".55" stroke-width="2.5"/>
      <rect x="84" y="66" width="56" height="44" rx="5" fill="#fff" fill-opacity=".9" stroke="none"/>
      <path d="M156 70h48M156 86h48M156 102h34M84 128h120M84 146h96" stroke-opacity=".6" stroke-width="2.5"/>
      <path d="M262 38a30 30 0 0 1 22 22M262 22a46 46 0 0 1 38 38" stroke-opacity=".35" stroke-width="1.5"/>
    </svg>`,
  // An open notebook and a pen.
  blog: `<svg class="page-art" viewBox="0 0 320 220" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 54c30-10 70-10 100 8v120c-30-18-70-18-100-8z" stroke-opacity=".85" stroke-width="2.5"/><path d="M250 54c-30-10-70-10-100 8v120c30-18 70-18 100-8z" stroke-opacity=".85" stroke-width="2.5"/>
      <path d="M70 84c20-5 42-4 62 4M70 108c20-5 42-4 62 4M70 132c20-5 42-4 62 4M168 88c20-8 42-9 62-4M168 112c20-8 42-9 62-4" stroke-opacity=".45" stroke-width="2"/>
      <path d="M256 168 292 70l14 6-36 98-16 10z" fill="#fff" fill-opacity=".9" stroke="none"/>
    </svg>`,
};

/* ---------- homepage: cards in three sets, the form's topic list, the current menu item ---------- */
const card = (s, pad, prefix) => `${pad}<article class="service-card">
${pad}  <h3 data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</h3>
${pad}  <img class="service-pic" src="${prefix}img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}" loading="lazy">
${pad}  <p data-i18n="${k(s, "short")}">${tx(k(s, "short"))}</p>
${pad}  <a class="btn-more" href="${prefix}services/${s.slug}.html"><span data-i18n="more">${tx("more")}</span><span class="sr-only">: <span data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</span></span></a>
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
const markCurrent = (html, current) => [].concat(current).reduce((h, c) =>
  h.replace(new RegExp(`(<a [^>]*?)( data-nav="${c}")`, "g"), `$1 aria-current="page"$2`),
  html.replace(/ aria-current="page"(?= data-nav=)/g, ""));
index = between(index, "services", carousel);
index = between(index, "topics", topics);
index = markCurrent(index, "home");
index = bakeEnglish(index);
writeFileSync("index.html", index);

/* Put the current English text into the homepage's own HTML (what search engines and the first paint see), for every
   plain-text element with data-i18n and every data-i18n-attr attribute, so text edited in translations.js (or the
   Tenshi Editor) shows up there too. Elements that contain other tags are left alone. */
function bakeEnglish(html) {
  html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n="([A-Za-z0-9_]+)"[^>]*>)([^<]*)(<\/\2>)/g,
    (m, open, tag, key, text, close) => (EN[key] === undefined ? m : open + esc(EN[key]) + close));
  return html.replace(/<[a-z0-9]+\b[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g, (tagHtml, spec) =>
    spec.split(";").reduce((t, pair) => {
      const [attr, key] = pair.split(":").map((s) => s && s.trim());
      if (!attr || !key || EN[key] === undefined) return t;
      const re = new RegExp(`(\\s${attr}=")[^"]*(")`);
      return re.test(t) ? t.replace(re, `$1${esc(EN[key])}$2`) : t;
    }, tagHtml));
}

/* ---------- shared page frame ---------- */
const HEADER = index.match(/  <header class="site-header">[\s\S]*?<\/header>/)[0];
const FOOTER = index.match(/  <footer class="site-footer">[\s\S]*?<\/footer>/)[0].replace(/\n\s*<p class="photo-credits">[\s\S]*?<\/p>/, "");
const FORM = index.match(/        <form class="contact-form"[\s\S]*?<\/form>/)[0];

// Point the copied links at the right folder and mark the current menu item.
function chrome(html, prefix, current) {
  return markCurrent(html, current)
    .replace('href="#top"', `href="${prefix}index.html"`)
    .replace(/src="(brand\/[\w.-]+)"/g, `src="${prefix}$1"`)
    .replace(/href="((?:index|about|services|contact|team|technology|projects|news|blog)\.html|projects\/[a-z-]+\.html)"/g, `href="${prefix}$1"`);
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
  <link rel="icon" href="${prefix}brand/tenshi-logo.png" type="image/png">
  <link rel="alternate icon" href="${prefix}brand/tenshi-apple-touch-icon.png" type="image/png">
  <link rel="apple-touch-icon" href="${prefix}brand/tenshi-apple-touch-icon.png">
  <link rel="stylesheet" href="${prefix}tailwind.css">
  <link rel="stylesheet" href="${prefix}styles.css">
  <link rel="stylesheet" href="${prefix}design.css">
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
  <script src="${prefix}design.js"></script>
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

/* ---------- About: the web speciality, journey, standards and the Osaka minimap ---------- */
const AB_ICON = {
  design: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/><path d="M12.5 13h5M12.5 16h3"/>',
  dev: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/><path d="m10 12-2 2 2 2M14 12l2 2-2 2"/>',
  host: '<rect x="4" y="3" width="16" height="6" rx="1.5"/><rect x="4" y="11" width="16" height="6" rx="1.5"/><path d="M7.5 6h.01M7.5 14h.01M11 6h5M11 14h5M12 17v4M8 21h8"/>',
  mission: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  vision: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  access: '<circle cx="12" cy="4.5" r="2"/><path d="M5 8.5l7 1.5 7-1.5M12 10v5l-3 6M12 15l3 6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
const abIcon = (n, cls = "ab-icon") => `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${AB_ICON[n]}</svg></span>`;
const MAP = { lat: 34.69375, lon: 135.5025, bbox: "135.4920,34.6890,135.5130,34.6985" };
const focusBlock = (key, ic, list) => `          <article class="ab-focus">
            <div class="ab-focus-head">${abIcon(ic, "ab-icon ab-icon-lg")}<h3 data-i18n="${key}T">${tx(key + "T")}</h3></div>
            <p data-i18n="${key}1">${tx(key + "1")}</p>
            <p data-i18n="${key}2">${tx(key + "2")}</p>
            <ul class="ab-checks">
${list.map((k2) => `              <li>${abIcon("check", "ab-check")}<span data-i18n="${k2}">${tx(k2)}</span></li>`).join("\n")}
            </ul>
          </article>`;
const aboutWeb = () => `    <section class="page-section ab-mv" aria-label="${tx("aboutMissionTitle")}" data-i18n-attr="aria-label:aboutMissionTitle">
      <div class="page-inner ab-mv-grid">
        <div class="ab-mv-card">${abIcon("mission")}<h2 data-i18n="aboutMissionTitle">${tx("aboutMissionTitle")}</h2><p data-i18n="aboutMission">${tx("aboutMission")}</p></div>
        <div class="ab-mv-card">${abIcon("vision")}<h2 data-i18n="aboutVisionTitle">${tx("aboutVisionTitle")}</h2><p data-i18n="aboutVision">${tx("aboutVision")}</p></div>
      </div>
    </section>

    <section class="page-section ab-web" aria-labelledby="focus-title">
      <div class="page-inner">
        <h2 id="focus-title" class="section-title light" data-i18n="aboutFocusTitle">${tx("aboutFocusTitle")}</h2>
        <p class="section-intro ab-web-intro" data-i18n="aboutFocusIntro">${tx("aboutFocusIntro")}</p>
        <div class="ab-focus-grid">
${focusBlock("focusDesign", "design", ["fd1", "fd2", "fd3", "fd4"])}
${focusBlock("focusDev", "dev", ["fdv1", "fdv2", "fdv3", "fdv4"])}
${focusBlock("focusHost", "host", ["fh1", "fh2", "fh3", "fh4"])}
        </div>
      </div>
    </section>

`;
const aboutJourney = () => `    <section class="page-section ab-journey" aria-labelledby="journey-title">
      <div class="page-inner">
        <h2 id="journey-title" class="section-title center" data-i18n="aboutJourneyTitle">${tx("aboutJourneyTitle")}</h2>
        <p class="section-intro center" data-i18n="aboutJourneyIntro">${tx("aboutJourneyIntro")}</p>
        <ol class="ab-steps">
${[1, 2, 3, 4, 5, 6].map((n) => `          <li class="ab-step"><span class="ab-step-num" aria-hidden="true">0${n}</span><h3 data-i18n="jr${n}T">${tx(`jr${n}T`)}</h3><p data-i18n="jr${n}">${tx(`jr${n}`)}</p></li>`).join("\n")}
        </ol>
      </div>
    </section>

    <section class="page-section tinted ab-std" aria-labelledby="std-title">
      <div class="page-inner">
        <h2 id="std-title" class="section-title center" data-i18n="aboutStdTitle">${tx("aboutStdTitle")}</h2>
        <ul class="ab-std-grid">
${[["phone", 1], ["access", 2], ["lock", 3], ["bolt", 4]].map(([ic, n]) => `          <li class="ab-std-card">${abIcon(ic)}<h3 data-i18n="std${n}T">${tx(`std${n}T`)}</h3><p data-i18n="std${n}">${tx(`std${n}`)}</p></li>`).join("\n")}
        </ul>
      </div>
    </section>

`;
const aboutFind = () => `
    <section class="page-section ab-find" aria-labelledby="find-title">
      <div class="page-inner ab-find-grid">
        <div class="ab-find-text">
          <h2 id="find-title" class="section-title" data-i18n="aboutFindTitle">${tx("aboutFindTitle")}</h2>
          <p class="page-lead" data-i18n="aboutFindIntro">${tx("aboutFindIntro")}</p>
          <dl class="ab-facts">
            <div><dt>${abIcon("globe", "ab-dt-icon")}<span data-i18n="infoLocation">${tx("infoLocation")}</span></dt><dd><b data-i18n="aboutArea">${tx("aboutArea")}</b><span data-i18n="aboutAreaText">${tx("aboutAreaText")}</span></dd></div>
            <div><dt>${abIcon("host", "ab-dt-icon")}<span data-i18n="aboutNearTitle">${tx("aboutNearTitle")}</span></dt><dd data-i18n="aboutNear">${tx("aboutNear")}</dd></div>
            <div><dt>${abIcon("vision", "ab-dt-icon")}<span data-i18n="aboutVisitTitle">${tx("aboutVisitTitle")}</span></dt><dd data-i18n="aboutVisit">${tx("aboutVisit")}</dd></div>
          </dl>
        </div>
        <figure class="minimap">
          <div class="minimap-frame">
            <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${MAP.bbox}&amp;layer=mapnik&amp;marker=${MAP.lat}%2C${MAP.lon}" title="${tx("aboutMapLabel")}" data-i18n-attr="title:aboutMapLabel" loading="lazy" referrerpolicy="no-referrer"></iframe>
            <span class="minimap-ping" aria-hidden="true"></span>
            <span class="minimap-compass" aria-hidden="true">N</span>
            <span class="minimap-corners" aria-hidden="true"></span>
            <span class="minimap-coords" aria-hidden="true">34.6938° N · 135.5025° E</span>
          </div>
          <figcaption><span data-i18n="aboutArea">${tx("aboutArea")}</span> · <a href="https://www.openstreetmap.org/?mlat=${MAP.lat}&amp;mlon=${MAP.lon}#map=16/${MAP.lat}/${MAP.lon}" target="_blank" rel="noopener"><span data-i18n="aboutMapOpen">${tx("aboutMapOpen")}</span> <span aria-hidden="true">↗</span></a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></figcaption>
        </figure>
      </div>
    </section>

    <section class="ab-global" aria-labelledby="global-title">
      <div class="page-inner ab-global-inner">
        ${abIcon("globe", "ab-icon ab-icon-lg")}
        <div><h2 id="global-title" data-i18n="aboutGlobalTitle">${tx("aboutGlobalTitle")}</h2><p data-i18n="aboutGlobal">${tx("aboutGlobal")}</p></div>
      </div>
    </section>
`;

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

${aboutWeb()}    <section class="page-section tinted" aria-labelledby="values-title">
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

${aboutJourney()}    <section class="page-section" aria-labelledby="osaka-title">
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

${aboutFind()}
    <section class="page-section team-teaser" aria-labelledby="meet-title">
      <div class="page-inner teaser-inner">
        <ul class="teaser-faces" aria-hidden="true">
${TEAM.map((m) => `          <li><img src="img/team/${m.img}" alt="" width="400" height="480" loading="lazy"></li>`).join("\n")}
        </ul>
        <div>
          <h2 id="meet-title" class="section-title" data-i18n="aboutTeamTitle">${tx("aboutTeamTitle")}</h2>
          ${t("p", "aboutTeamText", 'class="page-lead"')}
          <a class="btn btn-primary" href="team.html" data-i18n="aboutTeamBtn">${tx("aboutTeamBtn")}</a>
        </div>
      </div>
    </section>

${cta("contact.html")}`,
});
writeFileSync("about.html", about);

/* ---------- Team ---------- */
const teamPage = frame({
  prefix: "", current: "team", titleKey: "teamTitle", descKey: "teamLead", bodyClass: "page team-page",
  main: `${banner("", [{ key: "navAbout", href: "about.html" }, { key: "navTeam" }], "teamTitle", "teamLead")}

    <section class="page-section team-section" aria-labelledby="team-list-title">
      <div class="page-inner">
        <h2 id="team-list-title" class="sr-only" data-i18n="teamTitle">${tx("teamTitle")}</h2>
        ${t("p", "teamIntro", 'class="section-intro"')}
        <ul class="team-grid">
${TEAM.map((m) => `          <li>
            <button type="button" class="team-card" data-member="${m.n}" aria-haspopup="dialog">
              <span class="team-photo"><img src="img/team/${m.img}" alt="${tx("teamPhotoAlt")}" data-i18n-attr="alt:teamPhotoAlt" width="400" height="480"></span>
              <span class="team-text">
                <span class="team-name" data-i18n="staff${m.n}Name">${tx(`staff${m.n}Name`)}</span>
                <span class="team-role" data-i18n="staff${m.n}Role">${tx(`staff${m.n}Role`)}</span>
                <span class="team-view"><span data-i18n="teamView">${tx("teamView")}</span> <span aria-hidden="true">→</span></span>
              </span>
            </button>
            <div class="team-detail" id="member-${m.n}" hidden>
              <img class="td-photo" src="img/team/${m.img}" alt="${tx("teamPhotoAlt")}" data-i18n-attr="alt:teamPhotoAlt" width="400" height="480">
              <div class="td-text">
                <p class="td-role" data-i18n="staff${m.n}Role">${tx(`staff${m.n}Role`)}</p>
                <h3 class="td-name" data-i18n="staff${m.n}Name">${tx(`staff${m.n}Name`)}</h3>
                <p class="td-bio" data-i18n="staff${m.n}Bio">${tx(`staff${m.n}Bio`)}</p>
                <p class="td-skills-title" data-i18n="teamSkills">${tx("teamSkills")}</p>
                <ul class="td-skills">
${m.skills.map((id) => { const s = SERVICES.find((x) => x.id === id); return `                  <li><a href="services/${s.slug}.html" data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</a></li>`; }).join("\n")}
                </ul>
                <a class="btn btn-primary td-contact" href="contact.html" data-i18n="teamContact">${tx("teamContact")}</a>
              </div>
            </div>
          </li>`).join("\n")}
        </ul>
        ${t("p", "teamPlaceholder", 'class="team-note"')}
      </div>
    </section>

${cta("contact.html")}`,
});
writeFileSync("team.html", teamPage);

// A drawn line icon for each service (24 x 24, stroke), used in the detailed descriptions.
const SVC_ICON = {
  software: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 5-3 14"/>',
  consulting: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/><path d="M3 9h2M3 15h2M19 9h2M19 15h2"/>',
  webdesign: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/><path d="M12.5 13h5M12.5 16h3"/>',
  webdev: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/><circle cx="5.8" cy="6" r=".5" fill="currentColor"/><circle cx="7.8" cy="6" r=".5" fill="currentColor"/><path d="m10 12-2 2 2 2M14 12l2 2-2 2"/>',
  hosting: '<rect x="4" y="3" width="16" height="6" rx="1.5"/><rect x="4" y="11" width="16" height="6" rx="1.5"/><path d="M7.5 6h.01M7.5 14h.01M11 6h5M11 14h5M12 17v4M8 21h8"/>',
  ai: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/><path d="m12 9 .9 2.1L15 12l-2.1.9L12 15l-.9-2.1L9 12l2.1-.9z"/>',
  cms: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m9 17 .6-2.4 5-5 1.8 1.8-5 5z"/>',
  branding: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18 3-18"/>',
};
const svcIcon = (s, cls = "svc-icon") => `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SVC_ICON[s.id]}</svg></span>`;
const detailSection = (prefix) => `    <section class="page-section svc-detail-section" aria-labelledby="detail-title">
      <div class="page-inner">
        <h2 id="detail-title" class="section-title" data-i18n="detailTitle">${tx("detailTitle")}</h2>
        ${t("p", "detailIntro", 'class="section-intro"')}
        <div class="svc-detail-list">
${SERVICES.map((s) => `          <article class="svc-detail" id="${s.slug}">
            <figure class="svc-detail-pic">
              <img src="${prefix}img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}" loading="lazy">
              ${svcIcon(s, "svc-icon svc-icon-badge")}
            </figure>
            <div class="svc-detail-body">
              <h3 class="svc-detail-title">${svcIcon(s)}<span data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</span></h3>
              <p class="svc-detail-short" data-i18n="${k(s, "short")}">${tx(k(s, "short"))}</p>
              <p data-i18n="${k(s, "long1")}">${tx(k(s, "long1"))}</p>
              <p data-i18n="${k(s, "long2")}">${tx(k(s, "long2"))}</p>
              <ul class="svc-detail-tags">
${[1, 2, 3, 4, 5].map((n) => `                <li data-i18n="${k(s, "o" + n)}">${tx(k(s, "o" + n))}</li>`).join("\n")}
              </ul>
              <a class="btn btn-primary" href="${prefix}services/${s.slug}.html"><span data-i18n="more">${tx("more")}</span><span class="sr-only">: <span data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</span></span></a>
            </div>
          </article>`).join("\n")}
        </div>
      </div>
    </section>`;
const depthSection = (s) => `    <section class="svc-depth" aria-labelledby="depth-title">
      <div class="svc-wide svc-depth-inner">
        ${svcIcon(s, "svc-icon svc-icon-lg")}
        <div>
          <h2 id="depth-title" class="section-title" data-i18n="depthTitle">${tx("depthTitle")}</h2>
          <p data-i18n="${k(s, "long1")}">${tx(k(s, "long1"))}</p>
          <p data-i18n="${k(s, "long2")}">${tx(k(s, "long2"))}</p>
        </div>
      </div>
    </section>

`;

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

${detailSection("")}

${process()}

${cta("contact.html")}`,
});
writeFileSync("services.html", servicesPage);

/* ---------- Technology: the Japanese robotics patent explorer (live searches of public patent databases) ---------- */
const GP = "https://patents.google.com/";
const gp = (q, extra = "") => `${GP}?q=${encodeURIComponent(q)}&amp;country=JP${extra}`;
const PAT_TOPICS = [
  ['("industrial robot" arm)', '<path d="M4 20h8M8 20v-4l4-6 5 2"/><circle cx="12" cy="10" r="1.6"/><circle cx="8" cy="16" r="1.6"/><path d="M17 12l2-3M17 12l3 1"/>'],
  ['("robot hand" OR gripper)', '<path d="M7 21v-6l-2-4V6M10 11V4M13 11V3.5M16 11V5M19 13V8"/><path d="M5 11h14v2a6 6 0 0 1-6 6h-2"/>'],
  ['("collaborative robot")', '<circle cx="8" cy="7" r="3"/><path d="M3 20c0-3 2.2-5.5 5-5.5"/><path d="M14 20v-5l3-4 3 1"/><circle cx="17" cy="11" r="1.4"/>'],
  ['("humanoid robot")', '<rect x="8" y="3" width="8" height="6" rx="2"/><path d="M10.5 6h.01M13.5 6h.01M12 9v2"/><rect x="7" y="11" width="10" height="6" rx="1.5"/><path d="M9 17v4M15 17v4M7 13l-3 3M17 13l3 3"/>'],
  ['("legged robot" OR "walking robot")', '<rect x="6" y="7" width="12" height="5" rx="2"/><path d="M8 12l-2 4 2 4M16 12l2 4-2 4M12 7V4"/>'],
  ['("surgical robot")', '<path d="M5 20h6M8 20v-6l5-5"/><path d="M13 9l4-4 2 2-4 4"/><path d="M17 11l3 3"/>'],
  ['("nursing care" robot)', '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M9 11h6M12 8v6"/>'],
  ['(exoskeleton OR "power assist suit")', '<circle cx="12" cy="4" r="2"/><path d="M12 6v7M8 9h8M9 21l3-8 3 8"/><path d="M7 9v5M17 9v5"/>'],
  ['(robot "vision sensor")', '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M12 9V7M15 12h2"/>'],
  ['("robot controller" servo)', '<circle cx="12" cy="12" r="7"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/><circle cx="12" cy="12" r="2"/>'],
  ['("autonomous mobile robot")', '<rect x="4" y="9" width="16" height="7" rx="2"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/><path d="M12 9V5M9 5h6"/>'],
  ['(robot "machine learning")', '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/><path d="M10 12h4M12 10v4"/>'],
];
const PAT_CO = ["Fanuc", "Yaskawa Electric", "Kawasaki Heavy Industries", "Denso", "Honda Motor", "Toyota Motor", "Sony", "Panasonic", "Omron", "Mitsubishi Electric", "Seiko Epson", "Cyberdyne"];
const patIcon = (p) => `<span class="pat-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
const newTab = `<span class="sr-only"> (<span data-i18n="techNewTab">${tx("techNewTab")}</span>)</span>`;
const patentSection = () => `    <section class="page-section pat-section" id="patents" aria-labelledby="pat-title">
      <div class="page-inner">
        <h2 id="pat-title" class="section-title light" data-i18n="patTitle">${tx("patTitle")}</h2>
        <p class="pat-intro" data-i18n="patIntro">${tx("patIntro")}</p>
        <form class="pat-search" action="${GP}" method="get" target="_blank" role="search">
          <label for="pat-q" class="pat-label" data-i18n="patSearchLabel">${tx("patSearchLabel")}</label>
          <div class="pat-row">
            <input id="pat-q" name="q" type="search" required autocomplete="off" placeholder="${tx("patPlaceholder")}" data-i18n-attr="placeholder:patPlaceholder">
            <input type="hidden" name="country" value="JP">
            <button class="btn btn-primary" type="submit" data-i18n="patBtn">${tx("patBtn")}</button>
          </div>
          <label class="pat-check"><input type="checkbox" name="sort" value="new"> <span data-i18n="patNewest">${tx("patNewest")}</span></label>
        </form>
        <h3 class="pat-sub" data-i18n="patTopicsTitle">${tx("patTopicsTitle")}</h3>
        <ul class="pat-grid">
${PAT_TOPICS.map(([q, ic], i) => `          <li><a class="pat-card" href="${gp(q)}" target="_blank" rel="noopener">
            ${patIcon(ic)}
            <span class="pat-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
            <b data-i18n="pt${i + 1}">${tx("pt" + (i + 1))}</b>
            <span class="pat-desc" data-i18n="pt${i + 1}d">${tx("pt" + (i + 1) + "d")}</span>
            <span class="pat-go"><span data-i18n="patOpen">${tx("patOpen")}</span> <span aria-hidden="true">↗</span>${newTab}</span>
          </a></li>`).join("\n")}
        </ul>
        <h3 class="pat-sub" data-i18n="patCoTitle">${tx("patCoTitle")}</h3>
        <p class="pat-co-intro" data-i18n="patCoIntro">${tx("patCoIntro")}</p>
        <ul class="pat-co">
${PAT_CO.map((c) => `          <li><a href="${gp("(robot)", "&amp;assignee=" + encodeURIComponent(c) + "&amp;sort=new")}" target="_blank" rel="noopener">${esc(c)}${newTab}</a></li>`).join("\n")}
        </ul>
        <div class="pat-sources">
          <h3 class="pat-sub" data-i18n="patSourcesTitle">${tx("patSourcesTitle")}</h3>
          <ul>
            <li><a href="https://www.j-platpat.inpit.go.jp/" target="_blank" rel="noopener"><b>J-PlatPat</b></a> · <span data-i18n="patJplat">${tx("patJplat")}</span></li>
            <li><a href="${GP}?country=JP" target="_blank" rel="noopener"><b>Google Patents</b></a> · <span data-i18n="patGoogle">${tx("patGoogle")}</span></li>
          </ul>
          <p class="pat-note" data-i18n="patNote">${tx("patNote")}</p>
        </div>
      </div>
    </section>

`;

/* ---------- Technology ---------- */
const techPage = frame({
  prefix: "", current: "technology", titleKey: "techTitle", descKey: "techLead", bodyClass: "page tech-page",
  main: `${banner("", [{ key: "navTech" }], "techTitle", "techLead", ART.services)}

    <section class="page-section tech-section" aria-labelledby="tech-list-title">
      <div class="page-inner">
        <h2 id="tech-list-title" class="sr-only" data-i18n="techTitle">${tx("techTitle")}</h2>
        <div class="tech-filter" role="group" aria-label="${tx("techFilterLabel")}" data-i18n-attr="aria-label:techFilterLabel">
          <button type="button" data-filter="all" aria-pressed="true" data-i18n="techAll">${tx("techAll")}</button>
${TECH_GROUPS.map((gr) => `          <button type="button" data-filter="${gr.n}" aria-pressed="false" data-i18n="techG${gr.n}Title">${tx(`techG${gr.n}Title`)}</button>`).join("\n")}
        </div>
${TECH_GROUPS.map((gr) => `        <section class="tech-group" data-group="${gr.n}" aria-labelledby="tech-g${gr.n}">
          <div class="tech-group-head">
            <img class="tech-group-pic" src="img/services/${gr.img}" alt="" width="960" height="640" loading="lazy">
            <div>
              <h3 id="tech-g${gr.n}" class="tech-group-title" data-i18n="techG${gr.n}Title">${tx(`techG${gr.n}Title`)}</h3>
              <p class="tech-group-text" data-i18n="techG${gr.n}Text">${tx(`techG${gr.n}Text`)}</p>
            </div>
          </div>
          <ul class="tech-grid">
${gr.items.map(([slug, name, url]) => `            <li class="tech-card">
              <span class="tech-logo tech-logo--color" style="--brand: ${BRAND[slug]}" aria-hidden="true"><img src="img/tech-color/${slug}.svg" alt="" width="36" height="36" loading="lazy"></span>
              <h4 class="tech-name">${name}</h4>
              <p class="tech-desc" data-i18n="tech_${slug}">${tx(`tech_${slug}`)}</p>
              <a class="tech-link" href="${url}" target="_blank" rel="noopener"><span data-i18n="techVisit">${tx("techVisit")}</span><span class="sr-only">: ${name} <span data-i18n="techNewTab">${tx("techNewTab")}</span></span> <span aria-hidden="true">↗</span></a>
            </li>`).join("\n")}
          </ul>
        </section>`).join("\n")}
        ${t("p", "techNote", 'class="tech-note"')}
      </div>
    </section>

${patentSection()}${cta("contact.html")}`,
});
writeFileSync("technology.html", techPage);

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
          <article class="contact-pitch" aria-labelledby="pitch-title">
            <p class="pitch-kicker" data-i18n="pitchKicker">${tx("pitchKicker")}</p>
            <h2 id="pitch-title" class="pitch-title" data-i18n="pitchTitle">${tx("pitchTitle")}</h2>
            <p class="pitch-lead" data-i18n="pitchLead">${tx("pitchLead")}</p>
            <p data-i18n="pitchP1">${tx("pitchP1")}</p>
            <h3 data-i18n="pitchWhyTitle">${tx("pitchWhyTitle")}</h3>
            <ul class="pitch-why">
${[1, 2, 3, 4].map((n) => `              <li data-i18n="pitchWhy${n}">${tx("pitchWhy" + n)}</li>`).join("\n")}
            </ul>
            <p data-i18n="pitchP4">${tx("pitchP4")}</p>
            <h3 data-i18n="pitchNextTitle">${tx("pitchNextTitle")}</h3>
            <ol class="pitch-next">
${[1, 2, 3].map((n) => `              <li data-i18n="pitchNext${n}">${tx("pitchNext" + n)}</li>`).join("\n")}
            </ol>
            <p data-i18n="pitchP2">${tx("pitchP2")}</p>
            <p class="pitch-omote" data-i18n="pitchP3">${tx("pitchP3")}</p>
            <p class="pitch-sign"><span data-i18n="pitchSign">${tx("pitchSign")}</span><b data-i18n="pitchTeam">${tx("pitchTeam")}</b></p>
          </article>
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
const SERVICE_TECH = {
  software: ["python", "nodedotjs", "typescript", "postgresql", "docker", "github"],
  consulting: ["googlecloud", "cloudflare", "github", "docker", "claude"],
  media: ["adobephotoshop", "adobeillustrator", "adobeaftereffects", "adobepremierepro", "blender", "figma"],
  webdesign: ["figma", "adobeillustrator", "adobephotoshop", "html5", "css3", "tailwindcss"],
  webdev: ["html5", "css3", "javascript", "typescript", "react", "vuedotjs", "nextdotjs", "nodedotjs", "php"],
  hosting: ["cloudflare", "googlecloud", "vercel", "docker", "github"],
  ai: ["claude", "python", "nodedotjs", "postgresql"],
  cms: ["wordpress", "strapi", "shopify", "php", "mysql"],
  branding: ["adobeillustrator", "adobephotoshop", "figma"],
};
const TECH_NAME = Object.fromEntries(TECH_GROUPS.flatMap((g) => g.items.map(([slug, name]) => [slug, name])));
const BENEFIT_ICON = [
  '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
];

function servicePage(s) {
  const others = SERVICES.filter((o) => o !== s);
  const ask = `../contact.html?topic=${k(s, "title")}`;
  const offers = Array.from({ length: OFFERS }, (_, i) => `          <li class="offer-card">
            <span class="offer-num" aria-hidden="true">0${i + 1}</span>
            <h3 data-i18n="${k(s, "o" + (i + 1))}">${tx(k(s, "o" + (i + 1)))}</h3>
            <p data-i18n="${k(s, "d" + (i + 1))}">${tx(k(s, "d" + (i + 1)))}</p>
          </li>`).join("\n");
  const benefits = [1, 2, 3].map((n) => `          <li class="benefit-card">
            <span class="benefit-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BENEFIT_ICON[n - 1]}</svg></span>
            <h3 data-i18n="${k(s, "b" + n + "t")}">${tx(k(s, "b" + n + "t"))}</h3>
            <p data-i18n="${k(s, "b" + n)}">${tx(k(s, "b" + n))}</p>
          </li>`).join("\n");
  const tech = (SERVICE_TECH[s.id] || []).map((slug) => `          <li><a class="svc-tech" href="../technology.html">
            <span class="svc-tech-logo svc-tech-logo--color" style="--brand: ${BRAND[slug]}" aria-hidden="true"><img src="../img/tech-color/${slug}.svg" alt="" width="38" height="38" loading="lazy"></span>
            <span class="svc-tech-name">${TECH_NAME[slug]}</span>
          </a></li>`).join("\n");
  return frame({
    prefix: "../", current: "services", titleKey: k(s, "title"), descKey: k(s, "short"), bodyClass: "svc-page",
    main: `${banner("../", [{ key: "crumbServices", href: "../services.html" }, { key: k(s, "title") }], k(s, "title"), k(s, "short"))}

    <section class="svc-body" aria-labelledby="intro-title">
      <div class="svc-body-inner">
        <div class="svc-copy">
          <h2 id="intro-title" class="sr-only" data-i18n="${k(s, "title")}">${tx(k(s, "title"))}</h2>
          <p class="svc-intro" data-i18n="${k(s, "intro")}">${tx(k(s, "intro"))}</p>
          <div class="svc-for">
            <h3 data-i18n="forTitle">${tx("forTitle")}</h3>
            <p data-i18n="${k(s, "for")}">${tx(k(s, "for"))}</p>
          </div>
          <a class="btn btn-primary" href="${ask}" data-i18n="cta">${tx("cta")}</a>
        </div>
        <figure class="svc-figure">
          <img src="../img/services/${s.img}" alt="${tx(k(s, "alt"))}" data-i18n-attr="alt:${k(s, "alt")}" width="${s.w}" height="${s.h}">
        </figure>
      </div>
    </section>

${depthSection(s)}    <section class="svc-offer-section" aria-labelledby="offer-title">
      <div class="svc-wide">
        <h2 id="offer-title" class="section-title" data-i18n="offerTitle">${tx("offerTitle")}</h2>
        <ul class="offer-grid">
${offers}
        </ul>
      </div>
    </section>

    <section class="svc-benefits" aria-labelledby="benefits-title">
      <div class="svc-wide">
        <h2 id="benefits-title" class="section-title light" data-i18n="benefitsTitle">${tx("benefitsTitle")}</h2>
        <ul class="benefit-grid">
${benefits}
        </ul>
      </div>
    </section>

    <section class="svc-tech-section" aria-labelledby="tech-used-title">
      <div class="svc-wide">
        <h2 id="tech-used-title" class="section-title" data-i18n="techUsedTitle">${tx("techUsedTitle")}</h2>
        <ul class="svc-tech-grid">
${tech}
        </ul>
        <p class="svc-tech-more"><a href="../technology.html"><span data-i18n="techUsedMore">${tx("techUsedMore")}</span> <span aria-hidden="true">→</span></a></p>
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
/* ---------- Projects: our own software (World of Warcraft add-ons) ---------- */
const CF = "https://www.curseforge.com/wow/addons/";
const PROJECTS = [
  {
    id: "sc", slug: "storycaster", logo: "storycaster-logo",
    shots: [["storycaster-console.jpg", 1150, 860], ["storycaster-lore.jpg", 1150, 830], ["storycaster-pirate.jpg", 1000, 610], ["storycaster-ideas.jpg", 1150, 730]],
    editions: [
      { name: "StoryCaster", game: "Midnight", ed: "projEdMidnight", ver: "2.0.1", zip: "StoryCaster.zip", cf: CF + "storycaster", cmd: "/story" },
      { name: "StoryCaster", game: "WoW Forever", ed: "projEdForever", ver: "2.0.1", zip: "StoryCaster-Forever.zip", cf: CF + "storycaster-wow-forever", cmd: "/story" },
    ],
  },
  {
    id: "mbp", slug: "master-baiter-pro", logo: "master-baiter-pro-logo",
    shots: [["master-baiter-pro-panel.jpg", 880, 560]],
    editions: [
      { name: "Master Baiter Pro", game: "Midnight", ed: "projEdMidnight", ver: "2.3.1", zip: "MasterBaiterPro.zip", cf: CF + "master-baiter-pro", cmd: "/mbp" },
      { name: "Master Bait Forever", game: "WoW Forever", ed: "projEdForever", ver: "1.1.1", zip: "MasterBaitForever.zip", cf: "", cmd: "/mbf" },
    ],
  },
];
const pk = (p, f) => `prj_${p.id}_${f}`;
const PICON = {
  game: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9" fill="currentColor"/><circle cx="17.8" cy="13.8" r=".9" fill="currentColor"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  forge: '<path d="M4 9h11l3-3h2v4a4 4 0 0 1-4 4h-1l1 4H8l1-4H7a3 3 0 0 1-3-3z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
};
const pIcon = (n) => `<svg class="prj-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PICON[n]}</svg>`;
const logoPic = (p, prefix, cls, size) => `<picture><source srcset="${prefix}img/projects/${p.logo}.webp" type="image/webp"><img class="${cls}" src="${prefix}img/projects/${p.logo}.png" alt="${tx(pk(p, "logoAlt"))}" data-i18n-attr="alt:${pk(p, "logoAlt")}" width="${size}" height="${size}"${cls === "prj-card-logo" ? ' loading="lazy"' : ""}></picture>`;
const dlButton = (e, prefix) => `<a class="btn prj-btn prj-btn-dl" href="${prefix}downloads/${e.zip}" download><span data-i18n="projDownload">${tx("projDownload")}</span> <span class="prj-btn-note">${e.zip}</span></a>`;
const cfButton = (e) => e.cf ? `<a class="btn prj-btn prj-btn-cf" href="${e.cf}" target="_blank" rel="noopener"><span data-i18n="projCurseForge">${tx("projCurseForge")}</span><span class="sr-only"> (${esc(e.game)}, <span data-i18n="techNewTab">${tx("techNewTab")}</span>)</span></a>` : "";

const projCard = (p, prefix) => `          <article class="prj-card">
            <a class="prj-card-media" href="${prefix}projects/${p.slug}.html" tabindex="-1" aria-hidden="true">${logoPic(p, prefix, "prj-card-logo", 160)}</a>
            <div class="prj-card-body">
              <p class="prj-kicker">${pIcon("game")}<span data-i18n="projGameTag">${tx("projGameTag")}</span></p>
              <h3><a href="${prefix}projects/${p.slug}.html" data-i18n="${pk(p, "name")}">${tx(pk(p, "name"))}</a></h3>
              <p class="prj-card-tag" data-i18n="${pk(p, "tag")}">${tx(pk(p, "tag"))}</p>
              <ul class="prj-chips">
                <li class="prj-chip prj-chip-free" data-i18n="projFree">${tx("projFree")}</li>
${p.editions.map((e) => `                <li class="prj-chip">${esc(e.game)}</li>`).join("\n")}
                <li class="prj-chip"><code>${p.editions[0].cmd}</code></li>
              </ul>
              <div class="prj-card-actions">
                <a class="btn prj-btn prj-btn-view" href="${prefix}projects/${p.slug}.html"><span data-i18n="projView">${tx("projView")}</span></a>
${cfButton(p.editions[0]) ? "                " + cfButton(p.editions[0]) + "\n" : ""}              </div>
            </div>
          </article>`;

const projectsPage = frame({
  prefix: "", current: "projects", titleKey: "navProjects", descKey: "projectsLead", bodyClass: "page projects-page",
  main: `${banner("", [{ key: "navProjects" }], "projectsTitle", "projectsLead", `<div class="prj-hero-logos" aria-hidden="true">${PROJECTS.map((p) => `<img src="img/projects/${p.logo}.webp" alt="" width="150" height="150">`).join("")}</div>`)}

    <section class="page-section prj-section" aria-labelledby="games-title">
      <div class="page-inner">
        ${t("p", "projectsIntro", 'class="section-intro prj-intro"')}
        <div class="prj-group-head">
          <span class="prj-group-icon">${pIcon("game")}</span>
          <div>
            <h2 id="games-title" class="prj-group-title" data-i18n="projGamesTitle">${tx("projGamesTitle")}</h2>
            <p data-i18n="projGamesText">${tx("projGamesText")}</p>
          </div>
        </div>
        <div class="prj-grid">
${PROJECTS.map((p) => projCard(p, "")).join("\n")}
        </div>
      </div>
    </section>

${cta("contact.html")}`,
});
writeFileSync("projects.html", projectsPage);

function projectPage(p) {
  const others = PROJECTS.filter((o) => o !== p);
  const [first, ...rest] = p.shots;
  const shot = ([file, w, h], n, lazy) => `<img src="../img/projects/${file}" alt="${tx(pk(p, "alt" + n))}" data-i18n-attr="alt:${pk(p, "alt" + n)}" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ""}>`;
  return frame({
    prefix: "../", current: ["projects", "p-" + p.slug], titleKey: pk(p, "name"), descKey: pk(p, "tag"), bodyClass: "page prj-page",
    main: `${banner("../", [{ key: "navProjects", href: "../projects.html" }, { key: pk(p, "name") }], pk(p, "name"), pk(p, "tag"), `<div class="prj-hero-logo">${logoPic(p, "../", "prj-logo", 220)}</div>`)}

    <section class="svc-body prj-body" aria-labelledby="intro-title">
      <div class="svc-body-inner">
        <div class="svc-copy">
          <h2 id="intro-title" class="sr-only" data-i18n="${pk(p, "name")}">${tx(pk(p, "name"))}</h2>
          <p class="prj-kicker">${pIcon("game")}<span data-i18n="projGameTag">${tx("projGameTag")}</span></p>
          <p class="svc-intro" data-i18n="${pk(p, "intro")}">${tx(pk(p, "intro"))}</p>
          <ul class="prj-chips">
            <li class="prj-chip prj-chip-free" data-i18n="projFree">${tx("projFree")}</li>
            <li class="prj-chip"><span data-i18n="projVersion">${tx("projVersion")}</span> ${p.editions[0].ver}</li>
            <li class="prj-chip"><span data-i18n="projCommand">${tx("projCommand")}</span> <code>${p.editions[0].cmd}</code></li>
          </ul>
          <div class="prj-actions">
            ${dlButton(p.editions[0], "../")}
${cfButton(p.editions[0]) ? "            " + cfButton(p.editions[0]) + "\n" : ""}          </div>
        </div>
        <figure class="svc-figure prj-shot">
          ${shot(first, 1, false)}
        </figure>
      </div>
    </section>

    <section class="svc-offer-section" aria-labelledby="feat-title">
      <div class="svc-wide">
        <h2 id="feat-title" class="section-title" data-i18n="projFeaturesTitle">${tx("projFeaturesTitle")}</h2>
        <ul class="offer-grid">
${[1, 2, 3, 4, 5, 6].map((n) => `          <li class="offer-card">
            <span class="offer-num" aria-hidden="true">0${n}</span>
            <h3 data-i18n="${pk(p, "f" + n + "t")}">${tx(pk(p, "f" + n + "t"))}</h3>
            <p data-i18n="${pk(p, "f" + n)}">${tx(pk(p, "f" + n))}</p>
          </li>`).join("\n")}
        </ul>
      </div>
    </section>

    <section class="svc-benefits prj-editions" aria-labelledby="ed-title">
      <div class="svc-wide">
        <h2 id="ed-title" class="section-title light" data-i18n="projEditionsTitle">${tx("projEditionsTitle")}</h2>
        <ul class="prj-ed-grid">
${p.editions.map((e) => `          <li class="prj-ed">
            <p class="prj-ed-game">${esc(e.game)}</p>
            <h3>${esc(e.name)}</h3>
            <p data-i18n="${e.ed}">${tx(e.ed)}</p>
            <p class="prj-ed-meta"><span data-i18n="projVersion">${tx("projVersion")}</span> ${e.ver} · <code>${e.cmd}</code></p>
            <div class="prj-actions">
              ${dlButton(e, "../")}
${cfButton(e) ? "              " + cfButton(e) + "\n" : ""}            </div>
          </li>`).join("\n")}
        </ul>
${p.editions.some((e) => e.cf) ? `        <p class="prj-cf-note" data-i18n="projCurseText">${tx("projCurseText")}</p>\n` : ""}      </div>
    </section>
${rest.length ? `
    <section class="svc-tech-section prj-gallery" aria-labelledby="shots-title">
      <div class="svc-wide">
        <h2 id="shots-title" class="section-title" data-i18n="projShotsTitle">${tx("projShotsTitle")}</h2>
        <div class="prj-shots">
${rest.map((s, i) => `          <figure class="prj-shot-fig">
            ${shot(s, i + 2, true)}
            <figcaption data-i18n="${pk(p, "alt" + (i + 2))}">${tx(pk(p, "alt" + (i + 2)))}</figcaption>
          </figure>`).join("\n")}
        </div>
      </div>
    </section>
` : ""}
    <section class="svc-process" aria-labelledby="install-title">
      <div class="svc-process-inner">
        <h2 id="install-title" data-i18n="projInstallTitle">${tx("projInstallTitle")}</h2>
        <ol class="svc-steps">
${[1, 2, 3, 4].map((n) => `          <li class="svc-step">
            <span class="svc-step-num" aria-hidden="true">0${n}</span>
            <p data-i18n="projInstall${n}">${tx("projInstall" + n)}</p>
          </li>`).join("\n")}
        </ol>
      </div>
    </section>

    <section class="prj-fair" aria-labelledby="fair-title">
      <div class="svc-wide prj-fair-inner">
        <span class="benefit-icon">${pIcon("shield")}</span>
        <div>
          <h2 id="fair-title" data-i18n="projFairTitle">${tx("projFairTitle")}</h2>
          <p data-i18n="${pk(p, "fair")}">${tx(pk(p, "fair"))}</p>
        </div>
      </div>
    </section>

    <section class="page-section prj-section prj-more" aria-labelledby="more-title">
      <div class="page-inner">
        <h2 id="more-title" class="prj-group-title" data-i18n="projMore">${tx("projMore")}</h2>
        <div class="prj-grid">
${others.map((o) => projCard(o, "../")).join("\n")}
        </div>
        <p class="svc-back"><a href="../projects.html" data-i18n="projAll">${tx("projAll")}</a></p>
      </div>
    </section>

${cta("../contact.html")}`,
  });
}
/* ---------- News: company updates (placeholder text in translations.js) and ten stories from Japan ----------
   The stories are summaries in our own words with a link to each original report. To refresh them, change this list
   (newest first) and run the build. */
const NEWS = [
  { date: "2026-11-15", source: "DigiTimes Asia", topic: "Semiconductors", url: "https://www.digitimes.com/news/a20261112VL210/hoya-euv-photomask-samsung-2027.html",
    title: "Hoya reportedly can't cover all of Samsung's 2027 EUV mask blank order",
    text: "The Tokyo optics maker is said to have told Samsung it will struggle to supply the extra extreme-ultraviolet mask blanks the chipmaker wants for 2027, a sign of how tight Japan's chip-material supply has become." },
  { date: "2026-11-12", source: "DigiTimes Asia", topic: "Manufacturing", url: "https://www.digitimes.com/news/a20261112PD232/sharp-plant-nitto-denko-lcd-business.html",
    title: "Sharp sells its Mie LCD color filter plant to Nitto Denko for ¥22.2 billion",
    text: "Sharp is offloading its Hisai plant in Tsu, Mie Prefecture, as it moves faster to fix its loss-making display components business." },
  { date: "2026-11-12", source: "DigiTimes Asia", topic: "AI hardware", url: "https://www.digitimes.com/news/a20261111PD248/mitsui-kinzoku-copper-foil-malaysia-plant-capacity-equipment.html",
    title: "Mitsui Kinzoku puts ¥190 billion into a new copper foil plant in Malaysia",
    text: "The materials maker will build roughly US$1.2 billion of new capacity next to its existing Malaysian site, aimed at the ultrathin foil used in optical communications gear for AI data centers." },
  { date: "2026-11-12", source: "DigiTimes Asia", topic: "AI & investment", url: "https://www.digitimes.com/news/a20261111PD245/equipment-loss-2026-market.html",
    title: "SoftBank books a ¥768 billion AI-related hit and rethinks its equipment plans",
    text: "SoftBank is reconsidering its strategy for AI equipment after taking a loss of about ¥768 billion tied to its artificial intelligence bets." },
  { date: "2026-11-12", source: "DigiTimes Asia", topic: "Automotive", url: "https://www.digitimes.com/news/a20261111PD271/toyota-vehicle-usa-sales-2027.html",
    title: "Toyota will build and sell Japanese light-duty trucks in the United States",
    text: "Toyota plans to assemble its Japanese light-duty trucks in the US, with American sales due to start in the second half of 2027." },
  { date: "2026-11-11", source: "DigiTimes Asia", topic: "Semiconductors", url: "https://www.digitimes.com/news/a20261111VL204/rapidus-2nm-production-manufacturing-development.html",
    title: "Rapidus reportedly behind schedule on 2nm chip production",
    text: "Japan's state-backed chipmaker faces technical hurdles that could push back its target of mass-producing 2-nanometer chips by March 2028, raising questions about the country's chip ambitions." },
  { date: "2026-11-10", source: "DigiTimes Asia", topic: "Semiconductors", url: "https://www.digitimes.com/news/a20261110VL201/mitsui-chemicals-jsr-acquisition-materials-business-growth.html",
    title: "Mitsui Chemicals to buy JSR in a deal worth about US$11.6 billion",
    text: "Including assumed debt, the ¥1.84 trillion acquisition of the photoresist maker would give Mitsui Chemicals a much larger stake in semiconductor materials." },
  { date: "2026-11-10", source: "DigiTimes Asia", topic: "Semiconductors", url: "https://www.digitimes.com/news/a20261109PD245/rapidus-taiwan-ibm-plant-production.html",
    title: "Rapidus plans three more Hokkaido plants, modeled on Taiwan's chip clusters",
    text: "Rapidus says it will use Taiwan as its model for building a semiconductor industry cluster around its Hokkaido base, with IBM Japan also setting up there." },
  { date: "2026-11-09", source: "DigiTimes Asia", topic: "Robotics", url: "https://www.digitimes.com/news/a20261109PD201/toyota-data-manufacturing-growth-worldwide.html",
    title: "Toyota launches Toyota Robotics, built on its factory data",
    text: "Toyota Motor has set up a dedicated robotics division, joining global rivals in robotics development and drawing on data from its own manufacturing sites." },
  { date: "2026-11-05", source: "Osaka Prefecture", topic: "Osaka", url: "https://www.mynewsdesk.com/osaka-prefecture/latest_news",
    title: "Osaka heads to Singapore FinTech Festival 2026 in search of global partners",
    text: "Osaka Prefecture and Osaka City will exhibit in Singapore from November 18 to 20, together with two Osaka companies chosen through an open call." },
];
const fmtDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

const newsPage = frame({
  prefix: "", current: "news", titleKey: "newsTitle", descKey: "newsLead", bodyClass: "page news-page",
  main: `${banner("", [{ key: "navNews" }], "newsTitle", "newsLead", ART.news)}

    <section class="page-section news-updates" aria-labelledby="updates-title">
      <div class="page-inner narrow">
        <h2 id="updates-title" class="section-title" data-i18n="newsUpdatesTitle">${tx("newsUpdatesTitle")}</h2>
        <div class="news-copy">
          ${t("p", "newsP1")}
          ${t("p", "newsP2")}
          ${t("p", "newsP3")}
        </div>
      </div>
    </section>

    <section class="page-section tinted news-stories" aria-labelledby="stories-title">
      <div class="page-inner">
        <h2 id="stories-title" class="section-title" data-i18n="newsHeadTitle">${tx("newsHeadTitle")}</h2>
        ${t("p", "newsHeadText", 'class="news-head-text"')}
        <ol class="news-list">
${NEWS.map((n, i) => `          <li class="news-item${i === 0 ? " is-lead" : ""}">
            <p class="news-meta"><span class="news-topic">${esc(n.topic)}</span> <time datetime="${n.date}">${fmtDate(n.date)}</time></p>
            <h3><a href="${n.url}" target="_blank" rel="noopener">${esc(n.title)}<span class="sr-only"> <span data-i18n="techNewTab">${tx("techNewTab")}</span></span></a></h3>
            <p class="news-text">${esc(n.text)}</p>
            <p class="news-source">${esc(n.source)} · <a href="${n.url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true"><span data-i18n="newsReadMore">${tx("newsReadMore")}</span> ↗</a></p>
          </li>`).join("\n")}
        </ol>
        ${t("p", "newsSourceNote", 'class="news-note"')}
      </div>
    </section>

${cta("contact.html")}`,
});
writeFileSync("news.html", newsPage);

/* ---------- Blog: ten placeholder posts (English only for now), newest first ---------- */
const BLOG = [
  { date: "2026-11-13", cat: "Web design", min: 4, title: "Five things every small business site needs in 2027",
    intro: "A fast homepage, a clear way to get in touch and pages that read well on a phone still matter more than any trend. Here is the short list we start every project with.",
    body: ["Placeholder text: start with speed. A page that loads in under two seconds keeps visitors around long enough to read what you offer.", "Next comes a single, obvious call to action, honest photos of your real work, plain-language service pages and a contact form that never asks for more than it needs."] },
  { date: "2026-11-06", cat: "Engineering", min: 6, title: "How we keep a ten-language website in sync",
    intro: "Every word on our own site lives in one file, in ten languages. This is how we stop a menu item in Polish from drifting out of step with the English one.",
    body: ["Placeholder text: one source of truth for wording, a build step that writes every page from it, and a check that fails when any language is missing a key.", "The result is that adding a page takes minutes, not days, and nobody has to hunt through HTML to fix a typo."] },
  { date: "2026-10-30", cat: "AI", min: 5, title: "Putting an AI assistant on your website without the risk",
    intro: "A chat assistant can answer the same ten questions your team hears every day. Done carelessly, it can also make things up. Here is where we draw the lines.",
    body: ["Placeholder text: keep the assistant's answers grounded in your own pages, give it a polite way to say it doesn't know, and always offer a route to a real person.", "Keep API keys on a server, never in the browser, and review conversations regularly to see what visitors actually ask."] },
  { date: "2026-10-23", cat: "Hosting", min: 3, title: "Static sites are back, and they are fast",
    intro: "Not every website needs a database. For brochure sites and portfolios, plain files on a global network are cheaper, safer and quicker.",
    body: ["Placeholder text: with no server code to attack, a static site removes a whole category of security worries.", "Pair it with a simple editor and you still get easy updates, without the plugin treadmill."] },
  { date: "2026-10-16", cat: "Branding", min: 4, title: "What a logo can't do on its own",
    intro: "A logo is a signature, not a brand. The colors, words and habits around it are what people actually remember.",
    body: ["Placeholder text: decide how you sound before you decide how you look. A short list of words you would and wouldn't use goes a long way.", "Then pick two colors and one typeface, and use them everywhere for a year before you change anything."] },
  { date: "2026-10-09", cat: "Software", min: 7, title: "Choosing between an app and a website",
    intro: "Clients often ask for an app when a well-built website would serve them better. Here are the questions we ask before writing a line of code.",
    body: ["Placeholder text: does it need the camera, offline use or push notifications? Will people open it every week? If not, a mobile-friendly website is usually the answer.", "A progressive web app can sit in between, installable from the browser at a fraction of the cost."] },
  { date: "2026-10-02", cat: "Osaka", min: 3, title: "Why we build in Osaka",
    intro: "Tokyo gets the headlines, but Osaka's mix of manufacturers, shops and startups makes it a great place to build practical software.",
    body: ["Placeholder text: our clients make things, sell things and fix things. Working close to them keeps our ideas grounded.", "And the food is better. We will not be taking questions on that."] },
  { date: "2026-09-25", cat: "Content", min: 5, title: "A content calendar you will actually keep",
    intro: "Most business blogs die after three posts. A small, realistic plan beats an ambitious one you abandon.",
    body: ["Placeholder text: one post a month, written from questions customers already ask, is enough to show you are active and knowledgeable.", "Batch-write in quiet weeks, schedule ahead, and reuse each post as a newsletter and a few social updates."] },
  { date: "2026-09-18", cat: "Accessibility", min: 6, title: "Accessibility is just good design",
    intro: "Clear contrast, real buttons and text that resizes properly help everyone, not only people who use screen readers.",
    body: ["Placeholder text: test with your keyboard alone. If you can't reach and use every part of the page, neither can many of your visitors.", "Add alt text that says what an image shows, and never rely on color alone to carry meaning."] },
  { date: "2026-09-11", cat: "Studio", min: 2, title: "Hello from Tenshi Systems Engineering",
    intro: "Welcome to our blog. We will use it to share how we work, what we are learning and the projects we are proud of.",
    body: ["Placeholder text: expect practical notes rather than buzzwords, written by the people doing the work.", "If there is a topic you would like us to cover, the contact page is the quickest way to tell us."] },
];

const blogPage = frame({
  prefix: "", current: "blog", titleKey: "blogTitle", descKey: "blogLead", bodyClass: "page blog-page",
  main: `${banner("", [{ key: "navBlog" }], "blogTitle", "blogLead", ART.blog)}

    <section class="page-section blog-section" aria-labelledby="posts-title">
      <div class="page-inner">
        <h2 id="posts-title" class="section-title" data-i18n="blogPostsTitle">${tx("blogPostsTitle")}</h2>
        ${t("p", "blogFiller", 'class="blog-note"')}
        <div class="blog-grid">
${BLOG.map((b, i) => `          <article class="blog-card${i === 0 ? " is-feature" : ""}" id="post-${BLOG.length - i}" aria-labelledby="post-${BLOG.length - i}-title">
            <p class="blog-meta"><span class="blog-cat">${esc(b.cat)}</span> <time datetime="${b.date}">${fmtDate(b.date)}</time> · ${b.min} <span data-i18n="blogMin">${tx("blogMin")}</span></p>
            <h3 id="post-${BLOG.length - i}-title">${esc(b.title)}</h3>
            <p class="blog-intro">${esc(b.intro)}</p>
            <details class="blog-more">
              <summary><span class="blog-open" data-i18n="blogReadMore">${tx("blogReadMore")}</span><span class="blog-close" data-i18n="blogShowLess">${tx("blogShowLess")}</span></summary>
${b.body.map((p) => `              <p>${esc(p)}</p>`).join("\n")}
            </details>
          </article>`).join("\n")}
        </div>
      </div>
    </section>

${cta("contact.html")}`,
});
writeFileSync("blog.html", blogPage);

mkdirSync("projects", { recursive: true });
for (const p of PROJECTS) writeFileSync(`projects/${p.slug}.html`, projectPage(p));
console.log(`index.html updated; about.html, team.html, services.html, technology.html, projects.html, contact.html, ${SERVICES.length} service pages and ${PROJECTS.length} project pages written; news.html and blog.html written`);
