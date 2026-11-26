// SEO for every page (used by tools/build-pages.mjs): keyword titles and descriptions in English, the canonical
// address, social preview tags and schema.org structured data. app.js leaves these English titles alone
// (body data-seo) and still translates titles for visitors who pick another language.
// The wording is edited in the Tenshi Editor's SEO tab, which saves data/seo.json; this file reads it at build time.
// The values below are the defaults (used when data/seo.json has nothing for a page or a field is left empty).
// Keep titles under about 65 characters and descriptions under about 160.
import { readFileSync, existsSync } from "node:fs";

export const SITE = "https://tenshisystems.com/";
export const BRAND = "Tenshi Systems Engineering";

// Keyed by the page's titleKey in build-pages.mjs. The homepage uses "home".
const SEO_DEFAULTS = {
  home: {
    title: "Small Business AI Services, Web Design & Hosting in Wisconsin | Tenshi",
    desc: "Tenshi Systems Engineering helps Wisconsin small businesses grow with AI services, custom web design, secure web hosting and software. Based in Madison, WI.",
  },
  aboutTitle: {
    title: "About Tenshi | Madison, WI Web Design, Hosting & AI Company",
    desc: "Tenshi Systems Engineering is a Madison, Wisconsin web design, web hosting and AI services company building dependable websites and software for small businesses.",
  },
  teamTitle: {
    title: "Our Team | Web Designers, Developers & AI Engineers | Tenshi",
    desc: "Meet the web designers, developers and AI engineers behind Tenshi Systems Engineering, a Madison, Wisconsin studio for small business technology.",
  },
  kbTitle: {
    title: "Knowledge Base | Web, SEO, SaaS & AI Glossary | Tenshi",
    desc: "A plain-English glossary of 434 terms in web development, web design, SEO, SaaS and AI, written for small and mid-size business owners.",
  },
  legalTitle: {
    title: "Legal & Privacy | Tenshi Systems",
    desc: "Terms of Service and Privacy Policy for Tenshi Systems. We collect only the data needed to run the tool, and we never sell, rent, or trade your information.",
  },
  navServices: {
    title: "Small Business Web Design, Hosting & AI Services | Tenshi",
    desc: "Web design, web development, web hosting, AI services, branding, CMS, custom software and IT consulting for small businesses in Wisconsin and across the US.",
  },
  techTitle: {
    title: "Our Technology Stack | Web, Cloud & AI Tools | Tenshi",
    desc: "The web, cloud hosting and AI technologies Tenshi Systems Engineering uses to design, build and run fast, secure websites and software for small businesses.",
  },
  contactPageTitle: {
    title: "Contact Tenshi | Web Design, Hosting & AI Quote in Wisconsin",
    desc: "Ask for a free consultation on web design, web hosting or AI services for your small business. Tenshi works with clients in Madison, Wisconsin and nationwide.",
  },
  portfolioTitle: {
    title: "Small Business Website Design Portfolio | Tenshi",
    desc: "Website design examples for restaurants, shops, clinics and other small businesses, each ready to launch with your own content, hosting and support.",
  },
  launchTitle: {
    title: "Launch Your Small Business Website & Hosting | Tenshi",
    desc: "Tell us about your business and launch a professional website with web hosting, a domain and SSL set up for you by Tenshi Systems Engineering.",
  },
  newsTitle: {
    title: "Tech, AI & Gaming News | Tenshi Systems Engineering",
    desc: "The week's stories in web design, gaming, AI, technology, cybersecurity and business, each linked to the publisher that reported it.",
  },
  blogTitle: {
    title: "Small Business Web Design, Hosting & AI Blog | Tenshi",
    desc: "Plain-English guides for small business owners on web design, web hosting, SEO, website security, accessibility and using AI in your business.",
  },
  portalTitle: {
    title: "Client Portal | Tenshi Systems Engineering",
    desc: "Sign in to manage your Tenshi website, hosting and projects.",
  },
  wiTitle: {
    title: "Wisconsin Small Business Web Design, Hosting & AI Services | Tenshi",
    desc: "Web design, managed web hosting and AI services for Wisconsin small businesses in Madison, Milwaukee, Green Bay and statewide. Veteran-owned. Free consultation.",
  },
  svc_ai_title: {
    title: "AI Services for Small Business in Wisconsin | Chatbots & Automation",
    desc: "Practical AI services for Wisconsin small businesses: AI chatbots, customer service assistants, workflow automation and AI integration that save time.",
    service: "AI services",
  },
  svc_hosting_title: {
    title: "Small Business Web Hosting | Managed & Secure | Tenshi",
    desc: "Managed web hosting for small businesses: fast servers, SSL, domains, tested backups and uptime monitoring, looked after by real people in Madison, Wisconsin.",
    service: "Web hosting",
  },
  svc_webdesign_title: {
    title: "Small Business Web Design in Wisconsin | Responsive Websites",
    desc: "Custom, mobile-friendly web design for Wisconsin small businesses: clean, fast websites built around your brand, your customers and search engines.",
    service: "Web design",
  },
  svc_webdev_title: {
    title: "Web Development Services | Fast, Secure Websites & Apps | Tenshi",
    desc: "Web development for small businesses: fast, secure websites, online booking and ordering, and web applications built on modern, maintainable code.",
    service: "Web development",
  },
  svc_software_title: {
    title: "Custom Software Development for Small Business | Tenshi",
    desc: "Custom software development for small businesses: business tools, integrations and apps built for reliability and long-term support, from prototype to launch.",
    service: "Custom software development",
  },
  svc_consulting_title: {
    title: "IT & Technology Consulting for Small Business | Tenshi",
    desc: "Technology consulting for small businesses: plain-language advice on AI adoption, cloud, websites, modernization and choosing the right tools.",
    service: "Technology consulting",
  },
  svc_media_title: {
    title: "Graphic, Video & Digital Media Design | Tenshi",
    desc: "Graphic design, video and digital media for small businesses: visuals for your website, social media and marketing that communicate clearly.",
    service: "Digital media design",
  },
  svc_cms_title: {
    title: "Content Management System (CMS) Setup for Small Business | Tenshi",
    desc: "Easy content management for small business websites: update pages, news and photos yourself, with training, multilingual support and secure hosting.",
    service: "Content management systems",
  },
  svc_branding_title: {
    title: "Small Business Branding & Logo Design | Tenshi",
    desc: "Branding for small businesses: logo design, colors, typography and brand guidelines that give your company a clear, consistent identity online and off.",
    service: "Branding and logo design",
  },
};

// data/seo.json (Editor > SEO): { defaults: { ogImage, ... }, pages: { key: { title, desc, ogImage, canonical, noindex } } }
const DATA = (() => {
  try { return existsSync("data/seo.json") ? JSON.parse(readFileSync("data/seo.json", "utf8")) : {}; }
  catch (e) { console.warn("data/seo.json could not be read, using the defaults in tools/seo.mjs:", e.message); return {}; }
})();
const filled = (v) => typeof v === "string" && v.trim() !== "";
export const SEO_SITE_DEFAULTS = {
  // Site-wide social preview picture (1200 x 630). img/og/default-1200x630.jpg is a PLACEHOLDER until Img Bot supplies
  // the final art: replace that file (same name and size) or point defaults.ogImage in data/seo.json at the new one.
  ogImage: "img/og/default-1200x630.jpg", ogImageWidth: 1200, ogImageHeight: 630, ogImageAlt: BRAND,
  ...(DATA.defaults || {}),
};
export const SEO = {};
for (const key of new Set([...Object.keys(SEO_DEFAULTS), ...Object.keys(DATA.pages || {})])) {
  const base = SEO_DEFAULTS[key] || {}, over = (DATA.pages || {})[key] || {};
  SEO[key] = { ...base };
  for (const f of ["title", "desc", "ogImage", "canonical"]) if (filled(over[f])) SEO[key][f] = over[f].trim();
  SEO[key].noindex = over.noindex != null ? !!over.noindex : key === "portalTitle";
}
// A path from the site root or a full address -> a full https address.
const abs = (u) => (/^https?:\/\//.test(u) ? u : SITE + String(u).replace(/^\/+/, ""));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const OG_IMAGE = abs(SEO_SITE_DEFAULTS.ogImage);

const ORG = {
  "@type": "ProfessionalService",
  "@id": SITE + "#business",
  name: BRAND,
  alternateName: "Tenshi Systems",
  url: SITE,
  logo: SITE + "brand/favicon-512.png",
  image: OG_IMAGE,
  description: SEO.home.desc,
  address: { "@type": "PostalAddress", addressLocality: "Madison", addressRegion: "WI", addressCountry: "US" },
  areaServed: [{ "@type": "State", name: "Wisconsin" }, { "@type": "Country", name: "United States" }],
  knowsAbout: ["AI services", "AI chatbots", "Business automation", "Web design", "Web development", "Web hosting",
    "Small business websites", "Search engine optimization", "Custom software", "Branding", "Content management systems"],
  hasOfferCatalog: {
    "@type": "OfferCatalog", name: "Services",
    itemListElement: Object.values(SEO).filter((p) => p.service).map((p) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: p.service } })),
  },
};

// The <head> tags for one page. `url` is the page's path from the site root ("" for the homepage).
export function seoHead({ key, url, title, desc, extraSchema }) {
  const p = SEO[key] || {};
  const t = p.title || title, d = p.desc || desc;
  const href = p.canonical ? abs(p.canonical) : SITE + url;
  const ogImage = p.ogImage ? abs(p.ogImage) : OG_IMAGE;
  const ogSize = p.ogImage ? "" : `  <meta property="og:image:width" content="${SEO_SITE_DEFAULTS.ogImageWidth}">
  <meta property="og:image:height" content="${SEO_SITE_DEFAULTS.ogImageHeight}">
`;
  const graph = [ORG, { "@type": "WebPage", "@id": href, url: href, name: t, description: d, isPartOf: { "@id": SITE + "#website" }, about: { "@id": SITE + "#business" } }];
  if (key === "home") graph.push({ "@type": "WebSite", "@id": SITE + "#website", url: SITE, name: BRAND, publisher: { "@id": SITE + "#business" } });
  if (p.service) graph.push({ "@type": "Service", name: p.service, serviceType: p.service, description: d, url: href,
    provider: { "@id": SITE + "#business" }, areaServed: ORG.areaServed });
  if (extraSchema) graph.push(extraSchema);
  return {
    title: t, desc: d,
    tags: `  <link rel="canonical" href="${esc(href)}">
  <meta property="og:url" content="${esc(href)}">
  <meta property="og:site_name" content="${BRAND}">
  <meta property="og:image" content="${esc(ogImage)}">
${ogSize}  <meta property="og:image:alt" content="${esc(SEO_SITE_DEFAULTS.ogImageAlt || BRAND)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(t)}">
  <meta name="twitter:description" content="${esc(d)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <meta name="robots" content="${p.noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}">
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
`,
  };
}
