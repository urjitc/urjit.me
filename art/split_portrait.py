"""
Splits the portrait kit drawing (art/drum-kit-portrait.png), used on phones held upright,
into a static base plus one SVG per moving part, like art/split.py does for the wide kit.

    python3 -I art/split_portrait.py     # needs numpy, scipy, opencv, Pillow and potrace

The portrait pieces don't overlap, so no layering is needed: each drum head and cymbal is
found as the blank area its outline encloses (seeded at its centre), and that area, grown a
few px to take in its edge line, is what moves. Hoops, shells, stands and the kick stay put;
the pedal's beater and footboard swing. Writes src/features/drum-kit/art/p-*.svg and the
<img> layers between the kit-portrait-art markers in index.html, prints each piece's fitted
geometry for the hit areas, and checks the parts redraw the drawing (art/split-portrait-check.png).
"""

import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split import HTML, INK, OUT, ROOT, potrace, render  # noqa: E402

SOURCE = ROOT / 'art' / 'drum-kit-portrait.png'
# Each moving piece: a point inside its head (or on its cymbal, clear of the bell), and how
# far (px) its moving area reaches past that blank area, to take in the edge line(s) but not
# the hoop.
PIECES = {
    'hihat': ((203, 140), 7),  # two stacked cymbals: a double edge
    'ride': ((823, 120), 4),
    'tom-left': ((213, 577), 4),
    'tom-right': ((813, 548), 4),
    'snare': ((206, 848), 4),
    'floor-tom': ((781, 833), 4),
}
KICK = (486, 1146)
# The pedal's moving parts as px boxes (x0, y0, x1, y1): the beater pivots at its hub (the
# box's bottom), the footboard at its heel (the box's bottom).
BEATER = (470, 1228, 498, 1298)
FOOTBOARD = (460, 1300, 503, 1476)


def main():
    gray = np.array(Image.open(SOURCE).convert('L'))
    H, W = gray.shape
    ink = gray < INK
    blank = ~ndimage.binary_dilation(ink, iterations=2)
    regions, _ = ndimage.label(blank)

    def enclosed(point):
        """The blank area around `point`, as its filled convex hull, plus its fitted ellipse."""
        x, y = point
        area = regions == regions[y, x]
        ys, xs = np.nonzero(area)
        hull = cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32))
        mask = np.zeros((H, W), np.uint8)
        cv2.fillConvexPoly(mask, hull, 1)
        return mask.astype(bool), cv2.fitEllipse(hull)

    owner = np.zeros((H, W), np.int16)  # 0: the static base
    parts = ['base']
    geometry = {}
    for name, (point, grow) in PIECES.items():
        area, ellipse = enclosed(point)
        parts.append(name)
        owner[ndimage.binary_dilation(area, iterations=grow)] = len(parts) - 1
        geometry[name] = ellipse
    geometry['kick'] = enclosed(KICK)[1]
    for name, (x0, y0, x1, y1) in (('beater', BEATER), ('footboard', FOOTBOARD)):
        parts.append(name)
        owner[y0:y1, x0:x1] = len(parts) - 1

    layers, rendered = [], np.zeros((H, W), bool)
    for prefix in ('p-',):
        for old in OUT.glob(f'{prefix}*.svg'):
            old.unlink()
    for who, name in enumerate(parts):
        mine = owner == who
        grown = ndimage.binary_dilation(mine)  # overlap neighbours by a pixel: no seams
        rows, cols = np.nonzero(grown & ink)
        if not len(rows):
            sys.exit(f'part {name} owns no ink: check its seed point')
        y0, y1 = max(rows.min() - 4, 0), min(rows.max() + 5, H)
        x0, x1 = max(cols.min() - 4, 0), min(cols.max() + 5, W)
        crop = np.where(grown, gray, 255)[y0:y1, x0:x1].astype(np.uint8)
        svg = potrace(crop)
        w, h = x1 - x0, y1 - y0
        svg = re.sub(r'<\?xml.*?\?>\s*|<!DOCTYPE.*?>\s*|<metadata>.*?</metadata>\s*', '', svg, flags=re.S)
        svg = re.sub(r'width="[^"]*" height="[^"]*" viewBox="[^"]*"', f'viewBox="0 0 {w} {h}"', svg)
        svg = svg.replace('fill="#000000"', 'fill="#fff"')
        (OUT / f'p-{name}.svg').write_text(svg)
        rendered[y0:y1, x0:x1] |= render(svg, w, h)
        if name in ('beater', 'footboard'):
            bx0, _, bx1, by1 = BEATER if name == 'beater' else FOOTBOARD
            pivot = ((bx0 + bx1) / 2, by1)
        elif name != 'base':
            pivot = geometry[name][0]
        else:
            pivot = None
        layers.append((name, x0, y0, w, h, pivot))
        print(f'p-{name:10s} {w}x{h}px  {len(svg) / 1024:.1f} KB')

    whole = render(potrace(gray), W, H)
    missing = (whole & ~ndimage.binary_dilation(rendered)).sum() / whole.sum()
    preview = np.stack([np.where(rendered, 0, 255)] * 3, -1).astype(np.uint8)
    preview[whole & ~ndimage.binary_dilation(rendered)] = (255, 0, 0)
    for who in range(1, len(parts)):
        preview[(owner == who) & rendered] = [(220, 40, 40), (40, 160, 60), (40, 90, 220), (200, 140, 0),
                                              (150, 60, 200), (0, 170, 170), (230, 90, 160), (120, 120, 0)][who % 8]
    Image.fromarray(preview).save(ROOT / 'art' / 'split-portrait-check.png')
    print(f'coverage: parts draw {100 * (1 - missing):.2f}% of the whole trace')
    if missing > 0.005:
        sys.exit('coverage test failed: the parts do not redraw the drawing')

    def img(name, x0, y0, w, h, pivot):
        style = f'--x0: {x0 / W:.5f}; --y0: {y0 / H:.5f}; --w: {w / W:.5f}; --h: {h / H:.5f}'
        if pivot:
            style += f'; --ox: {(pivot[0] - x0) / w:.4f}; --oy: {(pivot[1] - y0) / h:.4f}'
        return (f'          <img class="part" data-layout="portrait" data-part="{name}" '
                f'src="/src/features/drum-kit/art/p-{name}.svg" alt="" style="{style}" />')

    html = HTML.read_text()
    block = '\n'.join(img(*layer) for layer in layers)
    html, count = re.subn(r'(<!-- kit-portrait-art:start -->\n).*?([ \t]*<!-- kit-portrait-art:end -->)',
                          lambda m: m.group(1) + block + '\n' + m.group(2), html, flags=re.S)
    if count != 1:
        sys.exit('kit-portrait-art markers not found in index.html')
    HTML.write_text(html)

    # Hit areas: each piece's fitted ellipse, as fractions of the portrait drawing.
    for name, ((cx, cy), (a, b), angle) in geometry.items():
        print(f'{name}: --px: {cx / W:.4f}; --py: {cy / H:.4f}; --prx: {a / 2 / W:.4f}; --pry: {b / 2 / H:.4f}')


if __name__ == '__main__':
    main()
