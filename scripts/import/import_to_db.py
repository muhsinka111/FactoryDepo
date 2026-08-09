"""Import scraped supplier/product records (JSONL) into the FactoryDepo database.

Multi-source: any B2B source (Alibaba, Made-in-China, IndiaMART, Global Sources,
direct manufacturer sites, ...) can feed records as long as each JSONL line has
the common fields below. `source` (the site) is recorded on the supplier row so
listings stay attributable; contact fields are stored when the source exposes
them publicly and left NULL otherwise.

COUNTRY POLICY (user-mandated): only Türkiye (TR), China (CN), USA (US), Europe
(EU/EEA/CH/UK) and unknown ("Global"/None) are allowed. Records from India and
other non-whitelisted countries are SKIPPED at import time — the marketplace is
TR/CN/US/EU only. See ALLOWED_COUNTRIES below; add ISO codes there to expand.

Creates real supplier rows (each needs a users row — suppliers.userId is NOT NULL
UNIQUE) and product rows. DB-aware: re-running against an existing database reuses
existing users/suppliers by email/companyName and skips products whose title is
already present (idempotent re-import), so it is safe to run per-batch.

Record fields (all optional except title/url/price):
  query, title, url, image, price_low, price_high, company, supplier_url,
  country, years, rating, sold, moq, moq_unit, source,
  email, phone, whatsapp, website   <- contact (only if publicly exposed)

Usage:
  python scripts/import/import_to_db.py [path-to.jsonl ...]
"""

# User-mandated country whitelist: TR / CN / US / Europe / unknown ("Global").
ALLOWED_COUNTRIES = {
    "TR", "CN", "US",                       # core markets
    # Europe (EU + EEA + CH + UK + Balkans + Ukraine)
    "DE", "FR", "IT", "ES", "PT", "NL", "BE", "LU", "AT", "CH", "LI",
    "GB", "IE", "DK", "SE", "NO", "FI", "IS", "EE", "LV", "LT",
    "PL", "CZ", "SK", "HU", "RO", "BG", "GR", "CY", "MT", "SI", "HR",
    "RS", "BA", "ME", "AL", "MK", "UA", "MD",
    # unknown / not attributable -> allowed, shown without a country flag
    "GLOBAL", "NONE", "",
}
import json
import os
import re
import sys

try:
    import psycopg2
except ImportError:
    print("psycopg2 missing — pip install psycopg2-binary")
    sys.exit(1)

DB = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/factorydepo")
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_JSONL = os.path.join(HERE, "data", "alibaba_products.jsonl")

CATEGORY = {
    "steel": "Steel", "galvan": "Steel", "stainless": "Steel", "coil": "Steel",
    "copper": "Metals & Minerals", "aluminum": "Metals & Minerals", "aluminium": "Metals & Minerals",
    "ingot": "Metals & Minerals", "titanium": "Metals & Minerals", "brass": "Metals & Minerals",
    "zinc": "Metals & Minerals", "nickel": "Metals & Minerals", "lead": "Metals & Minerals",
    "tin": "Metals & Minerals", "magnesium": "Metals & Minerals", "silicon": "Metals & Minerals",
    "rare earth": "Metals & Minerals", "tungsten": "Metals & Minerals", "molybdenum": "Metals & Minerals",
    "vanadium": "Metals & Minerals", "cobalt": "Metals & Minerals", "lithium": "Chemicals",
    "graphite": "Chemicals", "rebar": "Steel", "beam": "Steel", "wire": "Steel",
    "pipe": "Steel", "flange": "Machinery", "foil": "Metals & Minerals",
    "cnc": "Machinery", "laser": "Machinery", "machine": "Machinery", "milling": "Machinery",
    "welding": "Machinery", "compressor": "Machinery", "hydraulic": "Machinery",
    "pneumatic": "Machinery", "gear": "Machinery", "motor": "Machinery", "generator": "Machinery",
    "forklift": "Machinery", "conveyor": "Machinery", "packaging": "Packaging",
    "printer": "Machinery", "pump": "Machinery", "valve": "Machinery", "chain": "Machinery",
    "sprocket": "Machinery", "pulley": "Machinery", "belt": "Machinery", "bearing": "Machinery",
    "guide": "Machinery", "screw": "Machinery", "crusher": "Machinery", "mill": "Machinery",
    "kiln": "Machinery", "dryer": "Machinery", "granulator": "Machinery", "pellet": "Machinery",
    "feed": "Machinery", "mixer": "Machinery", "excavator": "Machinery", "tractor": "Machinery",
    "plastic": "Plastic & Rubber", "pvc": "Plastic & Rubber", "hdpe": "Plastic & Rubber",
    "rubber": "Plastic & Rubber", "fiberglass": "Materials", "carbon fiber": "Materials",
    "ceramic": "Materials", "glass": "Materials", "plywood": "Materials", "mdf": "Materials",
    "wood": "Materials", "leather": "Textile", "tarp": "Textile", "rope": "Textile",
    "fabric": "Textile", "yarn": "Textile", "nonwoven": "Textile", "zipper": "Textile",
    "button": "Textile", "thread": "Textile",
    "solar": "Renewable Energy", "lithium battery": "Electronics", "led": "Electronics",
    "cable": "Electronics", "transformer": "Electronics", "pcb": "Electronics",
    "inverter": "Electronics", "battery": "Electronics", "wind turbine": "Renewable Energy",
    "power bank": "Electronics", "scooter": "Automotive", "e-bike": "Automotive",
    "tire": "Automotive", "brake": "Automotive", "shock": "Automotive",
    "titanium dioxide": "Chemicals", "caustic": "Chemicals", "citric": "Chemicals",
    "epoxy": "Chemicals", "resin": "Chemicals", "fertilizer": "Chemicals",
    "pesticide": "Chemicals", "activated carbon": "Chemicals", "paint": "Chemicals",
    "acid": "Chemicals", "soda": "Chemicals", "salt": "Chemicals",
    "sink": "Industrial Equipment", "faucet": "Industrial Equipment", "shower": "Industrial Equipment",
    "heater": "Industrial Equipment", "conditioner": "Industrial Equipment", "refrigeration": "Industrial Equipment",
    "ice machine": "Industrial Equipment", "vending": "Industrial Equipment",
    "rack": "Industrial Equipment", "shelf": "Industrial Equipment", "locker": "Industrial Equipment",
    "tool": "Industrial Equipment", "drill": "Industrial Equipment", "grinder": "Industrial Equipment",
    "saw": "Industrial Equipment", "gloves": "Safety & PPE", "shoes": "Safety & PPE",
    "helmet": "Safety & PPE", "safety": "Safety & PPE", "workwear": "Safety & PPE",
    "extinguisher": "Safety & PPE", "first aid": "Safety & PPE", "cone": "Safety & PPE",
    "bag": "Packaging", "kraft": "Packaging", "corrugated": "Packaging", "film": "Packaging",
    "pallet": "Packaging", "box": "Packaging", "bottle": "Packaging", "jar": "Packaging",
    "can": "Packaging", "net": "Textile", "brick": "Machinery", "concrete": "Machinery",
}


def category_for(query):
    q = query.lower()
    for key, cat in CATEGORY.items():
        if key in q:
            return cat
    return "Industrial"


def clean_company(c):
    if not c:
        return None
    c = re.sub(r"\s+", " ", c).strip()
    c = re.sub(r"\[|\]", "", c)
    # normalize common legal suffixes so "Co., Ltd" and "Co., Ltd." dedupe to one key
    c = re.sub(r"[,.]", "", c)
    c = re.sub(r"\bco\b", "Co", c, flags=re.I)
    c = re.sub(r"\b(?:ltd|limited)\b", "Ltd", c, flags=re.I)
    c = re.sub(r"\b(?:inc|incorporated)\b", "Inc", c, flags=re.I)
    c = re.sub(r"\b(?:llc)\b", "LLC", c, flags=re.I)
    c = re.sub(r"\s+", " ", c).strip()
    if len(c) < 3:
        return None
    return c


def load_records(path):
    recs = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                recs.append(json.loads(line))
            except Exception:
                continue
    return recs


def country_allowed(c):
    """True if a country string passes the TR/CN/US/EU whitelist."""
    if not c:
        return True
    return c.strip().upper() in ALLOWED_COUNTRIES


def main():
    paths = sys.argv[1:] or [DEFAULT_JSONL]
    recs = []
    for p in paths:
        recs.extend(load_records(p))
    before = len(recs)
    # country policy: drop non-whitelisted records (India, etc.) at the door
    recs = [r for r in recs if country_allowed(r.get("country"))]
    dropped = before - len(recs)
    print(f"loaded {before} records from {len(paths)} file(s)"
          + (f" ({dropped} dropped by country policy)" if dropped else ""))

    conn = psycopg2.connect(DB)
    conn.autocommit = False
    cur = conn.cursor()

    # DB-aware lookups so re-imports are idempotent
    cur.execute('SELECT id, "companyName" FROM suppliers')
    existing_sup = {r[1]: r[0] for r in cur.fetchall()}
    cur.execute("SELECT id, email FROM users")
    existing_user = {r[1]: r[0] for r in cur.fetchall()}
    cur.execute("SELECT name FROM products")
    existing_prod = set(r[0] for r in cur.fetchall())

    # dedupe suppliers by cleaned company name (prefer the record with most info)
    suppliers = {}
    for r in recs:
        c = clean_company(r.get("company"))
        if not c:
            continue
        if c not in suppliers:
            suppliers[c] = {
                "company": c,
                "country": r.get("country") or "Global",
                "years": r.get("years"),
                "rating": r.get("rating"),
                "url": r.get("supplier_url"),
                "email": r.get("email"),
                "phone": r.get("phone") or r.get("whatsapp"),
                "website": r.get("website"),
                "source": r.get("source"),
                "queries": set(),
            }
        else:
            # fill in contact/source details if this record carries more info
            for k in ("email", "phone", "website", "source"):
                v = r.get(k)
                if v and not suppliers[c].get(k):
                    suppliers[c][k] = v
        suppliers[c]["queries"].add(r.get("query"))

    # dedupe products by url — prefer the record that carries an image
    prod_by_url = {}
    for r in recs:
        url = r.get("url") or ""
        if not url:
            continue
        c = clean_company(r.get("company"))
        if not c:
            continue
        if not r.get("title") or len(r["title"]) < 8:
            continue
        prev = prod_by_url.get(url)
        if prev is None or (r.get("image") and not prev.get("image")):
            prod_by_url[url] = r
    products = list(prod_by_url.values())

    print(f"unique suppliers: {len(suppliers)} | unique products: {len(products)}")

    # 1) users (role=supplier) — reuse existing by email
    user_ids = {}
    for c in suppliers:
        email = "supplier-" + re.sub(r"[^a-z0-9]", "", c.lower())[:40] + "@import.local"
        base = email
        i = 1
        while email in user_ids.values() or email in existing_user:
            email = base.replace("@import.local", f"-{i}@import.local")
            i += 1
        if email in existing_user:
            user_ids[c] = existing_user[email]
            continue
        cur.execute(
            "INSERT INTO users (email, \"passwordHash\", name, role, company, country, lang, \"trustScore\") "
            "VALUES (%s,%s,%s,%s,%s,%s,'en','0') RETURNING id",
            (email, "$2b$10$imported.supplier.00000000000000000000000000000000000000",
             suppliers[c]["company"], "supplier", suppliers[c]["company"],
             suppliers[c]["country"]),
        )
        user_ids[c] = cur.fetchone()[0]
        existing_user[email] = user_ids[c]

    # 2) suppliers — reuse existing by companyName
    sup_ids = {}
    for c, info in suppliers.items():
        if c in existing_sup:
            sup_ids[c] = existing_sup[c]
            continue
        desc = f"Imported from {info.get('source') or 'a public B2B listing'} — {info['company']}."
        if info["url"]:
            desc += f" Store: {info['url']}. Contact via platform (email/phone are not publicly listed)."
        if info["years"]:
            desc += f" {info['years']} years in business."
        tags = sorted(info["queries"])[:5]
        cur.execute(
            "INSERT INTO suppliers (\"userId\", \"companyName\", country, description, "
            "\"verifiedLevel\", rating, \"inspectionsCount\", \"fulfillmentRate\", tags, since, "
            "\"contactEmail\", \"contactPhone\", website, source) "
            "VALUES (%s,%s,%s,%s,1,%s,0,'0',%s::jsonb,%s,%s,%s,%s,%s) RETURNING id",
            (user_ids[c], info["company"], info["country"], desc,
             info["rating"] if info["rating"] is not None else '0',
             json.dumps(tags), info["years"],
             info.get("email"), info.get("phone") or info.get("whatsapp"),
             info.get("website"), info.get("source")),
        )
        sup_ids[c] = cur.fetchone()[0]
        existing_sup[c] = sup_ids[c]

    # 3) products — skip titles already in DB; store source image URL
    inserted = 0
    skipped = 0
    for r in products:
        c = clean_company(r.get("company"))
        title = r["title"][:180]
        if title in existing_prod:
            skipped += 1
            continue
        price = r.get("price_low") or r.get("price_high") or 1
        price_high = r.get("price_high") or price
        moq = r.get("moq") or 1
        unit = (r.get("moq_unit") or "unit").lower()
        if unit not in ("kg", "ton", "tonne", "pcs", "pieces", "set", "meter", "m", "w", "liter", "l"):
            unit = "unit"
        spec = []
        if r.get("moq"):
            spec.append({"key": "MOQ", "value": f"{moq:g} {unit}"})
        if price != price_high:
            spec.append({"key": "Price Range", "value": f"${price:g} - ${price_high:g}"})
        else:
            spec.append({"key": "Unit Price", "value": f"${price:g}"})
        if r.get("rating"):
            spec.append({"key": "Supplier Rating", "value": f"{r['rating']}/5.0"})
        desc = f"Real listing sourced from Alibaba (query: {r.get('query')}). Source: {r['url']}"
        cur.execute(
            "INSERT INTO products (\"supplierId\", name, category, description, spec, price, "
            "currency, unit, moq, \"originCountry\", verified, \"imageUrl\") "
            "VALUES (%s,%s,%s,%s,%s::jsonb,%s,'USD',%s,%s,%s,true,%s) RETURNING id",
            (sup_ids[c], title, category_for(r.get("query") or ""), desc,
             json.dumps(spec), price, unit, moq, r.get("country") or "Global", r.get("image")),
        )
        existing_prod.add(title)
        inserted += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"DONE: {len(suppliers)} suppliers ensured, {inserted} products inserted, {skipped} skipped (already in DB).")


if __name__ == "__main__":
    main()
