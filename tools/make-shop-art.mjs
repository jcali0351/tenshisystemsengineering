// tools/make-shop-art.mjs: draws the Shop demo's sample product pictures (img/shop/*.webp) from site art and code.
// No stock or brand photos: each picture is a small HTML/SVG scene (fonts/, sandbox/logo-white.png,
// sandbox/art/undercity.webp, img/photos/hero-synthwave.webp) rendered by headless Chrome to an 800x800 WebP.
// Run from the repository folder (needs google-chrome): node tools/make-shop-art.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(".");
const u = (p) => "file://" + ROOT + "/" + p;
const S = 800;
const base = `
@font-face { font-family: Oswald; src: url(${u("fonts/oswald/oswald-700-normal.woff2")}) format("woff2"); font-weight: 700; }
@font-face { font-family: Oswald; src: url(${u("fonts/oswald/oswald-400-normal.woff2")}) format("woff2"); font-weight: 500; }
@font-face { font-family: Lato; src: url(${u("fonts/lato/lato-700-normal.woff2")}) format("woff2"); font-weight: 700; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${S}px; height: ${S}px; overflow: hidden; }
body { position: relative; font-family: Oswald, sans-serif; color: #fff;
  background: radial-gradient(ellipse 70% 55% at 50% 45%, rgba(176,77,255,.38), transparent 70%),
    linear-gradient(rgba(176,77,255,.07) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, rgba(176,77,255,.07) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(180deg, #170636, #0c041e 70%); }
.floor { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; background: linear-gradient(180deg, transparent, rgba(255,43,214,.10)); }
.c { position: absolute; inset: 0; display: grid; place-items: center; }
.neon { text-shadow: 0 0 18px #ff2bd6, 0 0 2px #fff; }
`;
const scenes = {
  "neon-angel-tee": `
<div class="floor"></div>
<div class="c">
  <svg width="640" height="640" viewBox="0 0 640 640" style="filter: drop-shadow(0 30px 40px rgba(0,0,0,.6)) drop-shadow(0 0 40px rgba(176,77,255,.35))">
    <defs>
      <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2140"/><stop offset=".55" stop-color="#15101f"/><stop offset="1" stop-color="#0a0810"/></linearGradient>
      <linearGradient id="hl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <path d="M232 70 C258 98 382 98 408 70 L520 112 L600 230 L520 280 L486 238 L486 590 Q320 612 154 590 L154 238 L120 280 L40 230 L120 112 Z" fill="url(#cloth)" stroke="rgba(255,43,214,.55)" stroke-width="2"/>
    <path d="M232 70 C258 98 382 98 408 70 C392 118 248 118 232 70 Z" fill="#06040b" stroke="rgba(255,43,214,.4)" stroke-width="2"/>
    <rect x="154" y="120" width="332" height="470" fill="url(#hl)"/>
  </svg>
</div>
<div class="c" style="top:-40px"><img src="${u("sandbox/logo-white.png")}" style="width:150px;height:150px;filter:drop-shadow(0 0 10px #ff2bd6) drop-shadow(0 0 26px #ff2bd6)"></div>
<div class="c" style="top:180px"><div class="neon" style="font-size:40px;letter-spacing:.32em;color:#ffd6f4;padding-left:.32em">TENSHI</div></div>`,

  "undercity-art-print": `
<div style="position:absolute;inset:0;background:radial-gradient(ellipse 60% 45% at 50% 18%, rgba(255,255,255,.14), transparent 70%)"></div>
<div class="floor"></div>
<div class="c">
  <div style="width:660px;padding:22px;background:linear-gradient(145deg,#2b2b33,#0d0d12);border-radius:6px;box-shadow:0 40px 70px rgba(0,0,0,.7),0 0 60px rgba(176,77,255,.35),inset 0 0 0 2px rgba(255,255,255,.08)">
    <div style="padding:26px;background:#f4f0ea">
      <img src="${u("sandbox/art/undercity.webp")}" style="display:block;width:100%;aspect-ratio:2/1;object-fit:cover">
    </div>
  </div>
</div>`,

  "synthwave-desk-mat": `
<div class="floor" style="height:60%"></div>
<div class="c" style="perspective:900px">
  <div style="width:700px;height:300px;transform:rotateX(52deg) rotateZ(-8deg) translateY(40px);border-radius:26px;overflow:hidden;
    background:url(${u("img/photos/hero-synthwave.webp")}) center/cover;box-shadow:0 0 0 4px #1a0b2e,0 0 0 6px rgba(255,43,214,.85),0 0 60px rgba(255,43,214,.55),0 60px 80px rgba(0,0,0,.7)"></div>
</div>
<div class="c" style="top:-470px"><div class="neon" style="font-size:44px;letter-spacing:.24em;padding-left:.24em">900 × 400 MM</div></div>`,

  "angel-pin-set": `
<div class="floor"></div>
<div class="c">
  <div style="display:flex;gap:22px;align-items:center;transform:scale(.88)">
    <div style="width:190px;height:190px;border-radius:42px;background:linear-gradient(145deg,#ff3b55,#c50f2c 55%,#7a0718);border:9px solid #e8c36a;box-shadow:inset 0 0 0 3px #a8812c,0 20px 40px rgba(0,0,0,.6),0 0 40px rgba(255,59,85,.45);display:grid;place-items:center;transform:rotate(-8deg)">
      <img src="${u("sandbox/logo-white.png")}" style="width:118px;height:118px">
    </div>
    <div style="width:180px;height:180px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#d58bff,#7b2cd6 60%,#3b0d7a);border:9px solid #e8c36a;box-shadow:inset 0 0 0 3px #a8812c,0 20px 40px rgba(0,0,0,.6),0 0 40px rgba(176,77,255,.5);display:grid;place-items:center;transform:translateY(-40px)">
      <svg width="96" height="96" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="#fff"/></svg>
    </div>
    <div style="width:190px;height:150px;border-radius:24px;background:linear-gradient(145deg,#ffb15a,#ff8c1a 55%,#c45a00);border:9px solid #e8c36a;box-shadow:inset 0 0 0 3px #a8812c,0 20px 40px rgba(0,0,0,.6),0 0 40px rgba(255,140,26,.45);display:grid;place-items:center;transform:rotate(9deg)">
      <span style="font:700 64px/1 Oswald;letter-spacing:.06em;color:#2a0c00">GG</span>
    </div>
  </div>
</div>
<div class="c" style="top:470px"><div class="neon" style="font-size:30px;letter-spacing:.3em;color:#ffd6f4;padding-left:.3em">ENAMEL PIN SET · 3</div></div>`,

  "launch-pack": `
<div class="floor"></div>
<div class="c">
  <div style="width:600px;height:520px;border-radius:28px;background:linear-gradient(160deg,rgba(46,11,87,.92),rgba(20,5,43,.92));border:2px solid rgba(255,43,214,.6);box-shadow:0 0 60px rgba(176,77,255,.45),0 40px 70px rgba(0,0,0,.6);padding:34px;position:relative">
    <div style="height:280px;border-radius:14px;background:#0c041e;border:1px solid rgba(255,255,255,.18);overflow:hidden">
      <div style="height:34px;background:rgba(255,255,255,.07);display:flex;gap:9px;align-items:center;padding:0 14px"><i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i><i style="margin-left:12px;height:14px;flex:1;border-radius:7px;background:rgba(255,255,255,.1)"></i></div>
      <div style="height:120px;margin:14px;border-radius:10px;background:url(${u("img/photos/hero-synthwave.webp")}) center/cover"></div>
      <div style="display:flex;gap:12px;margin:0 14px"><b style="flex:1;height:80px;border-radius:8px;background:rgba(255,43,214,.25)"></b><b style="flex:1;height:80px;border-radius:8px;background:rgba(77,163,255,.25)"></b><b style="flex:1;height:80px;border-radius:8px;background:rgba(255,140,26,.25)"></b></div>
    </div>
    <div class="neon" style="margin-top:34px;font-size:64px;letter-spacing:.1em;line-height:1">LAUNCH PACK</div>
    <div style="margin-top:14px;font:500 26px/1 Oswald;letter-spacing:.3em;color:#ff8c1a">5 PAGES · LIVE IN 2 WEEKS</div>
    <svg style="position:absolute;right:-40px;top:-60px;filter:drop-shadow(0 0 16px #ff2bd6)" width="170" height="170" viewBox="0 0 64 64"><path d="M40 6c9 2 16 9 18 18-3 9-11 17-20 22l-8-8-8-8C27 21 31 13 40 6z" fill="#fff"/><circle cx="42" cy="22" r="6" fill="#3b0d7a"/><path d="M22 30l-10 2-6 10 12-2M34 42l-2 10-10 6 2-12" fill="#ff2bd6"/><path d="M18 46c-4 0-8 6-8 8 2 0 8-4 8-8z" fill="#ff8c1a"/></svg>
  </div>
</div>`,

  "care-plan": `
<div class="floor"></div>
<div class="c">
  <div style="width:600px;height:520px;border-radius:28px;background:linear-gradient(160deg,rgba(46,11,87,.92),rgba(20,5,43,.92));border:2px solid rgba(77,163,255,.6);box-shadow:0 0 60px rgba(77,163,255,.4),0 40px 70px rgba(0,0,0,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
    <svg width="210" height="230" viewBox="0 0 64 70" style="filter:drop-shadow(0 0 18px #4da3ff)"><path d="M32 3l25 9v19c0 17-11 29-25 35C18 60 7 48 7 31V12z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><path d="M14 37h10l4-10 6 18 5-12 3 4h8" fill="none" stroke="#ff2bd6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div class="neon" style="font-size:64px;letter-spacing:.1em;line-height:1">CARE PLAN</div>
    <div style="font:500 24px/1 Oswald;letter-spacing:.28em;color:#7cc1ff">HOSTING · UPDATES · BACKUPS</div>
  </div>
</div>`,
};

const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/shopart${port}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { await sleep(300); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch {} }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: S, height: S, deviceScaleFactor: 1, mobile: false });
mkdirSync("img/shop", { recursive: true });
const tmp = "/tmp/shop-art.html";
for (const [name, body] of Object.entries(scenes)) {
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>${base}</style><body>${body}</body>`);
  await send("Page.navigate", { url: "file://" + tmp + "?" + Date.now() });
  await sleep(1500);
  const r = await send("Page.captureScreenshot", { format: "webp", quality: 82, clip: { x: 0, y: 0, width: S, height: S, scale: 1 } });
  writeFileSync(`img/shop/${name}.webp`, Buffer.from(r.data, "base64"));
  console.log("img/shop/" + name + ".webp");
}
rmSync(tmp, { force: true });
ws.close(); chrome.kill(); process.exit(0);
