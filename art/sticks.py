"""
Draws the drumstick cursors (src/features/drum-kit/cursors/sticks-*.svg): a pair of sticks
seen from the player's seat, in the kit drawing's style, hairline white ink over red, so they
read the same on every theme (the red fill carries them on light and dark pages).

    python3 -I art/sticks.py

Poses: rest (both raised), left (left stick down) and right. The cursor's hotspot is HOT,
where a stick's tip lands.
"""

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'src' / 'features' / 'drum-kit' / 'cursors'
SIZE = 40
HOT = (20, 11)
RED, INK, LINE = '#c90b1a', '#fff', 1.1
# The red rim around the white ink: lost on the red page, it outlines the sticks on light ones.
RIM = 2.8
# Half-widths along the shaft (fractions of the length): butt, shaft, taper, neck. The bead is
# an oval past the neck, drawn over it so its outline marks where it starts.
SHAFT = [(0, 2.5), (0.6, 2.2), (0.85, 0.95), (0.9, 0.95)]
BEAD = (0.945, 0.07, 1.6)  # centre, half-length (fractions of the length), half-width (px)


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

for name, (left, right) in POSES.items():
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">'
           f'<g fill="none" stroke="{RED}" stroke-width="{RIM}" stroke-linejoin="round">{left}{right}</g>'
           f'<g fill="{RED}" stroke="{INK}" stroke-width="{LINE}" stroke-linejoin="round">{left}{right}</g></svg>')
    (OUT / f'sticks-{name}.svg').write_text(svg)
    print(f'sticks-{name}.svg')
