"""
Draws the drumstick cursors (src/features/drum-kit/cursors/sticks-*.svg): a pair of slim
sticks seen from the player's seat, solid in the page's ink like the kit drawing: white for
the red and dark themes, black for light.

    python3 -I art/sticks.py

Poses: rest (both raised), left (left stick down) and right. The cursor's hotspot is HOT,
where a stick's tip lands.
"""

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'src' / 'features' / 'drum-kit' / 'cursors'
SIZE = 40
HOT = (20, 11)
INKS = {'white': '#fff', 'black': '#161616'}
# Half-widths along the shaft (fractions of the length): butt, shaft, taper, neck. The bead is
# an oval past the neck.
SHAFT = [(0, 1.7), (0.5, 1.5), (0.88, 0.6), (0.91, 0.6)]
BEAD = (0.945, 0.045, 1.05)  # centre, half-length (fractions of the length), half-width (px)


def half_width(t):
    """The shaft's half-width at fraction t of the stick's length, eased between stops."""
    for (a, ha), (b, hb) in zip(SHAFT, SHAFT[1:]):
        if t <= b:
            u = (t - a) / (b - a)
            return ha + (hb - ha) * u * u * (3 - 2 * u)
    return SHAFT[-1][1]


def stick(butt, tip, shorten=1.0):
    """One stick, butt to tip (shortened when raised, as it tilts toward the player)."""
    (bx, by), (tx, ty) = butt, tip
    tx, ty = bx + (tx - bx) * shorten, by + (ty - by) * shorten
    length = math.hypot(tx - bx, ty - by)
    ca, sa = (tx - bx) / length, (ty - by) / length
    place = lambda x, y: f'{bx + x * ca - y * sa:.2f},{by + x * sa + y * ca:.2f}'
    end = SHAFT[-1][0]
    xs = [length * end * i / 40 for i in range(41)]
    top = [place(x, -half_width(x / length)) for x in xs]
    bottom = [place(x, half_width(x / length)) for x in reversed(xs)]
    r = SHAFT[0][1]
    cap = [place(-r * math.sin(a), r * math.cos(a)) for a in (math.pi * i / 10 for i in range(1, 10))]
    shaft = f'<polygon points="{" ".join(top + bottom + cap)}"/>'
    centre, half, wide = BEAD
    cx, cy = place(centre * length, 0).split(',')
    angle = math.degrees(math.atan2(sa, ca))
    bead = f'<ellipse cx="{cx}" cy="{cy}" rx="{half * length:.2f}" ry="{wide}" transform="rotate({angle:.1f} {cx} {cy})"/>'
    return shaft + bead


POSES = {
    'rest': (stick((6, 36.2), (15.8, 6.5), 0.94), stick((34, 36.2), (24.2, 6.5), 0.94)),
    'left': (stick((7.5, 36.2), HOT), stick((34, 36.2), (25.5, 4.5), 0.92)),
    'right': (stick((6, 36.2), (14.5, 4.5), 0.92), stick((32.5, 36.2), HOT)),
}

for old in OUT.glob('sticks-*.svg'):
    old.unlink()
for name, (left, right) in POSES.items():
    for ink, colour in INKS.items():
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">'
               f'<g fill="{colour}" stroke="{colour}" stroke-width="0.6" stroke-linejoin="round">{left}{right}</g></svg>')
        (OUT / f'sticks-{name}-{ink}.svg').write_text(svg)
        print(f'sticks-{name}-{ink}.svg')
