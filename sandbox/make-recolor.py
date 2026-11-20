"""
make-recolor.py: turns every RED in the site's look into PURPLE, for the neon preview only.

It reads the stylesheets the homepage loads, finds every rule that uses a red colour, and writes the same rule
again into sandbox/neon-recolor.css with the red swapped for purple (the violet of the neon floor, hue 270).
Each colour keeps its own brightness and strength, so dark red becomes dark purple and light red becomes light purple.
It also fixes the reds written straight into sandbox/neon-home.html.

The real site is never changed: only the neon preview loads neon-recolor.css.
Run it again after changing the site's styles:   platform\\.venv\\Scripts\\python sandbox\\make-recolor.py
"""

import colorsys
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "sandbox" / "neon-home.html"
OUT = ROOT / "sandbox" / "neon-recolor.css"
PURPLE_HUE = 270 / 360          # the violet in the neon artwork

COLOR = re.compile(r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)")


def to_purple(match):
    """If this colour is a red, return the purple version (same format); otherwise return it unchanged."""
    text = match.group(0)
    if text.startswith("#"):
        h = text[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        alpha = h[6:8] if len(h) == 8 else ""
    else:
        nums = re.findall(r"[\d.]+%?", text)
        if len(nums) < 3 or any(n.endswith("%") for n in nums[:3]):
            return text
        r, g, b = (float(n) for n in nums[:3])
        alpha = nums[3] if len(nums) > 3 else None
    hue, light, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    is_red = sat >= 0.35 and 0.03 < light < 0.97 and (hue <= 20 / 360 or hue >= 340 / 360)
    if not is_red:
        return text
    nr, ng, nb = (round(v * 255) for v in colorsys.hls_to_rgb(PURPLE_HUE, light, sat))
    if text.startswith("#"):
        return f"#{nr:02x}{ng:02x}{nb:02x}{alpha}"
    return f"rgba({nr}, {ng}, {nb}, {alpha})" if alpha is not None else f"rgb({nr}, {ng}, {nb})"


def recolor(text):
    return COLOR.sub(to_purple, text)


def split_top(text, sep):
    """Split on sep, but not inside brackets or quotes (so url(data:...;...) and :not(a, b) stay whole)."""
    parts, depth, quote, start = [], 0, None, 0
    for i, ch in enumerate(text):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == sep and depth == 0:
            parts.append(text[start:i])
            start = i + 1
    parts.append(text[start:])
    return parts


def scope(selector_list):
    """Put html.neon in front of every selector, so these rules only apply on the neon page and win over the originals."""
    out = []
    for sel in split_top(selector_list, ","):
        sel = sel.strip()
        if not sel:
            continue
        if sel.startswith("html"):
            sel = "html.neon" + sel[4:]
        elif sel.startswith(":root"):
            sel = ":root.neon" + sel[5:]
        else:
            sel = "html.neon " + sel
        out.append(sel)
    return ", ".join(out)


def blocks(css):
    """Yield (prelude, body) for each top-level { } block."""
    i, n = 0, len(css)
    while i < n:
        open_at = css.find("{", i)
        if open_at == -1:
            return
        depth, j = 1, open_at + 1
        while j < n and depth:
            depth += {"{": 1, "}": -1}.get(css[j], 0)
            j += 1
        yield css[i:open_at].strip(), css[open_at + 1:j - 1]
        i = j


def process(css):
    out = []
    for prelude, body in blocks(css):
        prelude = prelude.split(";")[-1].strip()          # skip any @import/@charset lines before the block
        if prelude.startswith(("@media", "@supports", "@layer", "@container")):
            inner = process(body)
            if inner:
                out.append(f"{prelude} {{\n{inner}}}\n")
        elif prelude.startswith(("@keyframes", "@-webkit-keyframes")):
            if recolor(body) != body:                       # a keyframes block is replaced whole, so copy all of it
                out.append(f"{prelude} {{{recolor(body)}}}\n")
        elif prelude.startswith("@"):
            continue                                        # @font-face and friends: nothing to recolour
        else:
            changed = [recolor(d).strip() for d in split_top(body, ";") if recolor(d) != d]
            if changed:
                out.append(f"{scope(prelude)} {{ {'; '.join(changed)}; }}\n")
    return "".join(out)


def main():
    html = PAGE.read_text(encoding="utf-8")
    sheets = re.findall(r'<link rel="stylesheet" href="([^"?]+)', html)
    result = ["/* Made by make-recolor.py: every red in the site's styles, as purple. Don't edit by hand; run the script. */\n"]
    for href in sheets:
        if href.startswith("sandbox/"):
            continue
        css = re.sub(r"/\*.*?\*/", "", (ROOT / href).read_text(encoding="utf-8"), flags=re.S)
        part = process(css)
        if part:
            result.append(f"\n/* ---- from {href} ---- */\n{part}")
    OUT.write_text("".join(result), encoding="utf-8")

    # The page itself: inline colours (e.g. the parallax overlays) and the browser's theme colour.
    new_html = re.sub(r'(style="[^"]*"|content="#[0-9a-fA-F]{6}")', lambda m: recolor(m.group(0)), html)
    if 'href="sandbox/neon-recolor.css"' not in new_html:
        new_html = new_html.replace('  <link rel="stylesheet" href="sandbox/neon-theme.css">',
                                    '  <link rel="stylesheet" href="sandbox/neon-recolor.css">\n  <link rel="stylesheet" href="sandbox/neon-theme.css">')
    PAGE.write_text(new_html, encoding="utf-8")
    print(f"Wrote {OUT.name}: {sum(r.count('{') for r in result)} recoloured blocks.")


if __name__ == "__main__":
    main()
