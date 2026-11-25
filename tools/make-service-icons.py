# Draws two neon line icons (cyan -> pink, white-hot core, soft glow) on transparent canvases, saved at 256px (the cards show them at about 110px).
import math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 1024
CYAN, PINK = np.array([0, 240, 255]), np.array([255, 43, 214])

def gradient():
    x = np.linspace(0, 1, S)[None, :, None]
    y = np.linspace(0, 1, S)[:, None, None]
    t = np.clip((x * 0.8 + y * 0.2 - 0.25) * 1.9, 0, 1)
    return (CYAN * (1 - t) + PINK * t)

def render(draw_fn, out, size=256, blur1=10, blur2=34, coremin=13, coremix=0.35):
    line = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(line)
    draw_fn(d)
    m = np.asarray(line).astype(np.float32) / 255
    g1 = np.asarray(line.filter(ImageFilter.GaussianBlur(blur1))).astype(np.float32) / 255
    g2 = np.asarray(line.filter(ImageFilter.GaussianBlur(blur2))).astype(np.float32) / 255
    col = gradient() / 255
    core = np.asarray(line.filter(ImageFilter.MinFilter(coremin))).astype(np.float32) / 255  # thin bright centre
    glow = np.clip(g1 * 2.2 + g2 * 1.8, 0, 1)
    alpha = np.clip(np.maximum(m, glow * 0.85), 0, 1)
    rgb = col * np.maximum(m, glow)[..., None]
    rgb = rgb + (1 - rgb) * (core * coremix)[..., None]       # white-hot core like real neon tubes
    rgb = np.where(alpha[..., None] > 0, rgb / np.maximum(alpha[..., None], 1e-3), 0)
    rgba = np.dstack([np.clip(rgb, 0, 1), alpha])
    img = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").resize((size, size), Image.LANCZOS)
    img.save(out, "WEBP", quality=90, method=6)

W = 30  # tube width

def arc(d, box, a0, a1, w=W):
    d.arc(box, a0, a1, fill=255, width=w)

def bulb(d):
    # Bold and simple so it reads at card size: big dome, neck, two-band base, one clear filament, three rays.
    w = 64
    cx, cy, r = 512, 450, 240
    d.arc((cx - r, cy - r, cx + r, cy + r), 138, 402, fill=255, width=w)
    a = math.radians(138); b = math.radians(42)
    lx, ly = cx + r * math.cos(a), cy + r * math.sin(a)
    rx, ry = cx + r * math.cos(b), cy + r * math.sin(b)
    d.line([(lx, ly), (402, 720), (402, 760)], fill=255, width=w, joint="curve")
    d.line([(rx, ry), (622, 720), (622, 760)], fill=255, width=w, joint="curve")
    d.line([(402, 760), (622, 760)], fill=255, width=w)
    d.line([(430, 850), (594, 850)], fill=255, width=w)
    d.line([(475, 930), (549, 930)], fill=255, width=w)
    d.line([(450, 720), (450, 560), (512, 500), (574, 560), (574, 720)], fill=255, width=w - 18, joint="curve")
    for ang, r0, r1 in ((-90, 310, 395), (-135, 315, 390), (-45, 315, 390)):
        t = math.radians(ang)
        d.line([(cx + r0 * math.cos(t), cy + r0 * math.sin(t)), (cx + r1 * math.cos(t), cy + r1 * math.sin(t))], fill=255, width=w - 8)

def star(d, x, y, r, w):
    d.line([(x, y - r), (x, y + r)], fill=255, width=w)
    d.line([(x - r, y), (x + r, y)], fill=255, width=w)

def gem(d):
    # Branding: a bold hexagon badge (a brand mark) with a star at its heart. Simple shapes so it reads at card size.
    w = 58
    cx, cy, R = 512, 512, 380
    hexa = [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a))) for a in range(-90, 271, 60)]
    d.line(hexa + [hexa[1]], fill=255, width=w, joint="curve")
    pts = []
    for i in range(10):
        rr = 190 if i % 2 == 0 else 82
        a = math.radians(-90 + i * 36)
        pts.append((cx + rr * math.cos(a), cy + 12 + rr * math.sin(a)))
    d.line(pts + [pts[0], pts[1]], fill=255, width=w - 14, joint="curve")

render(bulb, sys.argv[1] + "/consulting.webp", blur1=7, blur2=20, coremin=21, coremix=0.55)
render(gem, sys.argv[1] + "/branding.webp", blur1=7, blur2=20, coremin=21, coremix=0.55)
print("ok")
