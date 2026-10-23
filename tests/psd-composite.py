"""Independent raster check. Requires psd-tools, Pillow and numpy (test only).

Usage: python tests/psd-composite.py PATH_TO_PSD_FIXTURES
Generate fixtures first with DOODLE_PSD_OUTPUT set when running psd-export.cjs.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

folder = Path(sys.argv[1])
psd = PSDImage.open(folder / "layers.psd")
expected = np.asarray(Image.open(folder / "expected.png").convert("RGBA"), dtype=np.float64) / 255
# ignore_preview ensures this actually rebuilds the image from editable layers.
actual_image = psd.composite(force=True, ignore_preview=True)
actual = np.asarray(actual_image.convert("RGBA"), dtype=np.float64) / 255
actual_image.save(folder / "rebuilt.png")
# Compare premultiplied color: invisible RGB and low-alpha rounding are harmless.
color_error = np.abs(actual[:, :, :3] * actual[:, :, 3:] - expected[:, :, :3] * expected[:, :, 3:]) * 255
alpha_error = np.abs(actual[:, :, 3] - expected[:, :, 3]) * 255
print(f"Rebuilt PSD: max color error {color_error.max():.3f}, max alpha error {alpha_error.max():.3f} / 255")
assert color_error.max() <= 3, "Editable layers do not reproduce the Doodle colors"
assert alpha_error.max() <= 2, "Editable layers do not reproduce the Doodle transparency"
print("PASS Second independent reader recomposes clipping and nested folder opacity from editable layers")
