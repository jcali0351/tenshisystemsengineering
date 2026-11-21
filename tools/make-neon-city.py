"""Paints img/art/neon-city.jpg: an original, full-width cyberpunk cityscape for the "Let's build what's next" band.

Violet-to-magenta sky with stars, a striped neon sun on the horizon, three layers of skyscrapers with lit windows,
glowing neon sign strips (shapes only, no lettering), searchlight beams, horizon haze, a mirrored neon street grid,
rain and bokeh. Everything is drawn here from random shapes with a fixed seed, so it can be re-rendered exactly.
Run: python tools/make-neon-city.py
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2560, 1080
HOR = int(H * 0.66)            # horizon line
rnd = random.Random(20261121)
np.random.seed(20261121)

def lerp(a, b, t):
    return a + (b - a) * t

def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255

# ---------------------------------------------------------------- sky
y = np.linspace(0, 1, HOR)[:, None]
stops = [(0.0, "#05010d"), (0.35, "#1a0636"), (0.62, "#4a0f6e"), (0.82, "#a3208f"), (0.95, "#ff3fa4"), (1.0, "#ff7ab8")]
sky = np.zeros((HOR, W, 3), np.float32)
for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
    m = ((y >= p0) & (y <= p1)).astype(np.float32)
    t = np.clip((y - p0) / max(p1 - p0, 1e-6), 0, 1)
    sky += m[..., None] * (hexrgb(c0) * (1 - t[..., None]) + hexrgb(c1) * t[..., None])
img = np.zeros((H, W, 3), np.float32)
img[:HOR] = sky

# stars
for _ in range(900):
    sx, sy = rnd.randrange(W), int(rnd.random() ** 2 * HOR * 0.6)
    b = rnd.random() * 0.8 + 0.2
    img[sy, sx] = np.minimum(1, img[sy, sx] + b * np.array([0.9, 0.85, 1.0]))

emis = np.zeros((H, W, 3), np.float32)   # light that glows (blurred and added at the end)

# ---------------------------------------------------------------- sun
cx, cy, R = W // 2, HOR - 40, 300
yy, xx = np.mgrid[0:H, 0:W]
d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
sun_mask = (d < R) & (yy < HOR)
t = np.clip((yy - (cy - R)) / (2 * R), 0, 1)
sun_col = hexrgb("#ffd36e")[None, None] * (1 - t[..., None]) + hexrgb("#ff2bd6")[None, None] * t[..., None]
# horizontal gaps across the lower half, getting wider toward the horizon
stripe = np.ones((H, W), bool)
for k in range(9):
    sy0 = cy + 30 + k * 30
    gap = 3 + k * 2.2
    stripe &= ~((yy > sy0) & (yy < sy0 + gap))
sun = sun_mask & stripe
img[sun] = sun_col[sun]
sun_emis = np.zeros((H, W, 3), np.float32)
sun_emis[sun] = sun_col[sun] * 0.6
halo = np.exp(-np.clip(d - R, 0, None) / 160)[..., None] * hexrgb("#ff3fa4") * 0.55
img[:HOR] += halo[:HOR]

# ---------------------------------------------------------------- buildings
def building_layer(n, hmin, hmax, wmin, wmax, base_col, win_prob, win_cols, sign_prob, haze, edge_light):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    dl, dg = ImageDraw.Draw(layer), ImageDraw.Draw(glow)
    x = -rnd.randint(0, wmax)
    col = tuple(int(c * 255) for c in base_col)
    while x < W:
        bw = rnd.randint(wmin, wmax)
        bh = rnd.randint(hmin, hmax)
        # leave a calmer valley in the middle so the headline reads cleanly
        centre = abs((x + bw / 2) - W / 2) / (W / 2)
        bh = int(bh * (0.55 + 0.45 * min(1, centre * 1.6)))
        top = HOR - bh
        dl.rectangle([x, top, x + bw, HOR], fill=col + (255,))
        if rnd.random() < 0.35:                      # stepped crown
            dl.rectangle([x + bw * 0.2, top - bh * 0.08, x + bw * 0.8, top], fill=col + (255,))
        if rnd.random() < 0.3:                       # antenna with a red light
            ax = x + bw // 2
            dl.line([ax, top - bh * 0.08, ax, top - bh * 0.2], fill=col + (255,), width=3)
            dg.ellipse([ax - 4, top - bh * 0.2 - 4, ax + 4, top - bh * 0.2 + 4], fill=(255, 60, 120))
        # windows
        cw, chh = rnd.choice([(6, 9), (8, 11), (5, 7)])
        gx, gy = cw + rnd.randint(4, 7), chh + rnd.randint(5, 9)
        wc = rnd.choice(win_cols)
        for wy in range(top + 10, HOR - 6, gy):
            for wx in range(x + 6, x + bw - cw - 4, gx):
                if rnd.random() < win_prob:
                    b = rnd.uniform(0.35, 1.0)
                    c = tuple(int(v * b * 255) for v in wc)
                    dl.rectangle([wx, wy, wx + cw, wy + chh], fill=c + (255,))
                    if b > 0.8:
                        dg.rectangle([wx, wy, wx + cw, wy + chh], fill=tuple(int(v * 0.6) for v in c))
        # neon sign strips: vertical segmented bars or horizontal bands, no lettering
        if rnd.random() < sign_prob and bw > 40:
            nc = rnd.choice([(255, 43, 214), (0, 240, 255), (176, 77, 255), (255, 120, 60), (255, 215, 110)])
            if rnd.random() < 0.6:
                sx0 = x + rnd.randint(4, max(5, bw // 3))
                sw = rnd.randint(10, 18)
                sy0 = top + rnd.randint(10, max(11, bh // 3))
                sh = rnd.randint(int(bh * 0.2), int(bh * 0.5))
                dl.rectangle([sx0, sy0, sx0 + sw, sy0 + sh], fill=(20, 4, 30, 255), outline=nc + (255,), width=2)
                for k in range(sy0 + 8, sy0 + sh - 8, 22):
                    dl.rectangle([sx0 + 3, k, sx0 + sw - 3, k + 12], fill=nc + (255,))
                    dg.rectangle([sx0 + 3, k, sx0 + sw - 3, k + 12], fill=nc)
                dg.rectangle([sx0, sy0, sx0 + sw, sy0 + sh], outline=nc, width=3)
            else:
                sy0 = top + rnd.randint(12, max(13, bh // 2))
                dl.rectangle([x + 6, sy0, x + bw - 6, sy0 + 8], fill=nc + (255,))
                dg.rectangle([x + 6, sy0, x + bw - 6, sy0 + 8], fill=nc)
        if edge_light:                               # magenta rim light from the sun side
            ec = (255, 70, 190) if x + bw / 2 < W / 2 else (120, 220, 255)
            ex = x + bw if x + bw / 2 < W / 2 else x
            dl.line([ex, top, ex, HOR], fill=ec + (200,), width=2)
            dg.line([ex, top, ex, HOR], fill=tuple(c // 2 for c in ec), width=3)
        x += bw + rnd.randint(-6, 14)
    arr = np.asarray(layer).astype(np.float32) / 255
    a = arr[..., 3:4]
    rgb = arr[..., :3] * (1 - haze) + hexrgb("#7a2a9a") * haze
    return rgb, a, np.asarray(glow).astype(np.float32) / 255

cover = np.zeros((H, W, 1), np.float32)
for args in [
    dict(n=0, hmin=120, hmax=300, wmin=40, wmax=110, base_col=(0.20, 0.07, 0.32), win_prob=0.10, win_cols=[(1, .6, .9), (.6, .9, 1)], sign_prob=0.15, haze=0.45, edge_light=False),
    dict(n=1, hmin=200, hmax=470, wmin=60, wmax=150, base_col=(0.09, 0.03, 0.16), win_prob=0.16, win_cols=[(1, .55, .85), (.55, .95, 1), (1, .85, .6)], sign_prob=0.45, haze=0.18, edge_light=True),
    dict(n=2, hmin=380, hmax=660, wmin=110, wmax=230, base_col=(0.035, 0.01, 0.07), win_prob=0.2, win_cols=[(1, .5, .85), (.5, .95, 1)], sign_prob=0.8, haze=0.0, edge_light=True),
]:
    rgb, a, g = building_layer(**args)
    img = img * (1 - a) + rgb * a
    emis += g
    cover = np.maximum(cover, a)

emis += sun_emis * (1 - cover)

# horizon haze band
hz = np.exp(-((np.arange(H) - HOR) / 70.0) ** 2)[:, None, None] * hexrgb("#ff4fb0") * 0.35
img += hz

# ---------------------------------------------------------------- street: mirrored city and neon grid
src = img[HOR - (H - HOR):HOR][::-1].copy()
for r in range(src.shape[0]):
    src[r] = np.roll(src[r], int(6 * math.sin(r * 0.35) * (r / src.shape[0] + 0.2)), axis=0)
refl = src * 0.2
ground = np.linspace(0, 1, H - HOR)[:, None, None]
floor = hexrgb("#12021f") * (1 - ground) + hexrgb("#05000a") * ground
img[HOR:] = floor + refl * (1 - ground * 0.8)
emis[HOR:] += emis[HOR - (H - HOR):HOR][::-1] * 0.12

grid = Image.new("RGB", (W, H), (0, 0, 0))
dgrd = ImageDraw.Draw(grid)
vx = W / 2
for i in range(-40, 41):                                   # lines running to the vanishing point
    x2 = vx + i * 140
    dgrd.line([vx + i * 12, HOR, x2 * 1 + (x2 - vx) * 2.5, H], fill=(255, 43, 214), width=2)
k = 0
while True:                                                # cross lines, closer together near the horizon
    yline = HOR + (H - HOR) * (k / 14) ** 2.1
    if yline > H: break
    dgrd.line([0, yline, W, yline], fill=(176, 77, 255), width=2)
    k += 1
g = np.asarray(grid).astype(np.float32) / 255
fade = np.clip((np.arange(H) - HOR) / (H - HOR), 0, 1)[:, None, None] ** 0.8
g *= fade * 0.55
img += g
emis += g * 0.8

# ---------------------------------------------------------------- searchlight beams
beams = Image.new("L", (W, H), 0)
db = ImageDraw.Draw(beams)
for bx, ang, spread in [(330, -62, 5), (720, -80, 4), (1880, -100, 4), (2260, -118, 5)]:
    a1, a2 = math.radians(ang - spread), math.radians(ang + spread)
    L = 1400
    by = HOR - 380
    db.polygon([(bx, by), (bx + L * math.cos(a1), by + L * math.sin(a1)), (bx + L * math.cos(a2), by + L * math.sin(a2))], fill=60)
beams = np.asarray(beams.filter(ImageFilter.GaussianBlur(18))).astype(np.float32)[..., None] / 255
img += beams * hexrgb("#b04dff") * 0.6

# ---------------------------------------------------------------- glow, rain, bokeh, finish
E = Image.fromarray(np.clip(emis * 255, 0, 255).astype(np.uint8))
g1 = np.asarray(E.filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
g2 = np.asarray(E.filter(ImageFilter.GaussianBlur(28))).astype(np.float32) / 255
img += g1 * 0.8 + g2 * 0.9

rain = Image.new("L", (W, H), 0)
dr = ImageDraw.Draw(rain)
for _ in range(1400):
    rx, ry = rnd.randrange(W), rnd.randrange(H)
    ln = rnd.randint(14, 40)
    dr.line([rx, ry, rx - ln * 0.18, ry + ln], fill=rnd.randint(30, 90), width=1)
rain = np.asarray(rain).astype(np.float32)[..., None] / 255
img += rain * np.array([0.7, 0.75, 1.0]) * 0.35

bok = Image.new("RGB", (W, H), (0, 0, 0))
dk = ImageDraw.Draw(bok)
for _ in range(70):
    r = rnd.randint(8, 34)
    bx, byy = rnd.randrange(W), rnd.randint(int(H * 0.15), H)
    c = rnd.choice([(255, 43, 214), (0, 240, 255), (176, 77, 255), (255, 200, 120)])
    dk.ellipse([bx - r, byy - r, bx + r, byy + r], fill=tuple(int(v * 0.35) for v in c))
bok = np.asarray(bok.filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
img += bok * 0.5

# vignette and grain
vy, vxg = np.mgrid[0:H, 0:W]
v = 1 - 0.55 * (((vxg - W / 2) / (W / 2)) ** 2 * 0.6 + ((vy - H / 2) / (H / 2)) ** 2 * 0.8)
img *= np.clip(v, 0.25, 1)[..., None]
img += np.random.normal(0, 0.012, img.shape).astype(np.float32)

# soft tone map so highlights roll off instead of clipping
img = 1 - np.exp(-img * 1.35)
out = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8))
os.makedirs("img/art", exist_ok=True)
out.save("img/art/neon-city.jpg", quality=86, optimize=True, progressive=True)
out.resize((W // 4, H // 4), Image.LANCZOS).save(os.environ.get("PREVIEW", "neon-city-preview.png"))
print("img/art/neon-city.jpg", out.size, os.path.getsize("img/art/neon-city.jpg") // 1024, "KB")
