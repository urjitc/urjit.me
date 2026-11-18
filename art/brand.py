"""
Builds the favicon and the link-preview image. The favicon is the U from my signature (the
first stroke of src/features/signature/signature.json) in white on red; the preview sets the
name in the site's own font, Jost, as outlines so it looks the same everywhere.

    python3 -I art/brand.py          # needs fontTools + brotli, and rsvg-convert

Writes public/favicon.svg, public/favicon.png (32px), public/apple-touch-icon.png (180px)
and public/og.png (1200 x 630): just the name, set like the page.
"""

import json
import subprocess
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
FONT = ROOT / 'node_modules/@fontsource-variable/jost/files/jost-latin-wght-normal.woff2'
RED = '#b3192a'
SIGNATURE = ROOT / 'src/features/signature/signature.json'
NAME = 'Urjit Chakraborty'


def jost(weight):
    font = TTFont(FONT)
    return instantiateVariableFont(font, {'wght': weight})


def text_path(font, text, size, x, y, tracking=0.0):
    """SVG path data for `text` set at `size` px with its baseline starting at (x, y)."""
    scale = size / font['head'].unitsPerEm
    cmap, glyphs, hmtx = font.getBestCmap(), font.getGlyphSet(), font['hmtx']
    pen = SVGPathPen(glyphs)
    for char in text:
        name = cmap[ord(char)]
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
        x += hmtx[name][0] * scale + tracking * size
    return pen.getCommands(), x


def signature_u(height):
    """The signature's first stroke (its U) as smooth path data, `height` tall, centred in 32."""
    points = json.loads(SIGNATURE.read_text())['strokes'][0]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    scale = height / (max(ys) - min(ys))
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    pts = [(16 + (x - cx) * scale, 16 + (y - cy) * scale) for x, y, _ in points]
    # Quadratic curves between midpoints, as the site draws the signature.
    d = f'M{pts[0][0]:.2f} {pts[0][1]:.2f}'
    for (x, y), (nx, ny) in zip(pts[1:-1], pts[2:]):
        d += f'Q{x:.2f} {y:.2f} {(x + nx) / 2:.2f} {(y + ny) / 2:.2f}'
    return d + f'L{pts[-1][0]:.2f} {pts[-1][1]:.2f}'


def render(svg, out, width, height):
    with tempfile.NamedTemporaryFile('w', suffix='.svg') as file:
        file.write(svg)
        file.flush()
        subprocess.run(['rsvg-convert', '-w', str(width), '-h', str(height), file.name, '-o', str(out)], check=True)


def main():
    # Favicon: my signature's U, white on red, 20 of its 32 units tall, with a line heavy
    # enough to hold at 16px.
    icon = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Urjit">'
            f'<rect width="32" height="32" rx="7" fill="{RED}"/>'
            f'<path d="{signature_u(20)}" fill="none" stroke="#fff" stroke-width="2.2" '
            f'stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
    (PUBLIC / 'favicon.svg').write_text(icon)
    render(icon, PUBLIC / 'favicon.png', 32, 32)
    # The home-screen icon is masked by iOS itself, so it gets square corners.
    render(icon.replace(' rx="7"', ''), PUBLIC / 'apple-touch-icon.png', 180, 180)

    # Link preview: the name alone, centred, in the page's light Jost, white on red.
    font = jost(300)
    size = 104
    _, width = text_path(font, NAME, size, 0, 0, tracking=-0.01)
    cap = font['OS/2'].sCapHeight * size / font['head'].unitsPerEm
    name, _ = text_path(font, NAME, size, (1200 - width) / 2, (630 + cap) / 2, tracking=-0.01)
    og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">'
          f'<rect width="1200" height="630" fill="{RED}"/><path d="{name}" fill="#fff"/></svg>\n')
    render(og, PUBLIC / 'og.png', 1200, 630)


if __name__ == '__main__':
    main()
