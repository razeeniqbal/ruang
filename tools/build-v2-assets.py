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

# Employee variants: shirt colour, skin factor, hair colour (None keeps the dark V2 hair).
VARIANTS = [
    {'shirt': None, 'skin': 1.0, 'hair': None},                  # white shirt (V2 default)
    {'shirt': (118, 160, 112), 'skin': 0.72, 'hair': None},      # sage shirt, deeper skin
    {'shirt': (150, 192, 228), 'skin': 1.06, 'hair': (92, 62, 44)},  # light blue, brown hair
    {'shirt': (78, 136, 142), 'skin': 0.86, 'hair': None},       # teal shirt
    {'shirt': (214, 190, 150), 'skin': 0.94, 'hair': (70, 48, 38)},  # beige shirt
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


def recolor(rgba, variant):
    out = rgba.copy()
    rgb = out[..., :3].astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    alpha = out[..., 3] > 0
    lum = rgb.mean(axis=2)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    shirt = alpha & (mn > 150) & (mx - mn < 60)
    skin = alpha & (r > 150) & (r - b > 55) & (g > 80)
    hair = alpha & (lum > 28) & (lum < 95) & (b >= r) & (mx - mn < 45)
    if variant['shirt'] is not None:
        shade = (lum / 245.0)[..., None]
        rgb[shirt] = (np.array(variant['shirt']) * shade)[shirt]
    rgb[skin] = rgb[skin] * variant['skin']
    if variant['hair'] is not None:
        shade = (lum / 60.0)[..., None]
        rgb[hair] = (np.array(variant['hair']) * shade)[hair]
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
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
    fw = max(f.shape[1] for row in rows for f in row) + 2
    fh = max(f.shape[0] for row in rows for f in row) + 2
    for index, variant in enumerate(VARIANTS):
        canvas = np.zeros((fh * 8, fw * 4, 4), np.uint8)
        for ry, row in enumerate(rows):
            for cx, fig in enumerate(row):
                fig = recolor(fig, variant)
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
        'variants': len(VARIANTS), 'iconSize': [ICON_W, y1 - y0], 'icons': list(ICON_TILES)}, indent=2)
    (OUT / 'sprites.json').write_text(meta)
    # Loaded as a plain script so the app needs no fetch (CSP and the Electron protocol stay simple).
    (OUT / 'sprites.js').write_text(f'window.V2SpriteMeta={meta};\n')
    print(f'frames {fw}x{fh}, {len(VARIANTS)} employee sheets, {len(ICON_TILES)} icons -> {OUT}')


if __name__ == '__main__':
    main()
