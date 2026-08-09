"""Download product images for ALL imported products (multi-source).

Reads products where imageUrl is set but imageKey is empty, downloads the image
from whatever CDN the source uses (alicdn, image.made-in-china.com, imimg.com),
saves it under artifacts/web/public/products/, and updates imageKey.

CDN quirks handled:
  - alicdn thumbs: "...jpg_300x300.jpg" -> strip the _WxH suffix entirely
    (the base URL already has its own extension; replacing it produced a
    double extension like ....jpg.jpg -> 404).
  - made-in-china / imimg thumbs: "-250x250" / "-200x200" size tokens are
    stripped from the filename to fetch a larger version.

Usage:
  python scripts/import/fetch_source_images.py [--limit N]
"""
import hashlib
import os
import re
import sys
import time
import urllib.request

try:
    import psycopg2
except ImportError:
    print("psycopg2 missing — pip install psycopg2-binary")
    sys.exit(1)

DB = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/factorydepo")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))  # FactoryDepo
IMG_DIR = os.path.join(REPO, "artifacts", "web", "public", "products")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def full_url(url):
    """Normalize thumbnails to a full-size URL for any known CDN."""
    if "alicdn" in url:
        # ...jpg_300x300.jpg -> ...jpg (suffix removal, NOT replacement)
        return re.sub(r"_\d+x\d+\.(jpg|jpeg|png|webp)$", "", url)
    # made-in-china / imimg: strip size tokens like -250x250 / -200x200 / _200x200
    return re.sub(r"[-_]\d+x\d+\.(jpg|jpeg|png|webp)$", r".\1", url)


def download(url, timeout=25, retries=2):
    for i in range(retries + 1):
        try:
            u = full_url(url)
            req = urllib.request.Request(
                u,
                headers={"User-Agent": UA, "Referer": "https://www.google.com/"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            if len(data) < 1000:
                return None
            ext = ".webp" if ".webp" in u else ".png" if ".png" in u else ".jpg"
            name = "ali_" + hashlib.md5(url.encode()).hexdigest()[:12] + ext
            os.makedirs(IMG_DIR, exist_ok=True)
            with open(os.path.join(IMG_DIR, name), "wb") as f:
                f.write(data)
            return f"/products/{name}"
        except Exception:
            if i < retries:
                time.sleep(2)
            else:
                return None
    return None


def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    conn = psycopg2.connect(DB)
    cur = conn.cursor()
    q = ('SELECT id, name, "imageUrl" FROM products '
         'WHERE "imageUrl" IS NOT NULL AND ("imageKey" IS NULL OR "imageKey" = \'\')')
    if limit:
        q += f" LIMIT {limit}"
    cur.execute(q)
    rows = cur.fetchall()
    print(f"{len(rows)} products need images")
    ok = fail = 0
    t0 = time.time()
    for pid, name, url in rows:
        ik = download(url)
        if ik:
            cur.execute('UPDATE products SET "imageKey" = %s WHERE id = %s', (ik, pid))
            ok += 1
        else:
            fail += 1
        if (ok + fail) % 25 == 0:
            conn.commit()
            print(f"...{ok + fail}/{len(rows)} (ok={ok} fail={fail})")
        time.sleep(0.15)
    conn.commit()
    cur.close()
    conn.close()
    print(f"DONE: {ok} images set, {fail} failed, {int(time.time() - t0)}s")


if __name__ == "__main__":
    main()
