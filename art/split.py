"""
Splits the drum-kit line art into one SVG per moving part plus a static base, so the
page can animate each part as its own compositor layer (no masks, no copies).

    python3 -I art/split.py          # needs numpy, Pillow and the potrace CLI

Reads art/drum-kit.png (the source drawing) and each .piece's geometry from index.html
(--x/--y/--rx/--ry/--angle/--depth, fractions of the drawing). Every pixel gets one owner:

  * Parts are painted back to front, later ones winning: cymbals, the (static) kick and its
    pedal's beater and footboard, then each drum's static hoop, rim and body (shell + lugs)
    and its moving head (the skin, inside the hoop).
  * Where a drum body covers a cymbal, the cymbal keeps the pixels on its own edge line
    (a tight band around its fit, which matches the drawn edge to about a pixel), so its
    edge moves whole while the drum's hoop lines, a few px away, stay with the drum.

Each part is then traced separately with potrace. Parts overlap by one pixel so they meet
seamlessly at rest. Writes src/features/drum-kit/art/*.svg and the <img> layers between the
kit-art markers in index.html, then checks the parts redraw the source (coverage test) and
saves art/split-check.png with each part in its own colour.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'art' / 'drum-kit.png'
HTML = ROOT / 'index.html'
OUT = ROOT / 'src' / 'features' / 'drum-kit' / 'art'

INK = 140  # grey level below which a pixel is ink (potrace's -k 0.55)
# How far each part's outermost hoop/edge line reaches beyond its fitted ellipse, in px of
# the source drawing (measured from the radial ink profile around each fit).
RIM = {'snare': 7, 'tom-left': 7, 'tom-right': 6, 'floor-tom': 6, 'kick': 5, 'hihat': 3, 'ride': 2}
# Only a drum's head (the skin, up to its innermost edge ring) moves; its hoop rings, rim
# and lugs stay put, like the real thing. Where each head's region ends, in px from the
# fit (the radial profile shows the innermost ring at about -4 px on the toms, -6 on the
# floor tom and -3 on the snare, with the hoop rings outside it).
HEAD = {'snare': -2, 'tom-left': -2.75, 'tom-right': -2.5, 'floor-tom': -3.5}
# The kick is all static: its drawn head isn't a true ellipse (the ring wanders a few px
# around it and other drums hide parts of it), and on a real kit you see the pedal move,
# not the bass drum head. Its hit is the beater and footboard.
STATIC_DRUMS = {'kick'}
# Lugs and hardware stick out past a drum's rim; its static body reaches this much further.
LUGS = 10
# Half-width of a cymbal's edge line around its fit (px). The fits sit within about 1 px
# of the drawn edge, and the nearest drum hoop line is 3 px out, so this stays clear of it.
EDGE = 1.5
# The pedal, as fractions of the drawing: the whole pedal (static), the beater (pivots at
# its hub, the box's bottom) and the footboard (pivots at its heel, the box's bottom).
PEDAL = (0.505, 0.478, 0.568, 0.76)
BEATER = (0.522, 0.478, 0.551, 0.548)
FOOTBOARD = (0.521, 0.5615, 0.555, 0.754)
POTRACE = ['-s', '-k', '0.55', '--turdsize', '15', '--alphamax', '1.0', '--opttolerance', '0.3', '--flat']


def pieces():
    """Each .piece's geometry from index.html, in DOM (back to front) order."""
    html = HTML.read_text()
    found = []
    for tag in re.findall(r'<(?:a|button)[^>]*class="piece[^"]*"[^>]*>', html):
        name = re.search(r'data-sound="([^"]+)"', tag).group(1)
        style = re.search(r'style="([^"]+)"', tag).group(1)
        vars_ = dict(
            (key.strip(), value.strip())
            for key, value in (part.split(':', 1) for part in style.split(';') if ':' in part)
        )
        number = lambda key, default=0.0: float(vars_.get(key, str(default)).replace('deg', '').replace('px', ''))
        found.append({
            'name': name,
            'cymbal': 'cymbal' in tag,
            'x': number('--x'), 'y': number('--y'), 'rx': number('--rx'), 'ry': number('--ry'),
            'angle': number('--angle'), 'depth': number('--depth'),
        })
    return found


def potrace(image):
    """Traces a greyscale image with the same settings as the whole drawing; returns SVG."""
    with tempfile.TemporaryDirectory() as tmp:
        pgm = Path(tmp) / 'image.pgm'
        Image.fromarray(image).save(pgm)
        return subprocess.run(['potrace', str(pgm), *POTRACE, '-o', '-'], check=True,
                              capture_output=True, text=True).stdout


def render(svg, w, h):
    """Rasterises traced SVG at w x h; returns where it draws ink."""
    with tempfile.TemporaryDirectory() as tmp:
        Path(tmp, 'image.svg').write_text(svg.replace('fill="#fff"', 'fill="#000"'))
        subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), '-b', 'white',
                        str(Path(tmp, 'image.svg')), '-o', str(Path(tmp, 'image.png'))], check=True)
        return np.array(Image.open(Path(tmp, 'image.png')).convert('L')) < INK


def trace(image, w, h):
    """Where a trace of the whole greyscale image draws ink."""
    return render(potrace(image), w, h)


def main():
    gray = np.array(Image.open(SOURCE).convert('L'))
    H, W = gray.shape
    ink = gray < INK
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)

    def ellipse_offset(p, cy_shift=0.0):
        """Signed px distance of every pixel outside the piece's fitted ellipse."""
        cx, cy = p['x'] * W, p['y'] * H + cy_shift
        a, b = p['rx'] * W, p['ry'] * H
        t = np.radians(p['angle'])
        u = (X - cx) * np.cos(t) + (Y - cy) * np.sin(t)
        v = -(X - cx) * np.sin(t) + (Y - cy) * np.cos(t)
        return (np.sqrt((u / a) ** 2 + (v / b) ** 2) - 1) * (a + b) / 2

    def box(b):
        x0, y0, x1, y1 = b
        return (X >= x0 * W) & (X < x1 * W) & (Y >= y0 * H) & (Y < y1 * H)

    BASE, STATIC = 0, -1
    parts = ['base']
    owner = np.zeros((H, W), np.int16)
    edges = {}   # cymbal part id -> pixels on its own edge line
    statics = {}  # static body id per drum, to know who covered what

    def part(name):
        parts.append(name)
        return len(parts) - 1

    def paint(mask, who):
        owner[mask] = who

    ps = pieces()
    # Back to front: cymbals first, then the kick, then the other drums in DOM order.
    order = [p for p in ps if p['cymbal']] + [p for p in ps if p['name'] == 'kick'] + \
            [p for p in ps if not p['cymbal'] and p['name'] != 'kick']
    for p in order:
        off = ellipse_offset(p)
        rim = RIM[p['name']]
        if p['name'] in STATIC_DRUMS:
            paint(off <= rim, STATIC)
            paint(box(PEDAL), STATIC)
            paint(box(BEATER), part('beater'))
            paint(box(FOOTBOARD), part('footboard'))
            continue
        who = part(p['name'])
        if not p['cymbal']:
            paint(off <= rim, STATIC)  # the hoop and rim are static
        if p['depth'] > 0:
            # Static body: the head plus lugs, the shell and the bottom rim.
            lug = rim + LUGS
            bottom = ellipse_offset(p, p['depth'] * H)
            cx, cy = p['x'] * W, p['y'] * H
            half = p['rx'] * W + lug
            shell = (np.abs(X - cx) <= half) & (Y >= cy) & (Y <= cy + p['depth'] * H)
            body = (off <= lug) | (bottom <= lug) | shell
            paint(body, STATIC)
            statics[who] = body
        head = off <= (rim if p['cymbal'] else HEAD[p['name']])
        paint(head, who)
        if p['cymbal']:
            edges[who] = np.abs(off - 0.5) <= EDGE

    # Cymbals keep their own edge line where a drum's static body covers it.
    for who, edge in edges.items():
        owner[edge & (owner == STATIC)] = who
    owner[owner == STATIC] = BASE

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.svg'):
        if not old.name.startswith('face-'):  # the kick's faces come from art/face.py
            old.unlink()
    layers = []
    rendered = np.zeros((H, W), bool)
    preview = np.full((H, W, 3), 255, np.uint8)
    colours = [(60, 60, 60), (220, 40, 40), (40, 160, 60), (40, 90, 220), (200, 140, 0),
               (150, 60, 200), (0, 170, 170), (230, 90, 160), (120, 120, 0), (0, 120, 120), (90, 40, 0)]
    for who, name in enumerate(parts):
        mine = owner == who
        # Overlap neighbours by one pixel so parts meet without a seam at rest.
        grown = mine.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            grown |= np.roll(np.roll(mine, dy, 0), dx, 1)
        rows, cols = np.nonzero(grown & ink)
        if not len(rows):
            sys.exit(f'part {name} owns no ink: check its geometry')
        y0, y1 = max(rows.min() - 4, 0), min(rows.max() + 5, H)
        x0, x1 = max(cols.min() - 4, 0), min(cols.max() + 5, W)
        crop = np.where(grown, gray, 255)[y0:y1, x0:x1].astype(np.uint8)
        svg = potrace(crop)
        w, h = x1 - x0, y1 - y0
        svg = re.sub(r'<\?xml.*?\?>\s*|<!DOCTYPE.*?>\s*|<metadata>.*?</metadata>\s*', '', svg, flags=re.S)
        svg = re.sub(r'width="[^"]*" height="[^"]*" viewBox="[^"]*"', f'viewBox="0 0 {w} {h}"', svg)
        svg = svg.replace('fill="#000000"', 'fill="#fff"')
        (OUT / f'{name}.svg').write_text(svg)

        # Render the traced part back to check coverage, and colour it for the preview.
        drawn = render(svg, w, h)
        rendered[y0:y1, x0:x1] |= drawn
        preview[y0:y1, x0:x1][drawn] = colours[who % len(colours)]

        layer = {'name': name, 'x0': x0 / W, 'y0': y0 / H, 'w': w / W, 'h': h / H}
        if name == 'beater' or name == 'footboard':
            b = BEATER if name == 'beater' else FOOTBOARD
            ox, oy = (b[0] + b[2]) / 2 * W, b[3] * H
        elif name != 'base':
            p = next(p for p in ps if p['name'] == name)
            ox, oy = p['x'] * W, p['y'] * H
        else:
            ox = oy = None
        if ox is not None:
            layer['ox'], layer['oy'] = (ox - x0) / w, (oy - y0) / h
        layers.append(layer)
        print(f'{name:10s} {w}x{h}px  {len(svg) / 1024:.1f} KB')

    # Coverage test: the parts together must draw what one trace of the whole drawing does
    # (tracing thins hairlines a little, so the raw pixels aren't a fair reference). Lines
    # may shift by up to a pixel between the two traces.
    whole = trace(gray, W, H)
    def grow(mask):
        out = mask.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
        return out
    gone = whole & ~grow(rendered)
    missing = gone.sum() / whole.sum()
    extra = (rendered & ~grow(whole)).sum() / whole.sum()
    preview[gone] = (255, 0, 0)  # anything the parts fail to draw shows up red
    Image.fromarray(preview).save(ROOT / 'art' / 'split-check.png')
    print(f'coverage: parts draw {100 * (1 - missing):.2f}% of the whole trace, {100 * extra:.2f}% extra')
    if missing > 0.005 or extra > 0.005:
        sys.exit('coverage test failed: the parts do not redraw the drawing')

    # The <img> layers, back to front, between the markers in index.html.
    def img(layer):
        style = f'--x0: {layer["x0"]:.5f}; --y0: {layer["y0"]:.5f}; --w: {layer["w"]:.5f}; --h: {layer["h"]:.5f}'
        if 'ox' in layer:
            style += f'; --ox: {layer["ox"]:.4f}; --oy: {layer["oy"]:.4f}'
        return (f'          <img class="part" data-part="{layer["name"]}" '
                f'src="/src/features/drum-kit/art/{layer["name"]}.svg" alt="" style="{style}" />')
    block = '\n'.join(img(layer) for layer in layers)
    html = HTML.read_text()
    html, n = re.subn(r'(<!-- kit-art:start -->).*?(\n\s*<!-- kit-art:end -->)',
                      lambda m: m.group(1) + '\n' + block + m.group(2), html, flags=re.S)
    if n != 1:
        sys.exit('index.html needs <!-- kit-art:start --> and <!-- kit-art:end --> markers')
    HTML.write_text(html)


if __name__ == '__main__':
    main()
