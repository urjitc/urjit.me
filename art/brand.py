"""
Builds the favicon and the link-preview image, both the U from my signature (the first stroke
of src/features/signature/signature.json) in white on red.

    python3 -I art/brand.py          # needs rsvg-convert

Writes public/favicon.svg, public/favicon.png (32px), public/apple-touch-icon.png (180px)
and public/og.png (1200 x 630).
"""

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
RED = '#b3192a'
SIGNATURE = ROOT / 'src/features/signature/signature.json'


def signature_u(height, cx, cy):
    """The signature's first stroke (its U) as smooth path data, `height` tall, centred on (cx, cy)."""
    points = json.loads(SIGNATURE.read_text())['strokes'][0]
    # The pen wobbles a few px as it lands; start where it leaves that, so the big preview
    # doesn't show a little hook at the top.
    x0, y0, _ = points[0]
    settled = max(i for i, (x, y, _) in enumerate(points) if (x - x0) ** 2 + (y - y0) ** 2 < 16)
    points = points[settled:]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    scale = height / (max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    pts = [(cx + (x - mx) * scale, cy + (y - my) * scale) for x, y, _ in points]
    # Quadratic curves between midpoints, as the site draws the signature.
    d = f'M{pts[0][0]:.2f} {pts[0][1]:.2f}'
    for (x, y), (nx, ny) in zip(pts[1:-1], pts[2:]):
        d += f'Q{x:.2f} {y:.2f} {(x + nx) / 2:.2f} {(y + ny) / 2:.2f}'
    return d + f'L{pts[-1][0]:.2f} {pts[-1][1]:.2f}'


def stroke(d, width):
    return (f'<path d="{d}" fill="none" stroke="#fff" stroke-width="{width}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


def render(svg, out, width, height):
    with tempfile.NamedTemporaryFile('w', suffix='.svg') as file:
        file.write(svg)
        file.flush()
        subprocess.run(['rsvg-convert', '-w', str(width), '-h', str(height), file.name, '-o', str(out)], check=True)


def main():
    # Favicon: the U 20 of its 32 units tall, with a line heavy enough to hold at 16px.
    icon = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Urjit">'
            f'<rect width="32" height="32" rx="7" fill="{RED}"/>{stroke(signature_u(20, 16, 16), 2.2)}</svg>\n')
    (PUBLIC / 'favicon.svg').write_text(icon)
    render(icon, PUBLIC / 'favicon.png', 32, 32)
    # The home-screen icon is masked by iOS itself, so it gets square corners.
    render(icon.replace(' rx="7"', ''), PUBLIC / 'apple-touch-icon.png', 180, 180)

    # Link preview: the U alone, centred, in a finer pen line than the small icon needs.
    og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">'
          f'<rect width="1200" height="630" fill="{RED}"/>{stroke(signature_u(250, 600, 315), 14)}</svg>\n')
    render(og, PUBLIC / 'og.png', 1200, 630)


if __name__ == '__main__':
    main()
