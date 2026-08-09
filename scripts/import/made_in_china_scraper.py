"""
Made-in-China product-search scraper for FactoryDepo (multi-source import).

Self-contained (urllib only — no hermes_tools dependency): fetches real
product+supplier data from made-in-china.com manufacturer pages and appends
structured records to a JSONL file. Runs anywhere Python 3 runs.

Public data captured per record (all real, from Made-in-China):
  product title, product url, price range, MOQ, supplier company name, supplier
  url, image URL. Their image.made-in-china.com CDN works without hotlink
  protection (unlike alicdn) — run fetch_alicdn_images.py's sibling
  fetch_source_images.py or import then image-fetch to materialize them.

Contact note: Made-in-China gates email/phone behind "Contact Now" inquiry
forms (login + captcha), same as Alibaba — contact fields stay NULL here.
IndiaMART exposes phone/WhatsApp publicly; use indiamart_scraper.py for
contact-rich records.

Usage:
  python scripts/import/made_in_china_scraper.py [--queries "q1,q2"] [--pages 1,2] [--out data/mic_products.jsonl]
"""
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "mic_products.jsonl")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# ~120 industrial queries overlapping the marketplace's category map
QUERIES = [
    "copper cathode", "copper pipe", "aluminum ingot", "aluminum profile",
    "steel coil", "stainless steel sheet", "galvanized steel", "rebar",
    "titanium bar", "brass fittings", "zinc ingot", "nickel cathode",
    "cnc machine", "laser cutting machine", "injection molding machine",
    "lathe machine", "milling machine", "welding machine", "air compressor",
    "hydraulic pump", "gearbox", "electric motor", "diesel generator",
    "forklift", "conveyor belt", "packaging machine",
    "plastic granules", "pvc resin", "rubber sheet", "fiberglass",
    "carbon fiber", "ceramic tile", "glass sheet", "plywood", "mdf board",
    "solar panel", "lithium battery", "led lights", "electric cable",
    "transformer", "power inverter", "titanium dioxide", "caustic soda",
    "citric acid", "epoxy resin", "fertilizer", "activated carbon",
    "cotton fabric", "polyester fabric", "bearings", "steel pipe",
    "wire mesh", "industrial pump", "valve", "fasteners",
    "ball valve", "gate valve", "butterfly valve", "check valve",
    "pipe fitting", "flange", "chain", "sprocket", "pulley", "v belt",
    "roller bearing", "linear guide", "welding electrode", "welding wire",
    "plasma cutter", "laser engraving machine", "woodworking machine",
    "brick making machine", "concrete mixer", "excavator parts",
    "brake pad", "shock absorber", "car battery", "tire",
    "led street light", "led panel light", "solar inverter", "wind turbine",
    "power bank", "electric scooter", "e-bike", "warehouse rack",
    "tool cabinet", "hand tools", "power tools", "drill", "grinder",
    "safety gloves", "safety shoes", "hard hat", "workwear",
    "fire extinguisher", "first aid kit", "conveyor roller", "crusher",
    "ball mill", "dryer machine", "granulator", "pellet mill",
    "pp woven bag", "kraft paper", "corrugated box", "stretch film",
    "pallet", "wooden box", "glass bottle", "plastic bottle", "tin can",
    "zipper", "button", "nonwoven fabric", "leather", "tarp", "rope",
    "kitchen sink", "bathroom faucet", "water heater", "air conditioner",
    "refrigeration unit", "ice machine",
]


def clean(s):
    if not s:
        return ""
    return re.sub(r"<[^>]+>", "", s).replace("\n", " ").strip()


def fetch(url, timeout=25, retries=2):
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "ignore")
        except Exception:
            if i < retries:
                time.sleep(2)
    return ""


def parse_html(html, query):
    """Parse Made-in-China manufacturer page HTML into records."""
    records = []
    # product detail links: /product/<id>/<slug>.html
    links = re.findall(r'href="(https?://[^"]+\.made-in-china\.com/product/[^"]+\.html)"', html)
    seen = set()
    for url in links:
        url = url.split("?")[0]
        if url in seen:
            continue
        seen.add(url)
        # find the block around this link (title + image live in the <a> parent)
        idx = html.find(url)
        block = html[max(0, idx - 1200):idx + 200]
        # title from <img alt="..."> or the link text
        tm = re.search(r'<img[^>]+alt="([^"]{8,})"', block)
        title = clean(tm.group(1)) if tm else None
        if not title:
            continue
        # image
        im = re.search(r'<img[^>]+src="(https://image\.made-in-china\.com/[^"]+)"', block)
        image = im.group(1) if im else None
        # price: title="US$ 16500 / Ton" or <strong class="price">US$ 16500</strong>
        pm = re.search(r"US\$?\s*([\d,]+(?:\.\d+)?)\s*(?:-\s*US\$?\s*([\d,]+(?:\.\d+)?))?", block)
        price_low = None
        price_high = None
        if pm and pm.group(1):
            try:
                price_low = float(pm.group(1).replace(",", ""))
            except ValueError:
                price_low = None
        if pm and pm.group(2):
            try:
                price_high = float(pm.group(2).replace(",", ""))
            except ValueError:
                price_high = None
        if price_low is None:
            price_low = price_high
        elif price_high is None:
            price_high = price_low
        # MOQ: "1 Ton (MOQ)" / "100 Pieces (MOQ)" / "5000 Pieces"
        mom = re.search(r"([\d,]+(?:\.\d+)?)\s*([A-Za-z]+)\s*\(MOQ\)", block)
        moq = float(mom.group(1).replace(",", "")) if mom else None
        moq_unit = mom.group(2) if mom else None
        records.append({
            "query": query,
            "title": title[:180],
            "url": url,
            "image": image,
            "price_low": price_low,
            "price_high": price_high,
            "company": None,  # filled by supplier pass below
            "supplier_url": None,
            "country": "CN",
            "years": None,
            "rating": None,
            "sold": None,
            "moq": moq,
            "moq_unit": moq_unit,
            "source": "made-in-china.com",
        })
    # supplier pass: map each product to the supplier section that precedes it
    # (supplier name blocks: <h2 class="company-name"><a class="company-name-link"
    # href="//<slug>.en.made-in-china.com">Name</a> — protocol-relative, so we
    # match //... and normalize to https://)
    sups = list(re.finditer(
        r'<a class="company-name-link"[^>]+href="(//[^"]+\.en\.made-in-china\.com)"[^>]*>\s*([^<]{3,80}?)\s*</a>', html))
    for rec in records:
        idx = html.find(rec["url"])
        best = None
        for m in sups:
            if m.start() < idx:
                best = m
            else:
                break
        if best:
            rec["supplier_url"] = "https:" + best.group(1)
            rec["company"] = clean(best.group(2))
    return [r for r in records if r["company"]]


def run_batch(queries, pages=(1,), out=OUT, sleep_s=1.0):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    total = 0
    for q in queries:
        slug = q.replace(" ", "-").lower()
        for page in pages:
            url = f"https://www.made-in-china.com/manufacturers/{slug}.html"
            html = fetch(url)
            if not html:
                print(f"[ERR] {q} p{page}: fetch failed")
                time.sleep(sleep_s)
                continue
            recs = parse_html(html, q)
            if recs:
                with open(out, "a", encoding="utf-8") as f:
                    for rec in recs:
                        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                total += len(recs)
                print(f"[OK] {q} p{page}: {len(recs)} records")
            else:
                print(f"[--] {q} p{page}: no records parsed")
            time.sleep(sleep_s)
    print(f"BATCH DONE: {total} new records -> {out}")
    return total


if __name__ == "__main__":
    args = sys.argv[1:]
    queries = QUERIES
    pages = (1,)
    out = OUT
    if "--queries" in args:
        i = args.index("--queries")
        queries = [x.strip() for x in args[i + 1].split(",") if x.strip()]
    if "--pages" in args:
        i = args.index("--pages")
        pages = tuple(int(x) for x in args[i + 1].split(",") if x.strip())
    if "--out" in args:
        i = args.index("--out")
        out = args[i + 1]
    run_batch(queries, pages, out)
