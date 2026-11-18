"""Draws the NordgrenLabs Games icon: a white die on navy, three pips on the diagonal, the middle one cyan.

Chosen by the owner on 2026-11-18 (option C). Deterministic; needs only Pillow. Run from the repo root:
    python brand/make_icon.py
It writes brand/games-icon-1024.png, the master every other size is made from.
"""
from pathlib import Path
from PIL import Image, ImageDraw

K = 4  # draw at 4x and downsample, so edges come out smooth
NAVY, WHITE, CYAN = (16, 24, 43), (248, 250, 252), (34, 211, 238)


def draw(size=1024):
    n = 1024 * K
    u = lambda v: int(round(v * K))
    im = Image.new('RGB', (n, n), NAVY)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([u(262), u(262), u(762), u(762)], radius=u(120), fill=WHITE)
    for x, y, colour in [(392, 392, NAVY), (512, 512, CYAN), (632, 632, NAVY)]:
        d.ellipse([u(x - 50), u(y - 50), u(x + 50), u(y + 50)], fill=colour)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    out = Path(__file__).with_name('games-icon-1024.png')
    draw().save(out, optimize=True)
    print('wrote', out)
