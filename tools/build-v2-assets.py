"""Cut game-ready Ruang V2 assets out of the concept sheets in design/v2.

Outputs (dist/v2):
  office.png        - empty office backdrop (Master Test Office Composition)
  employee-N.png    - 4 cols x 8 rows sprite sheet per employee variant,
                      rows: idle_down, idle_up, idle_left, idle_right,
                            walk_down, walk_up, walk_left, walk_right
  icons.png         - status glyphs in a single row (see ICONS order)
  sprites.json      - frame size and icon order for the renderer

Run: python tools/build-v2-assets.py
"""
import json, shutil
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'design' / 'v2'
OUT = ROOT / 'dist' / 'v2'

# Panel regions on "RUANG V2 Employee Movement System.png" (x0, y0, x1, y1).
PANELS = {
    'idle': (35, 185, 450, 346),
    'walk_down': (720, 185, 1125, 346),
    'reference': (1150, 185, 1505, 340),  # down, left, right, up
    'walk_left': (35, 455, 505, 606),
    'walk_right': (532, 455, 1005, 606),
    'walk_up': (1032, 455, 1505, 606),
}
BG_TOLERANCE = 40

# The cast comes from section 08 "Outfit variations" of the character sheet (front-facing figures).
# Index into that row (11 figures): default, engineer, data, product, design, operations, management,
# research, qa (hijab), casual, casual green.
OUTFIT_ROW = (20, 505, 830, 640)
# Employee order matches the app's default team: Manager, Researcher, Data analyst, Software engineer, QA.
# head: 'hair' (short), 'long' (hair falls to the shoulders) or 'hijab'.
CAST = [
    {'outfit': 6, 'head': 'hair'},   # management: dark blazer, lanyard
    {'outfit': 4, 'head': 'long'},   # design: green jacket, longer hair
    {'outfit': 2, 'head': 'hair'},   # data: glasses, light blue shirt
    {'outfit': 1, 'head': 'hair'},   # engineer: glasses, dark jacket
    {'outfit': 8, 'head': 'hijab'},  # qa: navy hijab
]

# Minimal status icon row on the status sheet: tile left edges, shared top/bottom.
ICON_TILES = {'working': 594, 'thinking': 646, 'research': 698, 'team': 801, 'waiting': 851,
              'approval': 901, 'blocked': 950, 'error': 1000, 'done': 1050}
ICON_Y = (875, 917)
ICON_W = 42


def cut_figures(sheet, box):
    """Return RGBA crops of each figure in a panel, left to right, background removed."""
    x0, y0, x1, y1 = box
    region = np.asarray(sheet.crop(box)).astype(int)
    border = np.concatenate([region[0], region[-1], region[:, 0], region[:, -1]])
    bg = np.median(border, axis=0)
    diff = np.abs(region - bg).sum(axis=2)
    # Flood-fill background from the panel edge so dark outline pixels inside the figure survive.
    h, w = diff.shape
    is_bg = np.zeros((h, w), bool)
    queue = deque([(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)])
    while queue:
        y, x = queue.popleft()
        if is_bg[y, x] or diff[y, x] > BG_TOLERANCE:
            continue
        is_bg[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not is_bg[ny, nx]:
                queue.append((ny, nx))
    solid = ~is_bg
    cols = solid.sum(axis=0)
    runs, start = [], None
    for i, v in enumerate(list(cols) + [0]):
        if v and start is None:
            start = i
        if not v and start is not None:
            if i - start > 25:
                runs.append((start, i))
            start = None
    figures = []
    for a, b in runs:
        keep = largest_component(solid[:, a:b])
        solid[:, a:b] = keep
        rows = np.where(keep.any(axis=1))[0]
        top, bottom = rows[0], rows[-1] + 1
        rgba = np.zeros((bottom - top, b - a, 4), np.uint8)
        rgba[..., :3] = region[top:bottom, a:b]
        rgba[..., 3] = np.where(solid[top:bottom, a:b], 255, 0)
        figures.append(rgba)
    return figures


def largest_component(mask):
    """Keep only the biggest 4-connected blob (drops label underlines and stray specks)."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    best = []
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        blob, queue = [], deque([(sy, sx)])
        seen[sy, sx] = True
        while queue:
            y, x = queue.popleft()
            blob.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        if len(blob) > len(best):
            best = blob
    out = np.zeros_like(mask)
    ys, xs = zip(*best)
    out[list(ys), list(xs)] = True
    return out


WAIST = 0.64  # fraction of figure height where the torso meets the legs


def scale_to_height(rgba, height):
    img = Image.fromarray(rgba)
    width = max(1, round(img.width * height / img.height))
    return np.asarray(img.resize((width, height), Image.NEAREST))


def regions(rgba):
    """Masks for hair, skin, shirt and trousers on a V2 movement frame, using colour plus height bands."""
    rgb = rgba[..., :3].astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    alpha = rgba[..., 3] > 0
    lum = rgb.mean(axis=2)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    ys = np.arange(rgba.shape[0])[:, None] / rgba.shape[0]
    dark = alpha & (lum > 26) & (lum < 110) & (b >= r - 5)
    return {
        'hair': dark & (ys < 0.45) & (mx - mn < 60),
        'skin': alpha & (r > 140) & (r - b > 50) & (g > 70),
        'shirt': alpha & (mn > 105) & (lum > 125) & (mx - mn < 70) & (ys > 0.35) & ~((r > 140) & (r - b > 50)),
        'pants': dark & (ys > WAIST - 0.04),
    }


def sample(fig, x0, x1, y0, y1, mask=None):
    """Median colour of the opaque pixels in a box given as fractions of the figure."""
    h, w = fig.shape[:2]
    box = fig[int(y0 * h):max(int(y1 * h), int(y0 * h) + 1), int(x0 * w):max(int(x1 * w), int(x0 * w) + 1)]
    px = box[box[..., 3] > 0][:, :3].astype(float)
    if mask is not None:
        px = px[mask(px)] if mask(px).any() else px
    return np.median(px, axis=0) if len(px) else np.array([128, 128, 128])


def outfit_palette(fig):
    not_outline = lambda px: px.mean(axis=1) > 30
    skinny = lambda px: (px[:, 0] - px[:, 2] > 50) & (px[:, 0] > 140)
    return {
        'hair': sample(fig, 0.3, 0.7, 0.02, 0.1, not_outline),
        'skin': sample(fig, 0.3, 0.7, 0.2, 0.32, skinny),
        'top': sample(fig, 0.15, 0.32, 0.45, 0.6, not_outline),
        'pants': sample(fig, 0.3, 0.7, 0.72, 0.85, not_outline),
    }


def tint(rgb, mask, colour, reference):
    """Recolour masked pixels to `colour`, keeping their light and shade relative to `reference` luminance."""
    lum = rgb.mean(axis=2)
    shade = np.clip(lum / max(reference, 1), 0.4, 1.6)[..., None]
    rgb[mask] = np.clip(np.asarray(colour, float) * shade, 0, 255)[mask]


def dress(frame, pal, head, base_skin):
    """Recolour a movement frame (side or back view) to a cast member's outfit, adding hijab or long hair."""
    out = frame.copy()
    rgb = out[..., :3].astype(float)
    m = regions(out)
    lum = rgb.mean(axis=2)
    ref = lambda mask, fallback: float(lum[mask].mean()) if mask.any() else fallback
    hair_ref, shirt_ref, pants_ref = ref(m['hair'], 55), ref(m['shirt'], 220), ref(m['pants'], 60)
    tint(rgb, m['shirt'], pal['top'], shirt_ref)
    tint(rgb, m['pants'], pal['pants'], pants_ref)
    rgb[m['skin']] = np.clip(rgb[m['skin']] * (pal['skin'] / np.maximum(base_skin, 1)), 0, 255)
    cover = pal['hair']
    if head == 'hijab':
        cover = pal['top'] if pal['top'].mean() < 110 else pal['hair']
    tint(rgb, m['hair'], cover, hair_ref)
    if head in ('hijab', 'long') and m['hair'].any():
        # Drape below the hairline: the fabric (or hair) falls over the neck and onto the shoulders.
        rows = np.where(m['hair'].any(axis=1))[0]
        bottom, h = rows[-1], out.shape[0]
        cols = np.where(m['hair'][max(rows[0], bottom - 4):bottom + 1].any(axis=0))[0]
        if len(cols):
            left, right = cols[0], cols[-1]
            depth = int(h * (0.17 if head == 'hijab' else 0.1))
            for y in range(bottom + 1, min(h, bottom + 1 + depth)):
                shrink = 0 if head == 'hijab' else int((y - bottom) * 0.4)
                band = slice(left + shrink, right + 1 - shrink)
                drape = (out[y, band, 3] > 0) & ~m['skin'][y, band] if head == 'long' else out[y, band, 3] > 0
                seg = rgb[y, band]
                seg[drape] = np.clip(np.asarray(cover, float) * 0.95, 0, 255)
                rgb[y, band] = seg
    out[..., :3] = rgb.astype(np.uint8)
    return out


def front_walk(walk, upper_src):
    """Front walking frame: the cast figure's head and torso over the movement frame's legs."""
    h, w = walk.shape[:2]
    up = upper_src[:int(upper_src.shape[0] * WAIST)]
    uh, uw = up.shape[:2]
    cut = int(h * WAIST)
    top = max(0, uh - cut)  # grow upwards if the cast figure's torso is taller than the frame's
    width = max(w, uw)
    out = np.zeros((h + top, width, 4), np.uint8)
    lx = (width - w) // 2
    out[top + cut:, lx:lx + w] = walk[cut:]
    ux, uy = (width - uw) // 2, top + cut - uh
    solid = up[..., 3] > 0
    out[uy:uy + uh, ux:ux + uw][solid] = up[solid]
    return out


def key_out(rgb, bg, soft=110):
    """Make a flat background transparent; edge pixels get partial alpha and are un-blended from the background."""
    rgb = rgb.astype(float)
    bg = np.asarray(bg, float)
    alpha = np.clip(np.abs(rgb - bg).sum(axis=2) / soft, 0, 1)
    colour = np.where(alpha[..., None] > 0, (rgb - bg * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3), 0)
    out = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(colour, 0, 255)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    return out


def build_logo():
    """Symbol and wordmark from the dark-background version, plus the 48px application icon."""
    sheet = np.asarray(Image.open(SRC / 'Ruang Logo Concept.png').convert('RGB'))
    dark_bg = np.median(sheet[700:720, 530:560].reshape(-1, 3), axis=0)
    Image.fromarray(key_out(sheet[748:868, 582:694], dark_bg)).save(OUT / 'logo-symbol.png')
    Image.fromarray(key_out(sheet[768:822, 726:970], dark_bg)).save(OUT / 'logo-wordmark.png')
    # The icon's symbol is the same cream as the page, so only the page outside the rounded square is removed.
    icon = sheet[738:864, 1072:1200]
    light_bg = np.median(sheet[730:736, 1060:1070].reshape(-1, 3), axis=0)
    rgba = np.dstack([icon, np.full(icon.shape[:2], 255, np.uint8)])
    diff = np.abs(icon.astype(int) - light_bg).sum(axis=2)
    h, w = diff.shape
    outside = np.zeros((h, w), bool)
    queue = deque([(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)])
    while queue:
        y, x = queue.popleft()
        if outside[y, x] or diff[y, x] > 90:
            continue
        outside[y, x] = True
        queue.extend((y + dy, x + dx) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= y + dy < h and 0 <= x + dx < w)
    rgba[outside, 3] = 0
    Image.fromarray(rgba).save(OUT / 'app-icon.png')


def build_web_icons():
    """Installable web app icons: the large symbol from section 01, recoloured cream and sand on deep teal."""
    sheet = np.asarray(Image.open(SRC / 'Ruang Logo Concept.png').convert('RGB')).astype(float)
    crop = sheet[88:318, 92:322]
    page = np.median(sheet[60:80, 30:60].reshape(-1, 3), axis=0)
    ink = np.abs(crop - page).sum(axis=2) / 160
    alpha = np.clip((ink - 0.2) / 0.8, 0, 1)  # ignore the sheet's faint paper texture
    sand = (crop[..., 0] - crop[..., 2] > 40) & (alpha > 0.5)
    rgb = np.where(sand[..., None], np.array([212, 165, 116]), np.array([246, 241, 231]))
    symbol = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8))
    teal = (15, 47, 46, 255)
    for size, inset in ((192, 0.16), (512, 0.16), (512, 0.24)):
        tile = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        mask = Image.new('L', (size, size), 0)
        from PIL import ImageDraw
        maskable = inset > 0.2
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=0 if maskable else size // 5, fill=255)
        tile.paste(Image.new('RGBA', (size, size), teal), (0, 0), mask)
        inner = int(size * (1 - inset * 2))
        tile.alpha_composite(symbol.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, (size - inner) // 2))
        tile.save(OUT / (f'icon-{size}-maskable.png' if maskable else f'icon-{size}.png'))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    build_logo()
    build_web_icons()
    # Lossy WebP at quality 95 is visually identical for the backdrop and about 80% smaller than the PNG.
    Image.open(SRC / 'RUANG V2 Master Test Office Composition.png').convert('RGB').save(OUT / 'office.webp', 'WEBP', quality=95, method=6)
    shutil.copyfile(SRC / 'RUANG V2 Master Test Office Composition.png', OUT / 'office.png')

    sheet = Image.open(SRC / 'RUANG V2 Employee Movement System.png').convert('RGB')
    figs = {name: cut_figures(sheet, box) for name, box in PANELS.items()}
    for name, f in figs.items():
        assert len(f) == 4, f'{name}: expected 4 figures, found {len(f)}'
    down, left, right, up = figs['reference']
    mirror = lambda f: f[:, ::-1].copy()
    # The sheet's "right" poses also face left, so right-facing rows are mirrored left poses.
    # Walk-up frame 2 has a skin-coloured patch on the hair; reuse frame 4 in its place.
    wu = figs['walk_up']
    rows = [figs['idle'], [up] * 4, [left] * 4, [mirror(left)] * 4,
            figs['walk_down'], [wu[0], wu[3], wu[2], wu[3]], figs['walk_left'], [mirror(f) for f in figs['walk_left']]]
    character_sheet = Image.open(SRC / 'RUANG V2 Master Employee Character System.png').convert('RGB')
    outfits = cut_figures(character_sheet, OUTFIT_ROW)
    assert len(outfits) >= 10, f'outfit row: expected at least 10 figures, found {len(outfits)}'
    base_skin = np.median(rows[0][0][regions(rows[0][0])['skin']][:, :3].astype(float), axis=0)
    sheets = []
    for member in CAST:
        figure = scale_to_height(outfits[member['outfit']], rows[0][0].shape[0])
        pal = outfit_palette(figure)
        dressed = [[dress(f, pal, member['head'], base_skin) for f in row] for row in rows]
        dressed[0] = [figure] * 4                                   # idle facing the camera: the cast figure itself
        dressed[4] = [front_walk(f, figure) for f in dressed[4]]    # walking towards the camera
        sheets.append(dressed)
    fw = max(f.shape[1] for sheet in sheets for row in sheet for f in row) + 2
    fh = max(f.shape[0] for sheet in sheets for row in sheet for f in row) + 2
    for index, sheet in enumerate(sheets):
        canvas = np.zeros((fh * 8, fw * 4, 4), np.uint8)
        for ry, row in enumerate(sheet):
            for cx, fig in enumerate(row):
                h, w = fig.shape[:2]
                x = cx * fw + (fw - w) // 2
                y = ry * fh + fh - h  # bottom-centre anchor
                canvas[y:y + h, x:x + w] = fig
        Image.fromarray(canvas).save(OUT / f'employee-{index}.png')

    status = np.asarray(Image.open(SRC / 'RUANG V2 Master Status & Activity Effects System.png').convert('RGB')).astype(int)
    y0, y1 = ICON_Y
    icons = np.zeros((y1 - y0, ICON_W * len(ICON_TILES), 4), np.uint8)
    for i, (name, x0) in enumerate(ICON_TILES.items()):
        tile = status[y0:y1, x0:x0 + ICON_W]
        glyph = tile.max(axis=2) > 130
        icons[:, i * ICON_W:(i + 1) * ICON_W, :3] = tile
        icons[:, i * ICON_W:(i + 1) * ICON_W, 3] = np.where(glyph, 255, 0)
    Image.fromarray(icons).save(OUT / 'icons.png')

    meta = json.dumps({
        'frameWidth': fw, 'frameHeight': fh, 'columns': 4,
        'rows': ['idle_down', 'idle_up', 'idle_left', 'idle_right', 'walk_down', 'walk_up', 'walk_left', 'walk_right'],
        'variants': len(CAST), 'iconSize': [ICON_W, y1 - y0], 'icons': list(ICON_TILES)}, indent=2)
    (OUT / 'sprites.json').write_text(meta)
    # Loaded as a plain script so the app needs no fetch (CSP and the Electron protocol stay simple).
    (OUT / 'sprites.js').write_text(f'window.V2SpriteMeta={meta};\n')
    print(f'frames {fw}x{fh}, {len(CAST)} employee sheets, {len(ICON_TILES)} icons -> {OUT}')


if __name__ == '__main__':
    main()
