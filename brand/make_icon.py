"""Draws the NordgrenLabs Games icon: a white die on navy, three pips on the diagonal, the middle one cyan.

Chosen by the owner on 2026-11-18 (option C). Deterministic; needs only Pillow. Run from the repo root:
    python brand/make_icon.py
brand/games-icon-1024.png is the master; it is drawn only if missing and its bytes are pinned by sha256. Every published
size (site/icons/, site/apple-touch-icon.png, site/favicon.ico) is made from it, and the SVG favicon is drawn from the
same geometry. The die's farthest point is 304 of 1024 from the centre, inside the 410 of a maskable icon's safe circle,
so the 512 doubles as the maskable icon with no extra padding.
"""
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw

MASTER_SHA256 = '73313610a529fb4387aa03638d724b67bda6e0952d2b6b15278ef4d7b2a69091'
K = 4  # draw at 4x and downsample, so edges come out smooth
NAVY, WHITE, CYAN = (16, 24, 43), (248, 250, 252), (34, 211, 238)
DIE = (262, 762, 120)  # die from (262, 262) to (762, 762) on the 1024 canvas, corner radius 120
PIPS = [(392, 392, NAVY), (512, 512, CYAN), (632, 632, NAVY)]
PIP_R = 50
# Under site/icons/, plus the two root files browsers ask for on their own, so a page without the tags still gets the icon.
PNGS = {'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'apple-touch-icon.png': 180}


def draw(size=1024):
    n = 1024 * K
    u = lambda v: int(round(v * K))
    im = Image.new('RGB', (n, n), NAVY)
    d = ImageDraw.Draw(im)
    a, b, r = DIE
    d.rounded_rectangle([u(a), u(a), u(b), u(b)], radius=u(r), fill=WHITE)
    for x, y, colour in PIPS:
        d.ellipse([u(x - PIP_R), u(y - PIP_R), u(x + PIP_R), u(y + PIP_R)], fill=colour)
    return im.resize((size, size), Image.LANCZOS)


def svg():
    hexa = lambda c: '#%02x%02x%02x' % c
    a, b, r = DIE
    pips = ''.join(f'<circle cx="{x}" cy="{y}" r="{PIP_R}" fill="{hexa(c)}"/>' for x, y, c in PIPS)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="{hexa(NAVY)}"/>'
            f'<rect x="{a}" y="{a}" width="{b - a}" height="{b - a}" rx="{r}" fill="{hexa(WHITE)}"/>{pips}</svg>\n')


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    master = here / 'games-icon-1024.png'
    if not master.exists():
        draw().save(master, optimize=True)
    assert hashlib.sha256(master.read_bytes()).hexdigest() == MASTER_SHA256, 'the pinned 1024 master changed'
    site = here.parent / 'site'
    (site / 'icons').mkdir(exist_ok=True)
    with Image.open(master) as im:
        for name, size in PNGS.items():
            im.resize((size, size), Image.LANCZOS).save(site / name, optimize=True)
        im.save(site / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    (site / 'icons' / 'favicon.svg').write_text(svg(), encoding='utf-8', newline='\n')
    print('wrote the icons into', site)
