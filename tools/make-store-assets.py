#!/usr/bin/env python3
"""Generate Chrome Web Store graphic assets.

Store icon, small + marquee promo tiles, and screenshots sized to spec.
Everything except the icon is flattened to 24-bit RGB: the store rejects alpha
on screenshots and tiles.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

OUT = 'store'
CACHE = '/Users/erez/.claude/image-cache/93357147-5a8c-4b94-bb62-5cc0701e858f'

INK    = (20, 37, 47)
MUTED  = (93, 113, 128)
ACCENT = (11, 122, 150)
PAPER  = (255, 255, 255)
SOFT   = (238, 245, 247)
RULE   = (220, 228, 232)

FONTS = ['/System/Library/Fonts/Supplemental/Arial {w}.ttf',
         '/System/Library/Fonts/Supplemental/Arial.ttf']

def font(size, bold=False):
    cands = []
    if bold:
        cands += ['/System/Library/Fonts/Supplemental/Arial Bold.ttf']
    cands += ['/System/Library/Fonts/Supplemental/Arial.ttf',
              '/System/Library/Fonts/Helvetica.ttc']
    for p in cands:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()

def save(im, name, alpha=False):
    if not alpha:
        bg = Image.new('RGB', im.size, PAPER)
        bg.paste(im, (0, 0), im if im.mode == 'RGBA' else None)
        im = bg
    path = os.path.join(OUT, name)
    im.save(path)
    print(f'  {name:<34} {im.size[0]}x{im.size[1]}  {im.mode}')

# ----------------------------------------------------------------- the mark
def mark(size, bg=ACCENT, fg=PAPER, radius_ratio=0.22):
    """The download-arrow tile used as the icon."""
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * radius_ratio), fill=bg)
    cx = S / 2
    d.rectangle((cx - S * .085, S * .20, cx + S * .085, S * .52), fill=fg)
    d.polygon([(cx - S * .23, S * .46), (cx + S * .23, S * .46), (cx, S * .70)], fill=fg)
    d.rounded_rectangle((S * .22, S * .755, S * .78, S * .835), radius=int(S * .02), fill=fg)
    return im.resize((size, size), Image.LANCZOS)

# ------------------------------------------------------- order-row -> sheet
def order_rows(d, x, y, w, rows=3, rh=54, gap=12):
    """Stacked order lines: thumbnail, two text bars, a price bar."""
    for i in range(rows):
        top = y + i * (rh + gap)
        d.rounded_rectangle((x, top, x + w, top + rh), radius=10, fill=PAPER, outline=RULE, width=2)
        d.rounded_rectangle((x + 12, top + 10, x + 12 + rh - 20, top + rh - 10), radius=7, fill=SOFT)
        d.rounded_rectangle((x + 60, top + 15, x + w * .62, top + 24), radius=5, fill=(214, 222, 227))
        d.rounded_rectangle((x + 60, top + 32, x + w * .44, top + 39), radius=4, fill=(232, 238, 241))
        d.rounded_rectangle((x + w - 86, top + 20, x + w - 16, top + 32), radius=6, fill=(166, 202, 213))

def sheet(d, x, y, w, h, cols=4, rows=6):
    """A spreadsheet grid, header row picked out in the accent."""
    d.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=PAPER, outline=RULE, width=2)
    hh = h / (rows + 1)
    d.rectangle((x + 2, y + 2, x + w - 2, y + hh), fill=ACCENT)
    for c in range(1, cols):
        d.line((x + w * c / cols, y + 2, x + w * c / cols, y + h - 2), fill=RULE, width=2)
    for r in range(1, rows + 1):
        d.line((x + 2, y + hh * r, x + w - 2, y + hh * r), fill=RULE, width=2)

def arrow(d, x, y, size, colour=ACCENT):
    d.rounded_rectangle((x, y + size * .34, x + size * .62, y + size * .50), radius=6, fill=colour)
    d.polygon([(x + size * .52, y + size * .18), (x + size * .52, y + size * .66),
               (x + size, y + size * .42)], fill=colour)

print('Chrome Web Store assets')

# 1. Store icon ------------------------------------------------------------
save(mark(128), 'icon-128.png', alpha=True)

# 2. Small promo tile 440x280 ---------------------------------------------
W, H = 440, 280
im = Image.new('RGB', (W, H), (250, 252, 253)); d = ImageDraw.Draw(im)
d.rectangle((284, 0, W, H), fill=SOFT)          # a quiet field for the sheet
im.paste(mark(72), (38, 44), mark(72))
d.text((38, 138), 'Order History', font=font(30, True), fill=INK)
d.text((38, 174), 'to CSV', font=font(30, True), fill=INK)
d.text((39, 220), 'Every purchase, in a spreadsheet.', font=font(14), fill=MUTED)
d.text((39, 242), 'Works with Lazada', font=font(13), fill=ACCENT)
sheet(d, 318, 74, 96, 132, cols=3, rows=5)
save(im, 'tile-small-440x280.png')

# 3. Marquee promo tile 1400x560 ------------------------------------------
W, H = 1400, 560
im = Image.new('RGB', (W, H), (250, 252, 253)); d = ImageDraw.Draw(im)
d.ellipse((920, -200, 1620, 500), fill=SOFT)
im.paste(mark(92), (96, 118), mark(92))
d.text((96, 228), 'Order History to CSV', font=font(58, True), fill=INK)
d.text((99, 308), 'Every item you have ever bought \u2014 price, shop and date,', font=font(23), fill=MUTED)
d.text((99, 344), 'exported to one spreadsheet, straight from your browser.', font=font(23), fill=MUTED)
d.rounded_rectangle((99, 396, 288, 446), radius=25, fill=ACCENT)
d.text((124, 410), 'Works with Lazada', font=font(17, True), fill=PAPER)
order_rows(d, 850, 187, 268, rows=3)
arrow(d, 1142, 245, 70)
sheet(d, 1230, 155, 128, 250, cols=3, rows=7)
save(im, 'tile-marquee-1400x560.png')

print('done')
