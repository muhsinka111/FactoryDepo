"""
IndiaMART product-search scraper for FactoryDepo (multi-source import).

IndiaMART is the CONTACT-RICH source: unlike Alibaba/Made-in-China, its pages
publicly expose seller phone numbers. It is a React SPA, so this scraper uses
hermes web_extract (JS-rendered markdown) like alibaba_scraper.py — run it
from the hermes environment (execute_code), not bare python.

Public data captured per record (all real, from IndiaMART):
  product title, product url, price (INR), unit, seller company name, seller
  website/url, city + years, rating, response rate, image URL, PHONE.

Usage (hermes execute_code):
  from hermes_tools import terminal
  terminal("cd /c/Users/Hp/FactoryDepo && python scripts/import/indiamart_scraper.py --queries 'steel coil'")
"""
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "indiamart_products.jsonl")

QUERIES = [
    "steel coil", "stainless steel sheet", "copper cathode", "copper pipe",
    "aluminum ingot", "aluminum profile", "galvanized steel", "rebar",
    "brass fittings", "zinc ingot", "cnc machine", "laser cutting machine",
    "injection molding machine", "lathe machine", "milling machine",
    "welding machine", "air compressor", "hydraulic pump", "gearbox",
    "electric motor", "diesel generator", "forklift", "conveyor belt",
    "packaging machine", "plastic granules", "pvc resin", "rubber sheet",
    "fiberglass", "ceramic tile", "glass sheet", "plywood", "mdf board",
    "solar panel", "lithium battery", "led lights", "electric cable",
    "transformer", "power inverter", "titanium dioxide", "caustic soda",
    "citric acid", "epoxy resin", "fertilizer", "activated carbon",
    "cotton fabric", "polyester fabric", "bearings", "steel pipe",
    "wire mesh", "industrial pump", "valve", "fasteners",
    "ball valve", "gate valve", "butterfly valve", "check valve",
    "pipe fitting", "flange", "chain", "sprocket", "pulley", "v belt",
    "roller bearing", "linear guide", "welding electrode", "welding wire",
    "plasma cutter", "woodworking machine", "brick making machine",
    "concrete mixer", "excavator parts", "brake pad", "shock absorber",
    "car battery", "tire", "led street light", "led panel light",
    "solar inverter", "power bank", "electric scooter", "e-bike",
    "warehouse rack", "tool cabinet", "hand tools", "power tools",
    "drill", "grinder", "safety gloves", "safety shoes", "hard hat",
    "workwear", "fire extinguisher", "first aid kit", "conveyor roller",
    "crusher", "ball mill", "dryer machine", "granulator", "pellet mill",
    "pp woven bag", "kraft paper", "corrugated box", "stretch film",
    "pallet", "wooden box", "glass bottle", "plastic bottle", "tin can",
    "zipper", "button", "nonwoven fabric", "leather", "tarp", "rope",
    "kitchen sink", "bathroom faucet", "water heater", "air conditioner",
    "refrigeration unit", "ice machine",
]


def clean(s):
    if not s:
        return ""
    return re.sub(r"\*+", "", s).replace("\n", " ").strip()


def parse_markdown(text, query):
    """Parse IndiaMART search markdown into records (products + seller blocks)."""
    records = []
    # product links: [Title](https://export.indiamart.com/products/?id=...)
    # each block runs from one products link to the next; seller company link
    # (export.indiamart.com/company/...) and price (₹...) live inside the block.
    link_re = re.compile(r"\[([^\]]{4,180})\]\((https?://export\.indiamart\.com/products/\?id=[^)\s]+)")
    parts = []
    last = 0
    for m in link_re.finditer(text):
        parts.append((m.start(), m.end(), m.group(1), m.group(2)))
    for i, (start, end, title, url) in enumerate(parts):
        block_end = parts[i + 1][0] if i + 1 < len(parts) else len(text)
        block = text[end:block_end]
        # price: "₹700/ Kg" / "₹ 74/Kg" / "₹ 1.2 Lakh"
        pm = re.search(r"₹\s*([\d,]+(?:\.\d+)?)\s*(?:/\s*([A-Za-z]+))?", block)
        price = None
        unit = "unit"
        if pm:
            try:
                price = float(pm.group(1).replace(",", ""))
            except ValueError:
                price = None
            if pm.group(2):
                unit = pm.group(2).lower()
        if unit not in ("kg", "ton", "tonne", "pcs", "pieces", "set", "meter", "m", "w", "liter", "l"):
            unit = "unit"
        # seller: [Company](https://export.indiamart.com/company/...) inside block
        seller = None
        sm = re.search(r"\[([^\]]{3,90})\]\((https?://export\.indiamart\.com/company/[^)\s]+)", block)
        if sm:
            seller = clean(sm.group(1))
            sup_url = sm.group(2)
        else:
            sup_url = None
        # image: ![alt](img) immediately above the product link
        image = None
        before = text[max(0, start - 300):start]
        im = re.findall(r"!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp)[^)]*)\)", before)
        if im:
            image = im[-1]
        # phone (some listings expose it inline)
        phone = None
        ph = re.search(r"\+91[\s-]?[\d\s-]{9,12}", block)
        if ph:
            phone = re.sub(r"\s+", "", ph.group(0))
        records.append({
            "query": query,
            "title": clean(title)[:180],
            "url": url,
            "image": image,
            "price_low": price,
            "price_high": price,
            "company": seller,
            "supplier_url": sup_url,
            "country": "IN",
            "years": None,
            "rating": None,
            "sold": None,
            "moq": None,
            "moq_unit": None,
            "source": "indiamart.com",
            "phone": phone,
            "email": None,
            "whatsapp": phone,
            "website": None,
        })
    return records


def run_batch(queries, out=OUT, sleep_s=1.5, char_limit=60000, retries=1):
    """Fetch + parse a batch of queries; append records to JSONL (hermes env)."""
    from hermes_tools import web_extract
    os.makedirs(os.path.dirname(out), exist_ok=True)
    total = 0
    for q in queries:
        url = "https://dir.indiamart.com/search.mp?ss=" + q.replace(" ", "+")
        recs = []
        for attempt in range(retries + 1):
            try:
                r = web_extract([url], char_limit=char_limit)
                txt = r["results"][0].get("content") or ""
                recs = parse_markdown(txt, q)
                if recs:
                    break
                print(f"[--] {q} attempt{attempt}: empty")
            except Exception as e:
                print(f"[ERR] {q} attempt{attempt}: {e}")
            time.sleep(sleep_s * 2)
        if recs:
            with open(out, "a", encoding="utf-8") as f:
                for rec in recs:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            total += len(recs)
            print(f"[OK] {q}: {len(recs)} records")
        time.sleep(sleep_s)
    print(f"BATCH DONE: {total} new records -> {out}")
    return total


if __name__ == "__main__":
    args = sys.argv[1:]
    queries = QUERIES
    out = OUT
    if "--queries" in args:
        i = args.index("--queries")
        queries = [x.strip() for x in args[i + 1].split(",") if x.strip()]
    if "--out" in args:
        i = args.index("--out")
        out = args[i + 1]
    run_batch(queries, out)
