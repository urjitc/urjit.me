"""
Builds the favicon and the link-preview image from the site's own font, Jost, with the
letters as outlines so they look the same everywhere (no font needed to render them).

    python3 -I art/brand.py          # needs fontTools + brotli, and rsvg-convert

Writes public/favicon.svg, public/favicon.png (32px), public/apple-touch-icon.png (180px)
and public/og.png (1200 x 630): just the name, set like the page.
"""

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
RED = '#c90b1a'
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


def glyph_box(font, char):
    """The ink box of one glyph in font units: (xmin, ymin, xmax, ymax)."""
    glyph = font['glyf'][font.getBestCmap()[ord(char)]]
    glyph.recalcBounds(font['glyf'])
    return glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax


def render(svg, out, width, height):
    with tempfile.NamedTemporaryFile('w', suffix='.svg') as file:
        file.write(svg)
        file.flush()
        subprocess.run(['rsvg-convert', '-w', str(width), '-h', str(height), file.name, '-o', str(out)], check=True)


def main():
    # Favicon: a white U centred on red. A heavier cut than the page's so it holds at 16px.
    icon_font = jost(500)
    em = icon_font['head'].unitsPerEm
    size = 30
    x0, y0, x1, y1 = (v * size / em for v in glyph_box(icon_font, 'U'))
    path, _ = text_path(icon_font, 'U', size, 16 - (x0 + x1) / 2, 16 + (y0 + y1) / 2)
    icon = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Urjit">'
            f'<rect width="32" height="32" rx="6" fill="{RED}"/><path d="{path}" fill="#fff"/></svg>\n')
    (PUBLIC / 'favicon.svg').write_text(icon)
    render(icon, PUBLIC / 'favicon.png', 32, 32)
    # The home-screen icon is masked by iOS itself, so it gets square corners.
    render(icon.replace(' rx="6"', ''), PUBLIC / 'apple-touch-icon.png', 180, 180)

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
