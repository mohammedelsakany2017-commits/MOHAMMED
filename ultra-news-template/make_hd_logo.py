"""Upscales the extracted logo alpha 4x with edge sharpening so it stays crisp at outro size."""
import os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, "ae_project", "assets", "logo_solid.png")).getchannel("A")
up = src.resize((src.width * 4, src.height * 4), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.2))
a = np.asarray(up, np.float32) / 255.0
a = np.clip((a - 0.5) * 3.2 + 0.5, 0, 1)  # steepen the edge ramp to ~3px
out = Image.new("RGBA", up.size, (255, 255, 255, 0))
out.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
out.save(os.path.join(HERE, "ae_project", "assets", "logo_solid_hd.png"))
print(out.size)
