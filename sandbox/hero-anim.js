// hero-anim.js: brings the homepage's synthwave hero photo (img/photos/hero-synthwave.webp) to life with one canvas
// laid over the photo, under the hero text (pointer-events: none):
//   1. the painted neon road lines glow and pulse, and new cross lines roll toward you along the same perspective
//   2. the windows and neon tubes of the server towers breathe, flicker and now and then flash
//   3. glowing sparks start at the front of the road and race away to the horizon, shrinking and fading
//   4. painted server-tower fans get spinning blades (22 fans, each an ellipse in photo pixels, spun in the
//      plane of the tower face so foreshortened side-face housings stay aligned)
// Everything is placed in the photo's own pixels (2352 x 1008) and mapped through the same "background-size: cover;
// background-position: center" math as the CSS, recomputed on resize, so it lines up on every screen and crop.
// Reduced motion: one still frame with a soft glow and static fan blades. Low-quality mode
// (neon-display.js, html.disp-q-low): fewer lights and sparks at 30 fps. Pauses when the hero is
// off screen or the tab is hidden. No libraries.
(function () {
  const host = document.querySelector(".hero > .hero-photo-placeholder");
  if (!host || !window.HTMLCanvasElement) return;
  const IW = 2352, IH = 1008;
  // The road's vanishing point (where the painted lane lines meet, at the foot of the sun) in photo pixels.
  const VX = 1188, VY = 862;
  // Painted lane lines: x = VX + (k - 0.56) * 262 * (dy / 143), dy = y - VY (fitted to the pink lines at y = 990 and 1005).
  const LANE = 262 / 143, LANE_OFF = -0.56;
  // Painted cross lines sit at dy = 121 / z for z = 1, 1.5, 2, 2.5 ... (y = 983, 943, 922, 910 ...).
  const ZK = 121, ZSTEP = 0.5;
  // Tower lights: x, y, colour (photo pixels), found from the bright, saturated spots on the towers and the kiosk.
  const S = [134,790,0xb85d5b,134,802,0xc25c6e,134,814,0xb65875,134,862,0x935169,206,790,0xa03b4e,218,790,0xc5574a,218,802,0xd1604e,218,874,0x1998b6,218,886,0x24bdca,230,790,0xe68356,230,802,0xef9059,230,874,0x2596b2,230,886,0x28bfcf,242,790,0xe09161,254,790,0xd98b65,254,802,0xdc7859,266,790,0xe5976b,266,802,0xd67152,266,850,0x9449b4,278,790,0xe39970,278,802,0xc25d4f,278,886,0x8665a8,290,790,0xe1946b,290,802,0xba584d,290,826,0x1e8aac,290,862,0xa64c5e,302,790,0xd38265,302,802,0x9f4547,314,706,0x8f5288,314,790,0xb5534a,314,802,0x923a42,314,814,0xa74745,314,826,0xdc7457,314,838,0xbb4e5b,314,850,0xb24466,314,862,0xaa446b,314,874,0x3b90b2,326,802,0xab493e,326,814,0xd8774b,326,826,0xe08d59,326,838,0xda8c70,326,850,0xa24d81,326,862,0xc15ec4,338,802,0xc0594c,338,814,0xe89266,338,826,0xe28c57,338,838,0xdc917b,338,850,0x973c7b,338,862,0x9e479f,362,766,0x5523a1,362,778,0x5329a0,374,706,0x884c75,374,718,0x90507d,374,766,0x6a33a3,374,778,0x301c94,374,790,0x773ea5,374,826,0xe76c9d,374,838,0xd25491,374,850,0xcf579a,374,862,0x8b4e67,386,706,0x924e77,386,718,0x974e7e,386,778,0x371d94,386,814,0xc5644e,386,826,0xe7766d,386,838,0xda6768,386,850,0xb14652,386,862,0xa74958,386,874,0x9a404e,416,554,0xa15274,416,566,0xa85677,416,578,0xb05c74,416,590,0xbc5f70,416,602,0xbf5c6c,416,614,0xaf556f,416,626,0x9f506e,416,662,0x995676,416,698,0x975178,416,770,0xa1389d,428,818,0xc6674a,440,794,0x7e3c9c,440,806,0x9c494f,440,818,0xdd764f,440,878,0x77b8c9,452,782,0x461d90,452,794,0x6b3799,452,806,0x964047,452,818,0xdb6a4c,452,878,0x9e4752,464,782,0x4b2694,464,794,0x5a3195,464,806,0xbc4547,464,818,0xcb4e41,476,782,0x4b2b92,476,794,0x633d9d,476,818,0xe1794f,476,830,0xf7b078,476,842,0xf8a36b,476,854,0xee8b66,476,866,0xd36c5b,488,782,0x593592,488,794,0x573998,488,818,0xc06756,488,830,0xc66b5e,488,842,0xd07661,500,482,0xb16d5b,500,794,0x5a3e9d,500,818,0xaa488f,500,830,0xac3c86,500,842,0xaa3c89,500,854,0xa43c86,500,866,0x9d3982,512,482,0xba715b,512,506,0x3a93aa,512,710,0x9a47aa,512,746,0x7cbdd0,524,746,0x609ebc,560,506,0xbe65c4,560,518,0xbd5bc4,560,566,0xc363c4,560,578,0xc160c3,560,590,0xc96cca,560,602,0xd06dd1,596,710,0x863a9a,596,746,0x60a7c2,596,758,0x3a689a,596,770,0x315b8f,608,758,0x3a689a,620,710,0x9b46aa,620,746,0x66b2c8,632,542,0x63bed1,644,542,0x37289b,644,710,0x9c4aac,656,590,0xa64473,680,650,0xc173ca,680,662,0xc57ccc,680,674,0xca80d3,692,638,0xc66bcf,692,686,0xc370cb,704,686,0xc271ce,716,410,0xa6554b,728,566,0x885673,728,578,0x94576e,728,590,0x985b6e,728,674,0xbe715b,728,686,0xdb8162,728,698,0xe17f5e,728,710,0xc76b5d,728,722,0xb15b59,728,734,0x9d5362,728,746,0x884663,740,650,0xaf6d69,740,686,0xc26e5d,740,842,0xb27260,752,554,0x986471,752,602,0x925572,752,662,0xb96961,752,674,0xbc6e61,752,686,0xcc7866,752,746,0x8c5ab1,752,758,0x614fa4,764,674,0xba6961,764,746,0xae44bb,764,758,0xba53cd,788,554,0x8e5975,788,626,0xa7626e,788,638,0xb06760,788,650,0xbe7274,788,662,0xc06966,788,686,0xd0887b,788,698,0xbf7d72,788,854,0x5fadb9,800,470,0x884179,800,542,0xa75f9b,800,566,0x9f607d,800,662,0xa8615d,800,686,0xbf7e7b,800,698,0xb6736e,800,710,0xde8750,800,734,0x6980ad,812,470,0x834076,812,482,0x91477b,812,494,0x994f7f,824,470,0x8a4277,824,482,0x94477a,824,494,0x94497a,836,482,0x954779,836,506,0x9a5271,836,518,0x904c6f,836,530,0x985471,836,542,0x955278,836,554,0x9b567c,836,590,0x9f657e,836,602,0xa2657a,836,614,0xae6f7a,836,626,0xc37164,836,638,0xe38b6d,836,710,0xd67963,836,722,0xbf6169,836,734,0xac5562,836,746,0x984f5e,836,758,0x8a445e,836,818,0x8f336d,836,866,0xab3e8a,848,482,0x924779,848,494,0x8d4676,848,518,0x8b487a,848,530,0xa55581,848,542,0x9b5482,848,554,0x97507f,848,722,0x9c49b3,848,734,0x8670bd,848,866,0xa14281,860,482,0x884373,860,494,0x924a7a,860,518,0x824376,860,530,0x924e7c,860,542,0x94507e,860,554,0x954d7d,860,878,0xa44683,876,802,0xc47e5e,888,802,0xb26552,912,646,0xc9749f,912,658,0xd08b81,912,670,0xc3786f,912,694,0xc67398,912,706,0xce78b0,912,730,0xb66685,912,742,0xa8637a,924,706,0xcc68a9,924,730,0xb56e8a,1456,671,0xd57974,1456,683,0xad546b,1468,671,0xd57875,1468,683,0xd88672,1468,695,0xebba94,1468,707,0xdca386,1468,719,0xda8f78,1468,731,0xd69589,1468,743,0xb56f7d,1468,791,0x99539a,1468,863,0xa44b81,1480,671,0xd57c77,1480,863,0x954778,1492,671,0xd38576,1492,707,0xd09a82,1492,719,0xc87f71,1492,779,0xa85c72,1516,695,0x925f95,1516,719,0x7955ad,1516,755,0xa94ec3,1516,863,0x863e66,1528,719,0x7752b1,1528,731,0x8359b8,1528,755,0xa94dc8,1528,875,0x993e75,1528,887,0xb75189,1540,875,0x9d4177,1552,671,0xe18378,1626,507,0x88416c,1626,519,0xa35374,1626,531,0xa55983,1626,543,0xa36086,1626,591,0xa7647b,1626,603,0xb8707c,1626,615,0xc47d7a,1626,627,0xd9877a,1626,639,0xe09281,1626,651,0xe59680,1626,663,0xdd9575,1626,675,0xeda37f,1626,687,0xe09276,1626,699,0xc0776e,1626,711,0xc2726e,1626,723,0xcc6d6e,1638,507,0x90426f,1638,519,0xa45276,1638,531,0x9f5380,1638,555,0x916076,1650,507,0x8e4270,1650,519,0xa4537a,1650,627,0xd28680,1650,639,0xd99684,1650,651,0xbd766b,1650,663,0xeca583,1650,675,0xe8a177,1650,687,0xe18f69,1650,699,0xd96d4c,1650,711,0xc95c47,1650,723,0xbf5e53,1650,735,0xad5354,1662,507,0x8a4174,1662,555,0xa54eb8,1662,663,0x9a4099,1674,819,0x9c28bd,1686,579,0x7b509d,1686,651,0xae67af,1686,663,0xd08b9b,1686,807,0x9a39b3,1686,819,0xb744c2,1686,831,0xb338a2,1698,471,0x9f476c,1698,519,0xbf75ad,1698,567,0xc17cc7,1698,579,0xa25dab,1698,639,0xba65a6,1698,651,0xda72ca,1698,663,0xcf847b,1698,687,0xe8b593,1698,807,0x724ea6,1698,819,0xa342bc,1698,831,0xde7b7e,1710,519,0xab65b0,1710,531,0x976baa,1710,543,0x9e66a9,1710,555,0xbd7ac6,1710,567,0xa064b1,1710,639,0xbb65ae,1710,651,0xd77da6,1710,675,0xda9c89,1710,687,0xe2a989,1710,807,0x7f54b6,1710,819,0xab52c3,1710,831,0xdd7874,1710,843,0xa95762,1722,471,0x90436e,1722,531,0xa066ac,1722,543,0xb979c6,1722,555,0xad74c1,1722,567,0x8c57aa,1722,639,0xbc6cc5,1722,651,0xb86a86,1722,687,0xbc6760,1722,807,0x8335a4,1722,819,0xb859c0,1722,831,0xcd6b79,1734,543,0x925a91,1734,579,0x9e5c8d,1734,591,0xa96695,1734,603,0xae678f,1734,615,0xa06076,1734,627,0xa86277,1734,639,0xb46972,1734,651,0xbd776e,1734,663,0xd18d7b,1734,675,0xe29672,1734,687,0xe29368,1734,699,0xdb8860,1734,711,0xca7157,1734,723,0xa05155,1734,735,0x9b4e56,1734,819,0xa43592,1806,663,0x6b26a0,1818,663,0x6f22a8,1830,519,0xc17e51,1830,663,0x7d2daa,1842,663,0x872fae,1854,663,0x8d33b8,1866,663,0x8731a9,1996,656,0xc7647a,2008,656,0xac5577,2008,692,0xbf5d4e,2020,656,0x994f74,2032,656,0xa9597d,2080,704,0x9e5f6d,2092,740,0xa95a5e,2164,692,0x5c3fa2,2164,776,0xbd5a76,2176,740,0x6a3da4,2176,776,0xe69e7d,2176,860,0x6f67c1,2176,872,0xab60cf,2224,776,0xb5734e,2224,812,0xc27c59,2236,680,0xbf5974,2236,728,0x9a3fa7,2236,776,0xcc6a6b,2236,788,0xc06358,2236,812,0xc25a6c,2248,788,0xaf5748];
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const low = () => document.documentElement.classList.contains("disp-q-low");

  const cv = document.createElement("canvas");
  cv.className = "hero-anim";
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block";
  host.appendChild(cv);
  const g = cv.getContext("2d");

  // Soft round glow sprites, one per colour, drawn once.
  const sprites = new Map();
  function sprite(rgb) {
    let c = sprites.get(rgb);
    if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), r = (rgb >> 16) & 255, gg = (rgb >> 8) & 255, b = rgb & 255;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.18, `rgba(${r},${gg},${b},.9)`);
    gr.addColorStop(0.5, `rgba(${r},${gg},${b},.28)`);
    gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    sprites.set(rgb, c);
    return c;
  }
  // Lights: each breathes on its own; about one in five flickers like a faulty tube; any can flash now and then.
  const lights = [];
  for (let i = 0; i < S.length; i += 3) {
    lights.push({ x: S[i], y: S[i + 1], c: S[i + 2], ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6,
      flick: Math.random() < 0.2, flash: 0, keep: Math.random() < 0.5 });
  }
  const SPARK_COLS = [0xff4fd8, 0xffb347, 0x7fe8ff, 0xff8c1a, 0xc77dff];
  const sparks = [];
  function spawn(s) {
    s.X = (Math.random() * 2 - 1) * 3.2 + LANE_OFF; s.z = 0.85 + Math.random() * 0.4;
    s.v = 0.35 + Math.random() * 0.5; s.c = SPARK_COLS[(Math.random() * SPARK_COLS.length) | 0]; s.r = 10 + Math.random() * 10;
    return s;
  }

  // Fans: cx, cy, rx, ry, rot_deg in photo pixels. Located on 4×-upscaled grid crops of the 2352×1008
  // source (tight cluster crops), then checked with ellipse overlays against the painted rims.
  // Front-face housings are near-circular; the receding right face is foreshortened (rx < ry).
  // Blades are clipped slightly inside the painted ring and spin in the plane of each face.
  const FANS = [
    // leftmost row of 3
    469.5,706,12.2,12.5,0, 495.3,706,12.2,12.5,0, 521.5,706,12.2,12.5,0,
    // mid-upper 3 + 2
    601,444,14.5,15,0, 629,444,14.5,15,0, 656,444,14.5,15,0, 609,509,14.5,15,0, 650,509,14.5,15,0,
    // mid-lower 2×3
    598,693.5,11.2,11.2,0, 624,693.5,11.2,11.2,0, 649,693.5,11.2,11.2,0,
    598,716.5,11.2,11.2,0, 624,716.5,11.2,11.2,0, 649,716.5,11.2,11.2,0,
    // right-face mid 2×2 (foreshortened)
    740,606,10.5,11.5,0, 767,606,9.5,11.5,0, 740,629,11.5,13,0, 767,629,10.5,13,0,
    // right-face low pair
    741,715,12.2,13.5,0, 767,715,11,13.5,0,
    // right-tower pair
    1689.5,749.5,13,13.5,0, 1720.5,749.5,13,13.5,0
  ];

  let W = 0, H = 0, k = 1, ox = 0, oy = 0, dpr = 1;

  function fit() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(low() ? 1 : 1.5, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    k = Math.max(W / IW, H / IH); ox = (W - IW * k) / 2; oy = (H - IH * k) / 2;   // cover + center, as in the CSS
  }
  const px = (x) => (ox + x * k) * dpr, py = (y) => (oy + y * k) * dpr;

  function drawFans(t) {
    const n = FANS.length / 5;
    for (let i = 0; i < n; i++) {
      const x = FANS[i * 5], y = FANS[i * 5 + 1];
      const rx = FANS[i * 5 + 2], ry = FANS[i * 5 + 3];
      const rot = FANS[i * 5 + 4] * Math.PI / 180;
      const Rx = rx * k * dpr, Ry = ry * k * dpr;
      if (Math.min(Rx, Ry) < 1.2) continue;
      const dir = (i % 2) ? 1 : -1;
      const rev = (0.28 + (i * 0.119) % 0.35) * dir; // modest, slightly varied
      const ang = reduce ? i * 0.37 : t * rev * Math.PI * 2;
      const cx = px(x), cy = py(y);
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.scale(Rx, Ry); // unit circle now maps onto the housing ellipse
      g.beginPath(); g.arc(0, 0, 0.92, 0, Math.PI * 2); g.clip(); // inside the painted rim
      const blades = 5, step = Math.PI * 2 / blades, span = step * 0.22;
      const passes = reduce ? 1 : 3;
      for (let p = 0; p < passes; p++) {
        const a0 = ang - dir * p * 0.10;
        g.globalAlpha = reduce ? 0.30 : (0.26 - p * 0.07);
        g.fillStyle = "#0a0712";
        g.beginPath();
        for (let b = 0; b < blades; b++) {
          const a = a0 + b * step;
          g.moveTo(Math.cos(a + span * 0.5) * 0.12, Math.sin(a + span * 0.5) * 0.12);
          g.arc(0, 0, 0.86, a, a + span);
          g.closePath();
        }
        g.fill();
      }
      g.globalAlpha = 0.45;
      g.fillStyle = "#1a1228";
      g.beginPath(); g.arc(0, 0, 0.13, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  function frame(t, dt) {
    const L = low();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "lighter";
    const unit = k * dpr, bottom = IH + 40;

    // 1. Road: the painted lane lines pulse; cross lines roll toward the viewer and line up with the painted ones every step.
    const pulse = reduce ? 0.6 : 0.55 + 0.45 * Math.sin(t * 2.2);
    const dyB = bottom - VY;
    g.lineCap = "round";
    for (let lane = -4; lane <= 4; lane++) {
      const xb = VX + (lane + LANE_OFF) * LANE * dyB;
      for (const [w, a] of [[9, 0.07], [2.2, 0.32]]) {
        g.strokeStyle = `rgba(255,70,215,${a * pulse})`; g.lineWidth = Math.max(1, w * unit);
        g.beginPath(); g.moveTo(px(VX), py(VY + 2)); g.lineTo(px(xb), py(bottom)); g.stroke();
      }
    }
    const phase = reduce ? 0 : (t * 0.32) % ZSTEP;
    for (let n = 0; n < 16; n++) {
      const z = 0.75 + n * ZSTEP - phase + (1 - 0.75) % ZSTEP;
      const dy = ZK / z; if (dy < 6) break;
      const y = VY + dy, xl = VX + (-4 + LANE_OFF) * LANE * dy, xr = VX + (4 + LANE_OFF) * LANE * dy;
      const a = Math.min(1, 1.6 / z) * Math.min(1, (dy - 6) / 14);
      for (const [w, al] of [[8, 0.08], [2, 0.34]]) {
        g.strokeStyle = `rgba(255,90,225,${al * a})`; g.lineWidth = Math.max(1, w * unit * Math.min(1.4, 1.2 / z));
        g.beginPath(); g.moveTo(px(xl), py(y)); g.lineTo(px(xr), py(y)); g.stroke();
      }
    }
    // A soft glow along the horizon where the road meets the city
    g.fillStyle = `rgba(255,120,200,${0.05 + 0.04 * pulse})`;
    g.fillRect(0, py(VY - 6), cv.width, Math.max(2, 10 * unit));

    // 2. Tower lights
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (L && !l.keep) continue;
      let a;
      if (reduce) a = 0.35;
      else {
        a = 0.34 + 0.3 * Math.sin(t * l.sp + l.ph);
        if (l.flick) a *= (Math.sin(t * 37 + l.ph * 9) > 0.55 || Math.random() < 0.06) ? 0.15 : 1.15;
        if (l.flash > 0) { a += l.flash; l.flash = Math.max(0, l.flash - dt * 2.2); }
        else if (Math.random() < dt * 0.08) l.flash = 1;
      }
      if (a <= 0.02) continue;
      const size = 36 * unit;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(sprite(l.c), px(l.x) - size / 2, py(l.y) - size / 2, size, size);
    }
    g.globalAlpha = 1;

    // 3. Sparks racing from the front of the road to the horizon
    if (!reduce) {
      const want = L ? 14 : 36;
      while (sparks.length < want) sparks.push(spawn({}));
      for (const s of sparks) {
        s.z += dt * s.v * s.z;                     // faster in the distance, steady on screen
        if (s.z > 9) spawn(s);
        const dy = ZK / s.z, x = VX + s.X * LANE * dy, y = VY + dy;
        const a = Math.min(1, (9 - s.z) / 5) * Math.min(1, (s.z - 0.8) * 4);
        const size = (s.r / s.z) * 2.2 * unit;
        if (a <= 0 || size < 0.5) continue;
        g.globalAlpha = a;
        g.drawImage(sprite(s.c), px(x) - size / 2, py(y) - size / 2, size, size);
        // a short light trail toward the viewer
        const dy2 = ZK / Math.max(0.8, s.z - 0.12), x2 = VX + s.X * LANE * dy2;
        g.strokeStyle = `rgba(255,200,240,${0.35 * a})`; g.lineWidth = Math.max(1, size * 0.18);
        g.beginPath(); g.moveTo(px(x), py(y)); g.lineTo(px(x2), py(VY + dy2)); g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = "source-over";
    drawFans(t);
  }

  let on = true, visible = !document.hidden, raf = 0, last = 0, acc = 0;
  function loop(now) {
    raf = 0;
    if (!on || !visible) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now; acc += dt;
    if (low() && acc < 1 / 30) { raf = requestAnimationFrame(loop); return; }
    frame(now / 1000, acc); acc = 0;
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!reduce && !raf && on && visible) { last = 0; raf = requestAnimationFrame(loop); } }
  fit();
  if (reduce) frame(0, 0); else start();
  let rt = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { fit(); if (reduce) frame(0, 0); }, 120); });
  document.addEventListener("tenshi:display", () => { fit(); if (reduce) frame(0, 0); });
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; start(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((e) => { on = e[e.length - 1].isIntersecting; start(); }).observe(host);
  }
  window.__heroTime = (t) => {
    on = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    frame(t, 0);
  };
})();
