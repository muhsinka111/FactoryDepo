"""Download Alibaba CDN (alicdn) product images for imported products.

Reads products where imageUrl is set but imageKey is empty, downloads the image
from the alicdn CDN, saves it under artifacts/web/public/products/, and updates
imageKey. Strips alicdn's _300x300 thumbnail suffix to fetch the full-size image.

Usage:
  python scripts/import/fetch_alicdn_images.py [--limit N]
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


def full_url(url):
    """alicdn thumbs look like ....jpg_300x300.jpg -> strip the suffix."""
    return re.sub(r"_\d+x\d+\.(jpg|jpeg|png|webp)$", r".\1", url)


def download(url, timeout=25, retries=2):
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(
                full_url(url),
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            if len(data) < 1000:
                return None
            u = full_url(url)
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
