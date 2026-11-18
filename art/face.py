"""
Puts the face line drawings (art/face/*.png) on the kick drum's head.

    python3 -I art/face.py           # after art/split.py; needs numpy, scipy, Pillow, potrace

The faces are AI edits of one drawing, so their hair and outlines drift a little. To keep
them identical, the build splits them into layers:

  * face-base: everything from the neutral face except its features (hair, head outline,
    ears, neck, t-shirt). Always shown.
  * face-<expression>: only that face's features (eyes, brows, nose, mouth, inside FEATURES),
    plus any marks it adds in the white space around the head (stars, impact lines).
    Reactions are aligned to the neutral face first. On a hit they crossfade.

Each layer is scaled into the kick head, thickened to the drum's line weight, masked to the
head's visible blank area (a flood fill of the drawing from the head's centre, so the beater,
pedal and snare in front cut it off exactly) and traced like the drum parts. Writes
src/features/drum-kit/art/face-*.svg and their <img> layers between the kick-face markers in
index.html, plus art/face-check.png.
"""

import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split import HTML, INK, OUT, ROOT, SOURCE, potrace  # noqa: E402

# neutral first: the face at rest. laugh is kept for the ba-dum-tss easter egg.
FACES = ['neutral', 'wince', 'dazed', 'shock', 'anime', 'ko', 'steam', 'deverror', 'ascended',
         'ghost', 'bonk', 'ringing', 'unimpressed', 'laugh']
SIZE = 1024  # the face images' side
# Room above the hair (face-image px) for marks some reactions draw there (a halo, a ghost);
# the face layer's box grows upward by this much. Inside the kick head the ring still clips.
PAD = 192
FACE_INK = 160
# The features region in the face images (px): inside the face outline, below the hair.
FEATURES = [(358, 288), (678, 288), (680, 470), (652, 560), (612, 625),
            (420, 625), (378, 560), (355, 470)]
CHIN_Y = 675  # where the chin is in the face images; the face squashes around it
# Where the face's square sits on the drawing, in px: its centre x, top y and side. The chin
# lands on the beater's head at rest, so the beater swings into the face.
CENTRE_X, TOP, SIDE = 830, 357, 208
SCALE = 4  # trace at 4x the drawing's resolution so thin lines stay smooth
# Thicken lines (max filter size, at SCALE) so they match the drum's ~2 px strokes.
THICKEN = 3
# Keep the face this far (px) from any line of the drawing around it.
MARGIN = 4


def visible_head(gray):
    """The kick head's blank area: everything reachable from its centre without crossing ink."""
    ink = Image.fromarray(np.where(gray < INK, 255, 0).astype(np.uint8))
    walls = np.array(ink.filter(ImageFilter.MaxFilter(2 * MARGIN + 1))) > 0
    H, W = walls.shape
    seen = np.zeros_like(walls)
    start = (400, CENTRE_X)
    queue = deque([start])
    seen[start] = True
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < H and 0 <= nx < W and not seen[ny, nx] and not walls[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    if seen.sum() > 0.1 * H * W:
        sys.exit('the flood fill leaked out of the kick head: a gap in its ring?')
    return seen


def load(name):
    """A face image's ink, with PAD blank rows above it."""
    ink = np.array(Image.open(ROOT / 'art' / 'face' / f'{name}.png').convert('L')) < FACE_INK
    return np.pad(ink, ((PAD, 0), (0, 0)))


def shift(image, dy, dx):
    """Moves an image by whole pixels, filling with blank (no wrap-around)."""
    out = np.zeros_like(image)
    h, w = image.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = \
        image[max(-dy, 0):h - max(dy, 0), max(-dx, 0):w - max(dx, 0)]
    return out


def align(moving, fixed, features):
    """
    Shifts `moving` by the whole-pixel offset that best lines its head up with `fixed`'s:
    matched on the hair's lower half, ears, jaw and neck (not the features, which differ, nor
    the top of the hair, where marks like a halo or ghost sit).
    """
    band = slice(PAD + 120, PAD + 800)
    keep = ~features[band]
    a = np.fft.fft2((fixed[band] & keep).astype(float))
    b = np.fft.fft2((moving[band] & keep).astype(float))
    corr = np.fft.ifft2(a * np.conj(b))
    dy, dx = np.unravel_index(np.argmax(np.abs(corr)), corr.shape)
    h, w = corr.shape
    dy, dx = int(dy - h if dy > h // 2 else dy), int(dx - w if dx > w // 2 else dx)
    return shift(moving, dy, dx), (dy, dx)


def main():
    gray = np.array(Image.open(SOURCE).convert('L'))
    H, W = gray.shape
    # The layer's box: SIDE wide, and taller by PAD's share so its top clears the hair.
    tall = SIDE * (SIZE + PAD) // SIZE
    x0, y0 = CENTRE_X - SIDE // 2, TOP - (tall - SIDE)
    big_w, big_h = SIDE * SCALE, tall * SCALE
    head = visible_head(gray)[y0:y0 + tall, x0:x0 + SIDE]
    mask = np.array(Image.fromarray(head).resize((big_w, big_h), Image.NEAREST))

    region_image = Image.new('1', (SIZE, SIZE + PAD))
    ImageDraw.Draw(region_image).polygon([(x, y + PAD) for x, y in FEATURES], fill=1)
    features = np.array(region_image)
    neutral = load('neutral')
    # The neutral head's silhouette: what a reaction draws outside it is kept as extras
    # (pixel by pixel, so a ghost or spinner touching the hair survives).
    silhouette = ndimage.binary_fill_holes(ndimage.binary_closing(neutral, iterations=12))
    silhouette = ndimage.binary_dilation(silhouette, iterations=10)

    above_chin = np.zeros_like(neutral)
    above_chin[:PAD + CHIN_Y] = True
    # Each layer: lines clipped to the kick head's visible area, and extras (marks around the
    # head, like a halo or BONK) that float over the drum, clipped only to the layer's box.
    blank = np.zeros_like(neutral)
    layers = {'base': (neutral & ~features, blank)}
    for name in FACES:
        ink = neutral if name == 'neutral' else load(name)
        if name != 'neutral':
            ink, shift = align(ink, neutral, features)
            print(f'{name}: shifted {shift} to match the neutral hair')
        # Only above the chin: below it, the shirt lines of a shifted face would show double.
        extras = ink & ~silhouette & above_chin if name != 'neutral' else blank
        layers[name] = (ink & features, extras)

    check = np.stack([np.where(gray < INK, 0, 255)] * 3, -1).astype(np.uint8)
    def draw(ink):
        scaled = Image.fromarray(ink).convert('L').resize((big_w, big_h), Image.LANCZOS)
        return np.array(scaled.filter(ImageFilter.MaxFilter(THICKEN))) > 60

    for name, (lines, extras) in layers.items():
        drawn = (draw(lines) & mask) | draw(extras)
        svg = potrace(np.where(drawn, 0, 255).astype(np.uint8))
        svg = re.sub(r'<\?xml.*?\?>\s*|<!DOCTYPE.*?>\s*|<metadata>.*?</metadata>\s*', '', svg, flags=re.S)
        svg = re.sub(r'width="[^"]*" height="[^"]*" viewBox="[^"]*"', f'viewBox="0 0 {big_w} {big_h}"', svg)
        svg = svg.replace('fill="#000000"', 'fill="#fff"')
        (OUT / f'face-{name}.svg').write_text(svg)
        print(f'face-{name}  {len(svg) / 1024:.1f} KB')
        if name in ('base', 'neutral'):
            small = np.array(Image.fromarray(drawn).resize((SIDE, tall), Image.BOX)) > 0
            check[y0:y0 + tall, x0:x0 + SIDE][small] = (200, 20, 30)
    Image.fromarray(check).save(ROOT / 'art' / 'face-check.png')

    style = (f'--x0: {x0 / W:.5f}; --y0: {y0 / H:.5f}; --w: {SIDE / W:.5f}; --h: {tall / H:.5f}; '
             f'--ox: 0.5; --oy: {(CHIN_Y + PAD) / (SIZE + PAD):.3f}')
    block = '\n'.join(
        f'          <img class="part face" data-face="{name}" src="/src/features/drum-kit/art/face-{name}.svg" '
        f'alt="" style="{style}" />' for name in layers)
    html = HTML.read_text()
    html, count = re.subn(r'(<!-- kick-face:start -->\n).*?([ \t]*<!-- kick-face:end -->)',
                          lambda m: m.group(1) + block + '\n' + m.group(2), html, flags=re.S)
    if count != 1:
        sys.exit('kick-face markers not found in index.html')
    HTML.write_text(html)


if __name__ == '__main__':
    main()
