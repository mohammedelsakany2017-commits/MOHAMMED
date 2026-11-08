#!/usr/bin/env python3
"""
Renders the Ultra Sawt "news headline" template graphics over a vertical video.

    python render_template.py config.json            -> final mp4 (needs ffmpeg)
    python render_template.py config.json --still 3.2 -> preview PNG of one frame

Requires: Pillow built with libraqm (Arabic shaping), numpy, ffmpeg, the Cairo variable font.
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1080, 1920
RED = (191, 0, 46)
WHITE = (255, 255, 255)
NON_JOINING = set("اأإآدذرزوؤةىءـ ،:.!؟,")  # letters that never connect to the following letter


# ---------------------------------------------------------------- helpers
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, t0, t1):
    return clamp((t - t0) / (t1 - t0)) if t1 > t0 else float(t >= t0)


def ease_out(p):
    return 1 - (1 - p) ** 3


def ease_io(p):
    return 3 * p * p - 2 * p * p * p


def lerp(a, b, p):
    return a + (b - a) * p


def lerp_c(c1, c2, p):
    return tuple(int(round(lerp(x, y, p))) for x, y in zip(c1, c2))


_fonts = {}


def font(size, weight="Bold"):
    k = (size, weight)
    if k not in _fonts:
        f = ImageFont.truetype(CFG["font"], size, layout_engine=ImageFont.Layout.RAQM)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fonts[k] = f
    return _fonts[k]


def text_w(s, f):
    return f.getlength(s, direction="rtl") if s else 0


def justify_kashida(line, f, target):
    """Stretch an Arabic line with tatweel (ـ) toward `target` px, like the reference titles."""
    words = line.split(" ")
    slots = []  # (word index, char index) where a tatweel may be inserted after the char
    for wi, w in enumerate(words):
        cands = [ci for ci in range(len(w) - 1)
                 if w[ci] not in NON_JOINING and w[ci + 1] not in NON_JOINING and "\u0621" <= w[ci] <= "\u064a"]
        if cands:
            slots.append((wi, cands[-1]))
    if not slots or text_w(line, f) >= target:
        return line
    counts = [0] * len(slots)
    best = line
    for i in range(200):
        counts[i % len(slots)] += 1
        ws = list(words)
        for (wi, ci), n in zip(slots, counts):
            if n:
                w = ws[wi]
                ws[wi] = w[:ci + 1] + "ـ" * n + w[ci + 1:]
        cand = " ".join(ws)
        if text_w(cand, f) > target:
            break
        best = cand
    return best


def draw_text_layer(size, items):
    """items: (text, font, (x_right, y_center), fill RGBA). Returns RGBA layer."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for txt, f, (x, y), fill in items:
        if txt:
            d.text((x, y), txt, font=f, fill=fill, anchor="rm", direction="rtl")
    return layer


def with_shadow(layer, blur=7, opacity=0.55, offset=(0, 3)):
    a = layer.getchannel("A")
    sh = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    sa = a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * opacity))
    sh.putalpha(sa)
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.alpha_composite(sh, offset)
    out.alpha_composite(layer)
    return out


def tint(mask, color, alpha=1.0):
    im = Image.new("RGBA", mask.size, color + (0,))
    im.putalpha(mask.point(lambda v: int(v * alpha)))
    return im


def paste_center(canvas, im, cx, cy):
    canvas.alpha_composite(im, (int(round(cx - im.width / 2)), int(round(cy - im.height / 2))))


def dotted(d, x0, y0, x1, y1, p, step=8, r=2.2, fill=WHITE):
    n = int(math.hypot(x1 - x0, y1 - y0) / step)
    for i in range(int(n * p) + 1):
        q = i / max(n, 1)
        x, y = lerp(x0, x1, q), lerp(y0, y1, q)
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


# ---------------------------------------------------------------- template elements
class Template:
    def __init__(self, cfg, duration):
        self.c = cfg
        self.T = cfg["timing"]
        self.D = duration
        self.icon = Image.open(os.path.join(HERE, "assets", "ultra_icon_alpha.png")).convert("L")
        logo = Image.open(os.path.join(HERE, "assets", "ultra_sawt_logo.png")).convert("RGBA")
        self.logo_a = logo.getchannel("A")
        self.logo_outline = Image.fromarray(np.clip(
            np.asarray(self.logo_a.filter(ImageFilter.MaxFilter(5)), float) - np.asarray(self.logo_a, float), 0, 255
        ).astype(np.uint8))
        lw, lh = self.logo_a.size
        yy, xx = np.mgrid[0:lh, 0:lw]
        self.hatch_phase = ((xx * 0.5 + yy * 0.866) % 9.0)  # diagonal stripes
        self.logo_xn = 1 - xx / lw  # wipe runs right -> left
        self.bottom_grad = self._gradient()

        fb = self.fit_font(cfg["big"])
        fl = self.fit_font(cfg["lower"])
        bl = cfg["big"]["lines"]
        target = max(text_w(l, fb) for l in bl)
        self.big_lines = [justify_kashida(l, fb, target) if cfg["big"].get("kashida", True) else l for l in bl]
        self.lower_lines = cfg["lower"]["lines"]
        self.fb, self.fl = fb, fl

    @staticmethod
    def fit_font(block):
        """Largest size <= block["size"] whose widest line fits within block["max_width"]."""
        size = block["size"]
        limit = block.get("max_width")
        while limit and size > 20 and max(text_w(l, font(size, block["weight"])) for l in block["lines"]) > limit:
            size -= 1
        return font(size, block["weight"])

    def _gradient(self):
        g = self.c.get("bottom_gradient", {"from_y": 1050, "opacity": 0.55})
        a = np.zeros((H, 1), float)
        y = np.arange(H)
        a[:, 0] = np.clip((y - g["from_y"]) / (H - g["from_y"]), 0, 1) ** 1.3 * g["opacity"]
        img = np.zeros((H, W, 4), np.uint8)
        img[..., 3] = (np.repeat(a, W, 1) * 255).astype(np.uint8)
        return Image.fromarray(img, "RGBA")

    # --- red "u" icon with the white -> pink -> red pop-in
    def icon_at(self, canvas, t, cx, cy, t0, scale=1.0, t_out=None):
        if t < t0:
            return
        p = prog(t, t0, t0 + 0.32)
        s = scale * lerp(4.0, 1.0, ease_out(p))
        col = lerp_c(WHITE, (247, 180, 205), prog(p, 0.35, 0.65)) if p < 0.65 else lerp_c((247, 180, 205), RED, prog(p, 0.65, 1))
        alpha = prog(t, t0, t0 + 0.06)
        if t_out is not None and t >= t_out:
            q = prog(t, t_out, t_out + 0.25)
            if q >= 1:
                return
            s *= 1 - ease_io(q)
        m = self.icon.resize((max(1, int(self.icon.width * s)), max(1, int(self.icon.height * s))), Image.LANCZOS)
        im = tint(m, col, alpha)
        if p < 1:  # glow during the pop
            glow = tint(m.filter(ImageFilter.GaussianBlur(10)), WHITE, 0.6 * (1 - p))
            paste_center(canvas, glow, cx, cy)
        paste_center(canvas, im, cx, cy)

    # --- headline with per-character typing; the newest character fades in from grey
    def typed(self, lines, f, x_right, y0, lead, chars_shown, frac):
        items = []
        remaining = chars_shown
        for i, ln in enumerate(lines):
            if remaining <= 0:
                break
            n = min(len(ln), remaining)
            y = y0 + i * lead
            if n < len(ln) or remaining == n:
                # partially typed line: newest char drawn grey under the settled text
                items.append((ln[:n], f, (x_right, y), (150, 150, 150, int(255 * (0.5 + 0.5 * frac)))))
                items.append((ln[:max(0, n - 1)] if frac < 1 else ln[:n], f, (x_right, y), WHITE + (255,)))
            else:
                items.append((ln, f, (x_right, y), WHITE + (255,)))
            remaining -= len(ln)
        return items

    def type_state(self, total, t, t0, t1, t_out0=None, t_out1=None):
        if t < t0:
            return 0, 1.0
        if t_out0 is not None and t >= t_out0:
            return int(round(total * (1 - prog(t, t_out0, t_out1)))), 1.0
        x = total * prog(t, t0, t1)
        n = int(math.ceil(x))
        return n, 1.0 - (n - x)

    def frame(self, t):
        c, T = self.c, self.T
        cv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        cv.alpha_composite(self.bottom_grad)
        d = ImageDraw.Draw(cv)
        txt_items = []

        # big headline + its icon + decorative vertical line
        B = c["big"]
        total = sum(len(l) for l in self.big_lines)
        n, frac = self.type_state(total, t, *T["big_type"], *T["big_out"])
        if n > 0:
            txt_items += self.typed(self.big_lines, self.fb, B["x_right"], B["y_first"], B["leading"], n, frac)
        self.icon_at(cv, t, *B["icon"], T["icon_pop"], 1.0, t_out=T["big_out"][1] - 0.25)
        if t < T["big_out"][1]:
            self.deco_line(d, t, B)

        # lower headline
        L = c["lower"]
        total_l = sum(len(l) for l in self.lower_lines)
        n, frac = self.type_state(total_l, t, *T["lower_type"])
        if n > 0:
            txt_items += self.typed(self.lower_lines, self.fl, L["x_right"], L["y_first"], L["leading"], n, frac)
        self.icon_at(cv, t, *L["icon"], T["lower_type"][0] - 0.12, L.get("icon_scale", 1.0))

        self.location(cv, t, txt_items)
        cred_layer = self.credit(cv, t)

        tl = draw_text_layer((W, H), txt_items)
        if cred_layer is not None:
            tl.alpha_composite(cred_layer)
        cv.alpha_composite(with_shadow(tl))

        self.logo(cv, t)
        return cv

    def deco_line(self, d, t, B):
        x = B["icon"][0] + B.get("deco_dx", 37)
        y0 = B["icon"][1] + 50
        y1 = B["y_first"] + B["leading"] * (len(self.big_lines) - 1) + 40
        p = ease_io(prog(t, *self.T["deco"]))
        if self.T["big_out"][0] <= t:
            p *= 1 - prog(t, *self.T["big_out"])
        if p <= 0:
            return
        yend = lerp(y0, y1, p)
        mid = lerp(y0, y1, 0.45)
        d.line([x, y0, x, min(yend, mid)], fill=WHITE, width=2)
        if yend > mid:
            y = mid + 6
            while y < yend:
                d.line([x, y, x, min(y + 4, yend)], fill=WHITE, width=2)
                y += 10
        for i in range(1, len(self.big_lines)):
            ys = B["y_first"] + B["leading"] * i - 14
            if ys < yend:
                d.rectangle([x - 4, ys - 4, x + 4, ys + 4], fill=RED)
        if p >= 1:
            d.rectangle([x - 4, y1 - 4, x + 4, y1 + 4], fill=RED)

    def location(self, cv, t, txt_items):
        Lc, T = self.c["location"], self.T
        t0 = T["loc_in"]
        if t < t0:
            return
        cx, cy = Lc["pos"]
        p = ease_out(prog(t, t0, t0 + 0.55))
        dx, dy = lerp(130, 0, p), lerp(110, 0, p)
        d = ImageDraw.Draw(cv)
        # vertical dotted line with red end dot
        pv = prog(t, t0 + 0.7, t0 + 1.2)
        if pv > 0:
            dotted(d, cx, cy - 36, cx, cy - 36 - 30 * pv, 1, step=6, r=1.3)
            dotted(d, cx, cy + 36, cx, cy + 36 + 50 * pv, 1, step=6, r=1.3)
            if pv >= 1:
                d.ellipse([cx - 5, cy + 86, cx + 5, cy + 96], fill=RED)
        # diamond (briefly flashes to a white pin only, like the reference)
        flash = t0 + 0.8 <= t < t0 + 0.9
        dia = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        if not flash:
            ImageDraw.Draw(dia).rounded_rectangle([24, 24, 76, 76], radius=9, fill=RED + (int(255 * min(1, p * 3)),))
            dia = dia.rotate(45, resample=Image.BICUBIC)
        pd = ImageDraw.Draw(dia)
        pd.ellipse([40, 34, 60, 54], fill=WHITE)
        pd.polygon([(41.5, 49), (58.5, 49), (50, 64)], fill=WHITE)
        pd.ellipse([46, 40, 54, 48], fill=RED if not flash else (0, 0, 0, 0))
        paste_center(cv, dia, cx + dx, cy + dy)
        # name typing + horizontal dotted leader with red dot
        f = font(Lc["size"], Lc.get("weight", "ExtraBold"))
        s = Lc["text"]
        n = int(math.ceil(len(s) * prog(t, t0 + 1.0, t0 + 1.0 + 0.06 * len(s))))
        xr = cx - 42
        if n > 0:
            txt_items.append((s[:n], f, (xr, cy - 2), WHITE + (255,)))
        ph = prog(t, t0 + 1.1, t0 + 1.8)
        if ph > 0:
            xl = xr - text_w(s[:max(n, 1)], f) - 8
            xe = Lc.get("leader_end_x", 60)
            dotted(d, xl, cy + 10, lerp(xl, xe, ph), cy + 10, 1, step=7, r=2)
            if ph >= 1:
                d.ellipse([xe - 10, cy + 5, xe, cy + 15], fill=RED)

    def credit(self, cv, t):
        C, t0 = self.c["credit"], self.T["credit_in"]
        if t < t0 or not C.get("text"):
            return None
        x, y = C["pos"]
        d = ImageDraw.Draw(cv)
        s = ease_out(prog(t, t0, t0 + 0.25))
        if s > 0:
            r = 13 * s
            d.rounded_rectangle([x - r, y - r, x + r, y + r], radius=7 * s, outline=WHITE, width=3)
            d.ellipse([x - 6 * s, y - 6 * s, x + 6 * s, y + 6 * s], outline=WHITE, width=3)
            d.ellipse([x + 5 * s, y - 9 * s, x + 9 * s, y - 5 * s], fill=WHITE)
        p = prog(t, t0 + 0.3, t0 + 1.2)
        if p <= 0:
            return None
        f = font(C["size"], C.get("weight", "SemiBold"))
        tw = int(text_w(C["text"], f)) + 20
        lay = Image.new("RGBA", (tw, 70), (0, 0, 0, 0))
        col = lerp_c(RED, WHITE, prog(p, 0.4, 1.0))
        ImageDraw.Draw(lay).text((tw - 10, 35), C["text"], font=f, fill=col + (255,), anchor="rm",
                                 direction="rtl" if any("\u0600" <= ch <= "\u06ff" for ch in C["text"]) else None)
        # reveal from the start of the text
        cut = int(tw * (1 - ease_out(prog(p, 0, 0.6))))
        a = np.asarray(lay.getchannel("A")).copy()
        a[:, :cut] = 0
        lay.putalpha(Image.fromarray(a))
        lay = lay.rotate(90, expand=True)  # start of the text at the top, like the reference
        out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        out.alpha_composite(lay, (int(x - lay.width / 2), int(y + 26)))
        return out

    def logo(self, cv, t):
        T = self.T
        t0 = T["logo_in"]
        if t < t0 or t >= self.D - T["end_fade"]:
            return
        lx, ly = self.c["logo_pos"]
        po = prog(t, t0, t0 + 0.25)
        a = np.asarray(self.logo_outline, float) * po
        # hatch fill sweeping right -> left, each pixel turning solid after it is reached
        local = np.clip((t - (t0 + 0.3) - self.logo_xn * 0.55) / 0.35, 0, 1)
        stripe = (self.hatch_phase < 1.5 + 7.5 * local).astype(float)
        fill = np.where(local >= 1, 1.0, np.where(local > 0, stripe, 0.0))
        a = np.maximum(a * (1 - (local >= 1)), np.asarray(self.logo_a, float) * fill)
        lay = Image.new("RGBA", self.logo_a.size, WHITE + (0,))
        lay.putalpha(Image.fromarray(a.astype(np.uint8)))
        cv.alpha_composite(with_shadow(lay, blur=3, opacity=0.35, offset=(1, 2)), (lx, ly))


# ---------------------------------------------------------------- pipeline
def probe_duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "default=nw=1:nk=1", path])
    return float(out)


def video_filter(cfg):
    v = cfg.get("video_crop")  # remove a burned-in bottom banner by cropping + refilling the frame
    chain = []
    if v:
        chain.append(f"crop={v['w']}:{v['h']}:{v['x']}:{v['y']}")
    chain.append(f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}")
    return ",".join(chain)


def main():
    global CFG
    cfg_path = sys.argv[1]
    CFG = json.load(open(cfg_path, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(cfg_path))
    CFG["font"] = os.path.expanduser(CFG["font"])
    src = os.path.join(base, CFG["input"]) if not os.path.isabs(CFG["input"]) else CFG["input"]
    D = probe_duration(src)
    fps = CFG.get("fps", 30)
    tpl = Template(CFG, D)

    if "--still" in sys.argv:
        t = float(sys.argv[sys.argv.index("--still") + 1])
        out = sys.argv[sys.argv.index("--still") + 2] if len(sys.argv) > sys.argv.index("--still") + 2 else "still.png"
        bg = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", str(t), "-i", src, "-frames:v", "1",
                                      "-vf", video_filter(CFG), "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
        im = Image.frombytes("RGBA", (W, H), bg)
        fade = tpl.T["end_fade"]
        if t > D - fade:
            im = Image.blend(im, Image.new("RGBA", (W, H), (0, 0, 0, 255)), prog(t, D - fade, D))
        im.alpha_composite(tpl.frame(t))
        im.convert("RGB").save(out)
        print("wrote", out)
        return

    out = os.path.join(base, CFG["output"]) if not os.path.isabs(CFG["output"]) else CFG["output"]
    fade = tpl.T["end_fade"]
    fc = (f"[0:v]{video_filter(CFG)},fps={fps},fade=t=out:st={D - fade:.3f}:d={fade},format=rgba[bg];"
          f"[bg][1:v]overlay=format=auto:shortest=1,format=yuv420p[v]")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src,
           "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           "-filter_complex", fc, "-map", "[v]", "-map", "0:a?",
           "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-c:a", "aac", "-b:a", "192k",
           "-movflags", "+faststart", out]
    if CFG.get("graphics_only"):
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
               "-r", str(fps), "-i", "-", "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
               out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    nframes = int(math.ceil(D * fps))
    for i in range(nframes):
        proc.stdin.write(tpl.frame(i / fps).tobytes())
        if i % 30 == 0:
            print(f"frame {i}/{nframes}", flush=True)
    proc.stdin.close()
    sys.exit(proc.wait())


if __name__ == "__main__":
    main()
