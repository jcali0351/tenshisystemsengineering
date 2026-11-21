// Neon covers for posts and news stories without a photo: img/covers/<topic>.svg (800 x 450).
// Black-to-violet backdrop, a faint game grid and a glowing cyan-to-pink line icon, matching the neon theme.
// Run: node tools/make-covers.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const ICONS = {
  // browser window with a layout
  web: `<rect x="250" y="120" width="300" height="210" rx="18"/><path d="M250 165h300"/><circle cx="278" cy="143" r="6"/><circle cx="300" cy="143" r="6"/><circle cx="322" cy="143" r="6"/><rect x="278" y="190" width="110" height="110" rx="10"/><path d="M412 196h112M412 226h112M412 256h80M412 290h112"/>`,
  // </>
  code: `<path d="M330 160l-70 65 70 65"/><path d="M470 160l70 65-70 65"/><path d="M425 130l-50 190"/>`,
  // game controller
  gaming: `<path d="M300 170h200c45 0 70 40 78 90 7 45-12 80-40 80-25 0-38-22-55-45H317c-17 23-30 45-55 45-28 0-47-35-40-80 8-50 33-90 78-90z"/><path d="M300 225v50M275 250h50"/><circle cx="480" cy="235" r="9"/><circle cx="515" cy="265" r="9"/><path d="M380 200h40"/>`,
  // AI chip with circuit legs
  ai: `<rect x="320" y="145" width="160" height="160" rx="20"/><rect x="355" y="180" width="90" height="90" rx="10"/><path d="M360 145v-35M400 145v-35M440 145v-35M360 305v35M400 305v35M440 305v35M320 185h-35M320 225h-35M320 265h-35M480 185h35M480 225h35M480 265h35"/><path d="M380 245l20-40 20 40M386 233h28"/>`,
  // laptop
  tech: `<rect x="285" y="130" width="230" height="150" rx="12"/><path d="M240 310h320l-25 30H265z"/><path d="M330 235l35-35 30 25 45-50"/>`,
  // shield with check
  security: `<path d="M400 110l120 45v70c0 75-55 120-120 140-65-20-120-65-120-140v-70z"/><path d="M350 235l35 35 70-75"/>`,
  // rising bar chart
  business: `<path d="M260 330h290"/><rect x="285" y="260" width="45" height="70" rx="6"/><rect x="355" y="220" width="45" height="110" rx="6"/><rect x="425" y="180" width="45" height="150" rx="6"/><path d="M280 220l90-60 60 30 95-75"/><path d="M490 115h35v35"/>`,
  // gem with sparkles
  brand: `<path d="M330 150h140l55 60-125 140-125-140z"/><path d="M275 210h250M330 150l35 60 35-60 35 60 35-60M365 210l35 140 35-140"/><path d="M560 120v36M542 138h36M240 280v26M227 293h26"/>`,
  // magnifier over bars
  seo: `<circle cx="375" cy="210" r="85"/><path d="M437 272l85 85"/><path d="M335 245v-30M370 245v-55M405 245v-75"/>`,
  // accessibility figure
  access: `<circle cx="400" cy="225" r="120"/><circle cx="400" cy="160" r="16"/><path d="M330 195l70 15 70-15M400 210v55M400 265l-35 55M400 265l35 55"/>`,
  // server stack
  hosting: `<rect x="300" y="120" width="200" height="60" rx="10"/><rect x="300" y="195" width="200" height="60" rx="10"/><rect x="300" y="270" width="200" height="60" rx="10"/><circle cx="330" cy="150" r="6"/><circle cx="330" cy="225" r="6"/><circle cx="330" cy="300" r="6"/><path d="M380 150h90M380 225h90M380 300h90"/>`,
  // open book and pen
  blog: `<path d="M260 150c45-15 95-15 140 15v175c-45-30-95-30-140-15z"/><path d="M540 150c-45-15-95-15-140 15v175c45-30 95-30 140-15z"/><path d="M290 195c30-6 60-4 85 6M290 235c30-6 60-4 85 6M425 201c25-10 55-12 85-6M425 241c25-10 55-12 85-6"/>`,
  // heart with pulse
  health: `<path d="M400 340c-90-60-140-105-140-160 0-40 30-65 65-65 30 0 55 20 75 45 20-25 45-45 75-45 35 0 65 25 65 65 0 55-50 100-140 160z"/><path d="M290 225h55l20-35 30 70 25-45h90"/>`,
  // trophy
  sports: `<path d="M340 120h120v70c0 40-27 65-60 65s-60-25-60-65z"/><path d="M340 140h-40c0 40 20 60 45 60M460 140h40c0 40-20 60-45 60M400 255v45M355 330h90M370 300h60v30h-60z"/>`,
  // cloud and sun
  weather: `<circle cx="450" cy="170" r="45"/><path d="M450 100v-20M510 120l15-15M525 170h20M390 120l-15-15"/><path d="M300 330h170c35 0 60-25 60-55s-25-55-60-55c-8-35-40-60-78-60-45 0-80 35-80 80-30 5-50 25-50 50 0 25 18 40 38 40z"/>`,
};
ICONS.stocks = ICONS.business;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
<defs>
<radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#2a0850"/><stop offset=".6" stop-color="#12041f"/><stop offset="1" stop-color="#05000a"/></radialGradient>
<linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="240" y1="110" x2="560" y2="350"><stop offset="0" stop-color="#00f0ff"/><stop offset=".55" stop-color="#b04dff"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#b04dff" stroke-opacity=".09" stroke-width="1"/></pattern>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="800" height="450" fill="url(#bg)"/><rect width="800" height="450" fill="url(#grid)"/>
<ellipse cx="400" cy="230" rx="230" ry="170" fill="#ff2bd6" fill-opacity=".06"/>
<g fill="none" stroke="url(#ink)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">${body}</g>
<g fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>
</svg>
`;

mkdirSync("img/covers", { recursive: true });
for (const [name, body] of Object.entries(ICONS)) writeFileSync(`img/covers/${name}.svg`, svg(body));
console.log("covers written:", Object.keys(ICONS).join(", "));
