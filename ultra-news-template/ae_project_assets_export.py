"""Builds the After Effects package assets: static Cairo fonts, logo/icon PNGs and layout metrics."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

TPL = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(TPL, "ae_project")
sys.path.insert(0, TPL)
import render_template as rt

os.makedirs(os.path.join(PKG, "fonts"), exist_ok=True)
os.makedirs(os.path.join(PKG, "assets"), exist_ok=True)

VAR = os.path.expanduser("~/.fonts/Cairo.ttf")
for wght, style in [(700, "Bold"), (800, "ExtraBold"), (600, "SemiBold")]:
    f = instancer.instantiateVariableFont(TTFont(VAR), {"wght": wght, "slnt": 0} if "slnt" in [a.axisTag for a in TTFont(VAR)["fvar"].axes] else {"wght": wght})
    name = f["name"]
    ps = "Cairo-" + style
    for rec in list(name.names):
        if rec.nameID in (1, 2, 4, 6, 16, 17, 25):
            name.removeNames(nameID=rec.nameID)
    for nid, val in [(1, "Cairo " + style), (2, "Regular"), (4, "Cairo " + style), (6, ps), (16, "Cairo"), (17, style)]:
        name.setName(val, nid, 3, 1, 0x409)
        name.setName(val, nid, 1, 0, 0)
    f["OS/2"].usWeightClass = wght
    for t in ("STAT",):
        if t in f:
            del f[t]
    f.save(os.path.join(PKG, "fonts", ps + ".ttf"))

# graphics assets
WHITE = (255, 255, 255)
logo_a = Image.open(os.path.join(TPL, "assets", "ultra_sawt_logo.png")).getchannel("A")
pad = 6
lw, lh = logo_a.size
big = Image.new("L", (lw + 2 * pad, lh + 2 * pad), 0)
big.paste(logo_a, (pad, pad))
la = np.asarray(big, float)
outline = np.clip(np.asarray(big.filter(ImageFilter.MaxFilter(5)), float) - la, 0, 255)
yy, xx = np.mgrid[0:big.height, 0:big.width]
stripes = (((xx * 0.5 + yy * 0.866) % 9.0) < 4.0).astype(float)


def save_white(alpha, path):
    im = Image.new("RGBA", big.size, WHITE + (0,))
    im.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    im.save(path)


save_white(la, os.path.join(PKG, "assets", "logo_solid.png"))
save_white(outline, os.path.join(PKG, "assets", "logo_outline.png"))
save_white(la * stripes, os.path.join(PKG, "assets", "logo_hatch.png"))

icon = Image.open(os.path.join(TPL, "assets", "ultra_icon_alpha.png")).convert("L")
ic = Image.new("RGBA", icon.size, rt.RED + (0,))
ic.putalpha(icon)
ic.save(os.path.join(PKG, "assets", "ultra_icon.png"))

# layout metrics from the verified renderer config
cfg = json.load(open(os.path.join(TPL, "abdul_el_sayed.json"), encoding="utf-8"))
cfg["font"] = VAR
rt.CFG = cfg
tpl = rt.Template(cfg, rt.probe_duration(os.path.join(TPL, cfg["input"])))


def baseline_off(f):
    asc, desc = f.getmetrics()
    return (asc - desc) / 2.0


fl = rt.font(cfg["location"]["size"], cfg["location"].get("weight", "ExtraBold"))
fc = rt.font(cfg["credit"]["size"], cfg["credit"].get("weight", "SemiBold"))
out = {
    "duration": tpl.D,
    "big_lines": tpl.big_lines, "big_size": tpl.fb.size, "big_baseline_off": baseline_off(tpl.fb),
    "lower_lines": tpl.lower_lines, "lower_size": tpl.fl.size, "lower_baseline_off": baseline_off(tpl.fl),
    "loc_baseline_off": baseline_off(fl), "credit_baseline_off": baseline_off(fc),
    "logo_center": [cfg["logo_pos"][0] + lw / 2.0, cfg["logo_pos"][1] + lh / 2.0],
    "icon_size": list(icon.size),
}
print(json.dumps(out, ensure_ascii=False, indent=1))
