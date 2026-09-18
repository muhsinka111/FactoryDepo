#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Convert the nine generated category covers from PNG to JPEG and drop the PNGs.

These are FactoryDepo-owned, AI-generated CATEGORY-level covers (same provenance
as the existing 38 category photographs). They are only ever rendered on
/categories, the category strip and the rail — never as a listing's photograph,
because a cover is not a picture of the specific lot.

    python scripts/convert_category_covers.py
"""
import io
import os
import sys

from PIL import Image

SRC = r"C:\Users\Hp\FactoryDepo\artifacts\web\public\products"
MAX_EDGE = 900
QUALITY = 80


def main() -> int:
    pngs = sorted(
        f for f in os.listdir(SRC)
        if f.startswith("cat-") and f.lower().endswith(".png")
    )
    if not pngs:
        print("no cat-*.png files found — nothing to do")
        return 0

    for name in pngs:
        src = os.path.join(SRC, name)
        dst = os.path.join(SRC, os.path.splitext(name)[0] + ".jpg")
        before = os.path.getsize(src)

        img = Image.open(src)
        img.load()
        if img.mode in ("RGBA", "LA", "P"):
            # Flatten onto white: a transparent cover would render as a black
            # rectangle in some browsers.
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")

        if max(img.size) > MAX_EDGE:
            ratio = MAX_EDGE / float(max(img.size))
            img = img.resize(
                (max(1, int(img.width * ratio)), max(1, int(img.height * ratio))),
                Image.LANCZOS,
            )

        img.save(dst, "JPEG", quality=QUALITY, optimize=True)
        after = os.path.getsize(dst)
        os.remove(src)
        print("%-22s %7d -> %7d bytes  %dx%d" % (name, before, after, img.width, img.height))

    print("converted %d covers" % len(pngs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
