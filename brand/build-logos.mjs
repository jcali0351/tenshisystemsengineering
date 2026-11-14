// Builds the horizontal Tenshi logos from tenshi-mark.svg (run from this folder: node build-logos.mjs).
// tenshi-logo-dark.svg  : white lettering, for dark backgrounds
// tenshi-logo-light.svg : dark lettering, for light backgrounds
import { readFileSync, writeFileSync } from "node:fs";
const mark = readFileSync("tenshi-mark.svg", "utf8");
const inner = mark.slice(mark.indexOf(">", mark.indexOf("<svg")) + 1, mark.lastIndexOf("</svg>")).replace(/<title[^>]*>.*?<\/title>/, "");
const W = 820, X = 276, LEN = 500;
const logo = (ink, sub, ja) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 240" width="${W}" height="240" role="img" aria-labelledby="t">
  <title id="t">Tenshi Systems Engineering</title>
  <g>${inner}</g>
  <g font-family="Lato, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif">
    <text x="${X}" y="124" font-size="110" font-weight="900" fill="${ink}" textLength="${LEN}" lengthAdjust="spacing">TENSHI</text>
    <text x="${X + 2}" y="166" font-size="27" font-weight="700" fill="${sub}" textLength="${LEN - 2}" lengthAdjust="spacing">SYSTEMS ENGINEERING</text>
  </g>
  <g>
    <path d="M${X} 186H${X + LEN - 14}" stroke="#ff3b55" stroke-width="3" stroke-linecap="round"/>
    <path class="pulse" d="M${X} 186H${X + LEN - 14}" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" style="stroke-dasharray:18 520;animation:wire 3s linear infinite"/>
    <circle cx="${X + LEN - 6}" cy="186" r="6" fill="#fff" stroke="#ff3b55" stroke-width="3"/>
    <rect x="${X}" y="182" width="8" height="8" rx="1.5" fill="#ff3b55"/>
  </g>
  <text x="${X + 2}" y="222" font-family="'Noto Sans JP','Yu Gothic','Hiragino Sans','Meiryo',sans-serif" font-size="22" font-weight="700" fill="${ja}" textLength="${LEN - 2}" lengthAdjust="spacing">天使システムズエンジニアリング</text>
  <style>@keyframes wire { from { stroke-dashoffset: 538; } to { stroke-dashoffset: 0; } } @media (prefers-reduced-motion: reduce) { .pulse { display: none; } }</style>
</svg>
`;
writeFileSync("tenshi-logo-dark.svg", logo("#ffffff", "#ff5c74", "#f3c9d0"));
writeFileSync("tenshi-logo-light.svg", logo("#16191e", "#c8102e", "#5d6470"));
console.log("tenshi-logo-dark.svg and tenshi-logo-light.svg written");
