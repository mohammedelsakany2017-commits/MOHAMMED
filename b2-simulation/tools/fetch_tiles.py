"""Download and stitch the imagery/elevation layers used by the simulation.

Sources (attribution is shown in the README and the video end card):
  - NASA Blue Marble Next Generation via NASA GIBS (public domain)
  - NASA Landsat WELD annual mosaic and NASA HLS (Harmonized Landsat Sentinel-2, 30 m) via NASA GIBS
  - NASA Black Marble 2016 (VIIRS night lights) via NASA GIBS (public domain)
  - Terrain Tiles (Mapzen/AWS Open Data, terrarium encoding)

Usage:  uv run --with pillow --with numpy tools/fetch_tiles.py
"""
import io
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
CACHE = os.path.join(HERE, '..', '.tilecache')

GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
# Each source is a list of URL templates tried in order; a tile is accepted when it is mostly opaque and cloud-free.
SOURCES = {
    'bluemarble': [GIBS + '/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],
    'bathymetry': [GIBS + '/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],
    'weld': [GIBS + '/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/default/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg'],
    # NASA Harmonized Landsat Sentinel-2, 30 m; clear-sky dates first
    'hls': [GIBS + f'/HLS_{s}_Nadir_BRDF_Adjusted_Reflectance/default/{d}/GoogleMapsCompatible_Level12/{{z}}/{{y}}/{{x}}.png'
            for d, s in [('2025-05-20', 'S30'), ('2025-05-20', 'L30'), ('2024-10-03', 'S30'), ('2024-09-14', 'L30'),
                         ('2024-08-05', 'L30'), ('2024-07-10', 'S30')]],
    'hls_dg': [GIBS + f'/HLS_{s}_Nadir_BRDF_Adjusted_Reflectance/default/{d}/GoogleMapsCompatible_Level12/{{z}}/{{y}}/{{x}}.png'
               for d in ['2025-03-02', '2025-02-10', '2024-12-28', '2024-11-19', '2024-10-07', '2024-09-02', '2024-08-15',
                         '2024-07-21', '2024-06-30', '2024-03-10'] for s in ['S30', 'L30']]
              + [GIBS + '/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/default/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg'],
    'blackmarble': [GIBS + '/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'],
    'terrain': ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
}

# name, source, zoom, lon0, lat0, lon1, lat1
LAYERS = [
    ('region', 'bluemarble', 7, 28.0, -12.0, 82.0, 46.0),
    ('region_bathy', 'bathymetry', 7, 28.0, -12.0, 82.0, 46.0),
    ('region_dem', 'terrain', 6, 28.0, -12.0, 82.0, 46.0),
    ('mid', 'weld', 9, 47.5, 30.0, 57.5, 37.5),
    ('mid_dem', 'terrain', 8, 47.5, 30.0, 57.5, 37.5),
    ('mid_night', 'blackmarble', 8, 47.5, 30.0, 57.5, 37.5),
    ('detail', 'hls', 12, 51.40, 33.45, 52.12, 33.95),
    ('detail_dem', 'terrain', 12, 51.40, 33.45, 52.12, 33.95),
    ('dg', 'hls_dg', 12, 72.30, -7.50, 72.56, -7.18),
]


def usable(data, src):
    """Reject transparent (no-data) or cloudy tiles so the next date/source is tried."""
    if src in ('terrain', 'bluemarble', 'blackmarble', 'bathymetry'):
        return True
    a = np.asarray(Image.open(io.BytesIO(data)).convert('RGBA')).astype(np.int16)
    opaque = (a[..., 3] > 200).mean()
    rgb = a[..., :3]
    cloud = ((rgb.min(-1) > 205) & (rgb.max(-1) - rgb.min(-1) < 22)).mean()
    return opaque > 0.97 and cloud < (0.03 if src == 'hls_dg' else 0.05)


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n
    return x, y


def merc(lon, lat):
    """Web Mercator in units of the full world (0..1), y downwards."""
    x, y = tile_xy(lon, lat, 0)
    return x, y


def get(url):
    err = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'b2-simulation-docs/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - retried, then surfaced
            err = e
    raise RuntimeError(f'failed {url}: {err}')


def fetch(src, z, x, y):
    path = os.path.join(CACHE, src, str(z), f'{x}_{y}')
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read()
    best = None
    for tpl in SOURCES[src]:
        data = get(tpl.format(z=z, x=x, y=y))
        if best is None:
            best = data
        if usable(data, src):
            best = data
            break
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(best)
    return best


def build(name, src, z, lon0, lat0, lon1, lat1):
    fx0, fy0 = tile_xy(lon0, lat1, z)
    fx1, fy1 = tile_xy(lon1, lat0, z)
    x0, y0, x1, y1 = int(fx0), int(fy0), int(fx1), int(fy1)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    mode = 'RGB'
    canvas = Image.new(mode, (nx * 256, ny * 256))
    jobs = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    with ThreadPoolExecutor(12) as ex:
        for (x, y), data in zip(jobs, ex.map(lambda j: fetch(src, z, *j), jobs)):
            tile = Image.open(io.BytesIO(data)).convert('RGBA')
            # palette tiles with transparency (Black Marble) must be flattened onto black, not dropped to RGB
            flat = Image.new('RGBA', tile.size, (0, 0, 0, 255))
            flat.alpha_composite(tile)
            canvas.paste(flat.convert(mode), ((x - x0) * 256, (y - y0) * 256))
    n = 2 ** z
    bounds = {'x0': x0 / n, 'y0': y0 / n, 'x1': (x1 + 1) / n, 'y1': (y1 + 1) / n}
    if src == 'terrain':
        a = np.asarray(canvas).astype(np.float32)
        h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        h = np.clip(h, -500, 6000)
        # pack metres (offset 500) into R/G as 16-bit for a lossless PNG height map
        v = np.round(h + 500).astype(np.uint16)
        rgb = np.stack([v >> 8, v & 255, np.zeros_like(v)], -1).astype(np.uint8)
        Image.fromarray(rgb, 'RGB').save(os.path.join(OUT, f'{name}.png'), optimize=True)
        bounds.update(hmin=float(h.min()), hmax=float(h.max()), file=f'{name}.png')
    elif src == 'hls_dg':
        # keep only the atoll (land + reef), dropping the dark open ocean and scattered clouds, as an RGBA overlay
        from PIL import ImageFilter
        a = np.asarray(canvas).astype(np.int16)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        lum = (r + g + b) / 3
        cloud = (a.min(-1) > 175) & (a.max(-1) - a.min(-1) < 30)
        reef = (lum > 45) & ~cloud & (g > r + 12) & (a.max(-1) - a.min(-1) > 28)   # green/turquoise only
        # keep only the connected region around the atoll so cloud fragments over open ocean are dropped
        from PIL import ImageDraw
        bridge = Image.fromarray((reef * 255).astype(np.uint8), 'L').filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MaxFilter(7))
        bridge = bridge.point(lambda v: 255 if v > 127 else 0)
        sx, sy = tile_xy(72.43, -7.33, z)
        ImageDraw.floodfill(bridge, (int((sx - x0) * 256), int((sy - y0) * 256)), 128)
        reef &= np.asarray(bridge) == 128
        # morphological close fills the speckled holes in the land/reef so the ocean below doesn't show through
        m = (Image.fromarray((reef * 255).astype(np.uint8), 'L').filter(ImageFilter.MedianFilter(5))
             .filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(2.5)))
        out = canvas.convert('RGBA'); out.putalpha(m)
        out.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        bounds['file'] = f'{name}.png'
    else:
        q = 88
        canvas.save(os.path.join(OUT, f'{name}.jpg'), quality=q, optimize=True, progressive=True)
        bounds['file'] = f'{name}.jpg'
    bounds.update(w=canvas.width, h=canvas.height, zoom=z, source=src)
    print(f'{name}: {nx}x{ny} tiles -> {canvas.width}x{canvas.height}', file=sys.stderr)
    return bounds


def merge_bathymetry(meta):
    """Replace the near-black Blue Marble oceans with NASA's shaded bathymetry (both NASA layers, same grid)."""
    from PIL import ImageFilter
    Image.MAX_IMAGE_PIXELS = None
    land = Image.open(os.path.join(OUT, 'region.jpg')).convert('RGB')
    sea = Image.open(os.path.join(OUT, 'region_bathy.jpg')).convert('RGB')
    a = np.asarray(land).astype(np.int16)
    ocean = ((a[..., 2] >= a[..., 0]) & (a.max(-1) < 70)).astype(np.uint8) * 255
    mask = Image.fromarray(ocean, 'L').filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.5))
    Image.composite(sea, land, mask).save(os.path.join(OUT, 'region.jpg'), quality=88, optimize=True, progressive=True)
    os.remove(os.path.join(OUT, 'region_bathy.jpg'))
    del meta['region_bathy']


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {name: build(name, *rest) for name, *rest in LAYERS}
    merge_bathymetry(meta)
    with open(os.path.join(OUT, 'layers.js'), 'w') as f:
        f.write('// generated by tools/fetch_tiles.py — Web Mercator bounds in world units (0..1, y down)\n')
        f.write('window.LAYERS = ' + json.dumps(meta, indent=1) + ';\n')


if __name__ == '__main__':
    main()
