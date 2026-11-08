#!/usr/bin/env python3
"""
3D logo outro for the Ultra Sawt template (1080x1920).

    python render_outro.py                      -> output/outro.mp4
    python render_outro.py --append main.mp4    -> also writes main_with_outro.mp4
    python render_outro.py --still 1.2 out.png  -> single frame preview

The logo is extruded into slices; each slice is projected through a pinhole camera
and composited back-to-front, so the motion has real perspective and depth.
"""
import math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30
DUR = 4.0
RED = (191, 0, 46)
FOCAL = 1500.0          # camera focal length in px (close to AE's default 50mm-like view)
LOGO_W = 620.0          # on-screen logo width when facing the camera at rest
DEPTH = 72.0          # extrusion thickness (px at rest distance)
SLICES = 36
CY = 900                # logo center y on screen

LOGO = Image.open(os.path.join(HERE, "ae_project", "assets", "logo_solid_hd.png")).getchannel("A")
SCALE = LOGO_W / LOGO.width
TEX_W, TEX_H = LOGO.width, LOGO.height
ALPHA = LOGO.resize((TEX_W, TEX_H), Image.LANCZOS)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, a, b):
    return clamp((t - a) / (b - a))


def ease_out_back(p, s=1.4):
    p -= 1
    return 1 + (s + 1) * p ** 3 + s * p ** 2


def ease_out(p):
    return 1 - (1 - p) ** 3


def ease_io(p):
    return 3 * p * p - 2 * p ** 3


# ---------------------------------------------------------------- animation curves
def pose(t):
    """Returns (rot_x, rot_y, rot_z in deg, z offset, opacity)."""
    p_in = prog(t, 0.0, 1.6)
    e = ease_out_back(p_in, 1.1) if p_in < 1 else 1.0
    ry = 75 * (1 - e)                        # spins in from nearly edge-on
    rx = 32 * (1 - ease_out(p_in))
    rz = -12 * (1 - ease_out(p_in))
    z = 3000 * (1 - ease_out(p_in))          # flies in from far away
    # hover after landing: turns left then right to show the thickness
    hold = prog(t, 1.7, 3.4)
    ry += -28 * math.sin(ease_io(hold) * 2 * math.pi)
    rx += 7 * math.sin(ease_io(hold) * math.pi)
    z -= 160 * ease_io(hold)                 # slow push-in
    # exit: turns away, recedes and fades
    p_out = prog(t, 3.4, 4.0)
    ry += -60 * ease_io(p_out) ** 2
    z += 900 * ease_io(p_out) ** 2
    op = clamp(p_in * 8) * (1 - ease_io(p_out))
    return rx, ry, rz, z, op


def rot(rx, ry, rz):
    a, b, c = map(math.radians, (rx, ry, rz))
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def homography(dst, src):
    """PIL PERSPECTIVE coefficients mapping output pixel (dst) -> texture pixel (src)."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float))


def shine_texture(t, base, front):
    """Logo face colour with a diagonal light sweep."""
    a = np.asarray(ALPHA, np.float32) / 255.0
    rgb = np.empty((TEX_H, TEX_W, 3), np.float32)
    rgb[:] = base
    if front:
        yy, xx = np.mgrid[0:TEX_H, 0:TEX_W]
        pos = (xx + yy * 0.6) / (TEX_W + TEX_H * 0.6)
        c = lerp_band(t)
        band = np.exp(-((pos - c) / 0.07) ** 2)
        rgb += (255 - rgb) * band[..., None]
    img = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(img, "RGBA")


def lerp_band(t):
    p = prog(t, 1.5, 2.3)
    return -0.3 + 1.6 * ease_io(p) if 0 < p < 1 else -1.0


def background(t):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - CY) / (H * 0.6)) ** 2)
    glow = np.clip(1 - r * 1.6, 0, 1) ** 2
    k = prog(t, 0.3, 1.6) * (1 - prog(t, 3.4, 4.0))
    k *= 1 + 0.08 * math.sin(t * 4.0)
    img = np.zeros((H, W, 3), np.float32)
    img[..., 0] = 70 * glow * k
    img[..., 1] = 2 * glow * k
    img[..., 2] = 14 * glow * k
    return Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")


def render_logo(t):
    rx, ry, rz, zoff, op = pose(t)
    R = rot(rx, ry, rz)
    hw, hh = LOGO.width * SCALE / 2, LOGO.height * SCALE / 2
    dist = FOCAL + zoff
    corners = np.array([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]])
    tex_c = [(0, 0), (TEX_W, 0), (TEX_W, TEX_H), (0, TEX_H)]
    normal_z = (R @ np.array([0, 0, -1.0]))[2]   # <0: front faces the camera
    light = abs((R @ np.array([0, 0, 1.0]))[0])  # sides catch more light when turned

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    slices = []
    for k in range(SLICES + 1):
        d = DEPTH * k / SLICES  # 0 = front face, DEPTH = back face
        pts3 = [R @ np.array([x, y, d - DEPTH / 2]) for x, y in corners]
        cam_z = np.mean([p[2] for p in pts3]) + dist
        slices.append((cam_z, k, pts3))
    slices.sort(key=lambda s: -s[0])  # farthest first

    tex_cache = {}
    for cam_z, k, pts3 in slices:
        is_front, is_back = k == 0, k == SLICES
        if is_front and normal_z > 0.05:
            kind = "side"
        elif is_front:
            kind = "front"
        elif is_back and normal_z < -0.05:
            kind = "side"
        elif is_back:
            kind = "back"
        else:
            kind = "side"
        if kind == "front":
            tex = shine_texture(t, 236, True)
        else:
            shade = 55 + 120 * light - 30 * (k / SLICES) if kind == "side" else 110
            key = int(shade)
            if key not in tex_cache:
                tex_cache[key] = shine_texture(t, (key * 0.97, key * 0.95, key * 0.97), False)
            tex = tex_cache[key]
        proj = []
        for p in pts3:
            z = p[2] + dist
            proj.append((W / 2 + FOCAL * p[0] / z, CY + FOCAL * p[1] / z))
        xs, ys = [p[0] for p in proj], [p[1] for p in proj]
        x0, y0 = int(math.floor(min(xs))) - 2, int(math.floor(min(ys))) - 2
        x1, y1 = int(math.ceil(max(xs))) + 2, int(math.ceil(max(ys))) + 2
        x0c, y0c, x1c, y1c = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1c - x0c < 2 or y1c - y0c < 2:
            continue
        local = [(px - x0c, py - y0c) for px, py in proj]
        try:
            coeffs = homography(local, tex_c)
        except np.linalg.LinAlgError:
            continue  # edge-on, degenerate
        warped = tex.transform((x1c - x0c, y1c - y0c), Image.PERSPECTIVE, tuple(coeffs), Image.BICUBIC)
        layer.alpha_composite(warped, (x0c, y0c))

    if op < 1:
        a = layer.getchannel("A").point(lambda v: int(v * op))
        layer.putalpha(a)
    return layer, op


def red_line(d, t):
    p = ease_out(prog(t, 1.6, 2.1)) * (1 - ease_io(prog(t, 3.4, 3.8)))
    if p <= 0:
        return
    half = 150 * p
    y = CY + LOGO.height * SCALE / 2 + 70
    d.rectangle([W / 2 - half, y - 3, W / 2 + half, y + 3], fill=RED)
    sq = 7 * clamp(p * 3)
    for sx in (W / 2 - half - 16, W / 2 + half + 16):
        if p > 0.95:
            d.rectangle([sx - sq, y - sq, sx + sq, y + sq], fill=RED)


def frame(t):
    bg = background(t)
    logo, op = render_logo(t)
    if op > 0:
        glow = logo.getchannel("A").filter(ImageFilter.GaussianBlur(28))
        g = Image.new("RGBA", (W, H), (255, 255, 255, 0))
        g.putalpha(glow.point(lambda v: int(v * 0.28)))
        bg.alpha_composite(g)
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        shadow.putalpha(logo.getchannel("A").filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * 0.6)))
        bg.alpha_composite(shadow, (0, 22))
        bg.alpha_composite(logo)
    red_line(ImageDraw.Draw(bg), t)
    return bg.convert("RGB")


def main():
    out_dir = os.path.join(HERE, "output")
    os.makedirs(out_dir, exist_ok=True)
    if "--still" in sys.argv:
        i = sys.argv.index("--still")
        frame(float(sys.argv[i + 1])).save(sys.argv[i + 2] if len(sys.argv) > i + 2 else "outro_still.png")
        return
    outro = os.path.join(out_dir, "outro.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-f", "lavfi", "-t", str(DUR), "-i", "anullsrc=r=48000:cl=stereo",
           "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", outro]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(round(DUR * FPS))
    for i in range(n):
        proc.stdin.write(frame(i / FPS).tobytes())
    proc.stdin.close()
    if proc.wait():
        sys.exit("outro encode failed")
    print("wrote", outro)

    if "--append" in sys.argv:
        main_mp4 = sys.argv[sys.argv.index("--append") + 1]
        final = os.path.splitext(main_mp4)[0] + "_with_outro.mp4"
        subprocess.check_call([
            "ffmpeg", "-v", "error", "-y", "-i", main_mp4, "-i", outro, "-filter_complex",
            "[0:v]fps=30,format=yuv420p,setsar=1[v0];[1:v]fps=30,format=yuv420p,setsar=1[v1];"
            "[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];[1:a]aformat=channel_layouts=stereo[a1];"
            "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
            "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])
        print("wrote", final)


if __name__ == "__main__":
    main()
