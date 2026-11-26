"""
build_fonts.py: makes the self-hosted fonts in platform/cms/static/fonts/ (templates.FONTS) from Google Fonts' variable
TTFs: weight range clamped, other axes pinned to their defaults, subset to Latin + Latin Extended-A, WOFF2.
Only SIL OFL fonts without a Reserved Font Name (a subset is a modified version). Needs: pip install fonttools brotli
Usage: python tools/fonts/build_fonts.py   (G = folder with the Google Fonts families)
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
G = os.environ.get("GOOGLE_FONTS_DIR", "/usr/share/fonts/truetype/sand-box/google")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "platform", "cms", "static", "fonts")
os.makedirs(OUT, exist_ok=True)
FONTS = {  # id: (family folder, file, axis limits; None = pin to default)
 "inter": ("Inter", "Inter-VariableFont_opsz,wght.ttf", {"opsz": None, "wght": (400, 800)}),
 "dm-sans": ("DM Sans", "DMSans-VariableFont_opsz,wght.ttf", {"opsz": None, "wght": (400, 800)}),
 "figtree": ("Figtree", "Figtree-VariableFont_wght.ttf", {"wght": (400, 800)}),
 "montserrat": ("Montserrat", "Montserrat-VariableFont_wght.ttf", {"wght": (400, 800)}),
 "nunito": ("Nunito", "Nunito-VariableFont_wght.ttf", {"wght": (400, 800)}),
 "oswald": ("Oswald", "Oswald-VariableFont_wght.ttf", {"wght": (400, 700)}),
 "fraunces": ("Fraunces", "Fraunces-VariableFont_SOFT,WONK,opsz,wght.ttf", {"SOFT": None, "WONK": None, "opsz": None, "wght": (400, 800)}),
 "newsreader": ("Newsreader", "Newsreader-VariableFont_opsz,wght.ttf", {"opsz": None, "wght": (400, 700)}),
 "bitter": ("Bitter", "Bitter-VariableFont_wght.ttf", {"wght": (400, 800)}),
 "eb-garamond": ("EB Garamond", "EBGaramond-VariableFont_wght.ttf", {"wght": (400, 700)}),
}
UNI = "U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
for fid, (folder, fn, axes) in FONTS.items():
    f = TTFont(os.path.join(G, folder, fn))
    have = {a.axisTag: a for a in f["fvar"].axes}
    limits = {}
    for tag, lim in axes.items():
        if tag in have:
            limits[tag] = have[tag].defaultValue if lim is None else lim
    f = instancer.instantiateVariableFont(f, limits)
    import io; b = io.BytesIO(); f.save(b); b.seek(0); f = TTFont(b)
    opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "lnum", "pnum", "tnum"]
    opts.name_IDs = ["*"]; opts.notdef_outline = True
    s = subset.Subsetter(opts); s.populate(unicodes=subset.parse_unicodes(UNI)); s.subset(f)
    path = os.path.join(OUT, f"{fid}.woff2"); f.flavor = "woff2"; f.save(path)
    print(fid, os.path.getsize(path) // 1024, "KB")
