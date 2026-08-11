"""FactoryDepo görsel optimizasyonu: 1,826 ürün görselini küçült.
- Max boyut: 900px (en büyük kenar)
- Format: JPEG kalite 80 (PNG/WebP -> JPEG, alpha varsa beyaz zemin)
- Orijinal isimler korunur (.jpg/.png/.webp -> .jpg)
- Hedef: 548MB -> ~35MB
"""
import os
import sys
from PIL import Image

SRC = r"C:\Users\Hp\FactoryDepo\artifacts\web\public\products"
MAX_EDGE = 640
QUALITY = 72
EXT_MAP = {'.png': '.jpg', '.webp': '.jpg', '.jpg': '.jpg', '.jpeg': '.jpg'}

def process(path: str) -> tuple[int, int]:
    """(eski_bytes, yeni_bytes)"""
    old = os.path.getsize(path)
    img = Image.open(path)
    img.load()
    # alpha varsa beyaz zemine birleştir
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    # boyut küçült
    w, h = img.size
    if max(w, h) > MAX_EDGE:
        ratio = MAX_EDGE / max(w, h)
        img = img.resize((max(1, int(w * ratio)), max(1, int(h * ratio))), Image.LANCZOS)
    # hedef dosya adı
    ext = os.path.splitext(path)[1].lower()
    target = path if ext in ('.jpg', '.jpeg') else os.path.splitext(path)[0] + '.jpg'
    img.save(target, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    new = os.path.getsize(target)
    if target != path:
        os.remove(path)
    return old, new

def main():
    files = [f for f in os.listdir(SRC) if os.path.splitext(f)[1].lower() in EXT_MAP]
    total_old = total_new = 0
    done = 0
    for f in sorted(files):
        p = os.path.join(SRC, f)
        try:
            o, n = process(p)
            total_old += o
            total_new += n
            done += 1
            if done % 200 == 0:
                print(f"{done}/{len(files)} — {total_old/1e6:.0f}MB -> {total_new/1e6:.0f}MB")
        except Exception as e:
            print(f"HATA {f}: {e}")
    print(f"\nTAMAM: {done} dosya, {total_old/1e6:.1f}MB -> {total_new/1e6:.1f}MB ({total_new/total_old*100:.1f}%)")

if __name__ == '__main__':
    main()
