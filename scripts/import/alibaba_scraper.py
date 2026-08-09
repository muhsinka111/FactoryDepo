"""
Alibaba product-search scraper for FactoryDepo.
Fetches real product+supplier data from Alibaba search pages via hermes web_extract
(JS-rendered markdown), parses it, and appends structured records to a JSONL file.

Public data captured per record (all real, from Alibaba):
  product title, product url, price range, supplier company name, supplier url,
  country (flag->code), years in business, rating, sold count, category/query.

NOTE: Alibaba hides email/phone behind login + anti-bot on company pages, so
contact info is limited to public company identity (name/country/years/rating).
"""
import json
import os
import re
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "alibaba_products.jsonl")

# ~48 industrial search queries (category diversity for the marketplace)
QUERIES = [
    # metals
    "steel coil", "galvanized steel", "stainless steel sheet", "copper cathode",
    "copper pipe", "aluminum profile", "aluminum sheet", "aluminum ingot",
    "titanium bar", "brass fittings", "zinc ingot", "nickel cathode",
    # machinery
    "cnc machine", "laser cutting machine", "injection molding machine",
    "lathe machine", "milling machine", "welding machine", "air compressor",
    "hydraulic pump", "gearbox", "electric motor", "diesel generator",
    "forklift", "conveyor belt", "packaging machine", "3d printer",
    # materials
    "plastic granules", "pvc resin", "hdpe granules", "rubber sheet",
    "fiberglass", "carbon fiber", "ceramic tile", "glass sheet",
    "plywood", "mdf board",
    # electronics
    "solar panel", "lithium battery", "led lights", "electric cable",
    "transformer", "pcb", "power inverter",
    # chemicals
    "titanium dioxide", "caustic soda", "citric acid", "epoxy resin",
    "fertilizer", "activated carbon",
    # textile & hardware
    "cotton fabric", "polyester fabric", "bearings", "steel pipe",
    "wire mesh", "industrial pump", "valve", "fasteners",
    # ---- extended set (diversity) ----
    "bolt and nut", "stainless steel pipe", "seamless steel pipe", "rebar",
    "aluminum foil", "copper wire", "brass rod", "steel wire",
    "angle steel", "h beam steel", "color coated steel", "galvalume steel",
    "lead ingot", "tin ingot", "magnesium ingot", "silicon metal",
    "nickel sulfate", "lithium hydroxide", "cobalt sulfate", "graphite powder",
    "rare earth", "tungsten carbide", "molybdenum", "vanadium",
    "hydraulic cylinder", "pneumatic cylinder", "gear motor", "servo motor",
    "stepper motor", "water pump", "submersible pump", "vacuum pump",
    "oil pump", "centrifugal pump", "ball valve", "gate valve", "butterfly valve",
    "check valve", "solenoid valve", "pipe fitting", "flange",
    "chain", "sprocket", "pulley", "v belt", "timing belt",
    "bearing ball", "roller bearing", "linear guide", "lead screw",
    "welding electrode", "welding wire", "plasma cutter", "spot welding machine",
    "laser engraving machine", "woodworking machine", "paper cutting machine",
    "bottle filling machine", "shrink wrap machine", "labeling machine",
    "egg tray machine", "brick making machine", "concrete mixer",
    "excavator parts", "tractor parts", "truck parts", "motorcycle parts",
    "brake pad", "shock absorber", "car battery", "tire",
    "led street light", "led panel light", "led strip", "solar inverter",
    "solar water pump", "wind turbine", "power bank", "electric scooter",
    "e-bike", "electric forklift", "pallet jack", "warehouse rack",
    "storage rack", "steel shelf", "locker", "tool cabinet",
    "hand tools", "power tools", "drill", "grinder", "saw blade",
    "safety gloves", "safety shoes", "hard hat", "safety glasses",
    "workwear", "fire extinguisher", "first aid kit", "traffic cone",
    "conveyor roller", "vibrating screen", "crusher", "ball mill",
    "kiln", "dryer machine", "granulator", "pellet mill", "feed machine",
    "pp woven bag", "kraft paper", "corrugated box", "stretch film",
    "pallet", "wooden box", "glass bottle", "plastic bottle", "jar",
    "tin can", "aluminum can", "zipper", "button", "thread",
    "nonwoven fabric", "spandex fabric", "silk fabric", "wool yarn",
    "leather", "artificial leather", "tarp", "rope", "net",
    "kitchen sink", "bathroom faucet", "shower head", "water heater",
    "air conditioner", "refrigeration unit", "ice machine", "vending machine",
]

FLAGS = {
    "🇨🇳": "CN", "🇹🇷": "TR", "🇺🇸": "US", "🇩🇪": "DE", "🇬🇧": "GB",
    "🇮🇳": "IN", "🇻🇳": "VN", "🇰🇷": "KR", "🇯🇵": "JP", "🇮🇹": "IT",
    "🇫🇷": "FR", "🇪🇸": "ES", "🇧🇷": "BR", "🇷🇺": "RU", "🇹🇭": "TH",
    "🇲🇾": "MY", "🇮🇩": "ID", "🇵🇰": "PK", "🇹🇼": "TW", "🇺🇦": "UA",
    "🇦🇪": "AE", "🇵🇱": "PL", "🇳🇱": "NL", "🇨🇦": "CA", "🇦🇺": "AU",
}


def clean(s):
    if not s:
        return ""
    return re.sub(r"\*+", "", s).replace("\n", " ").strip()


def parse_markdown(text, query):
    """Parse product-search markdown into records (incl. real product image URLs)."""
    records = []
    # Product blocks: "## [Title](url)" headings
    parts = re.split(r"\n## \[", "\n## [" + text)
    # image for part i's product lives at the tail of part i-1 (the [![img]](product-url) link)
    pending_images = {}
    for i in range(1, len(parts)):
        prev = parts[i - 1]
        # last product-image link: [![alt](img)](https://www.alibaba.com/product-detail/...)
        im = list(re.finditer(
            r"\[!\[[^\]]*\]\(([^)]+)\)\]\(https://www\.alibaba\.com/product-detail/[^)]*\)",
            prev))
        img = im[-1].group(1) if im else None
        if not img:
            im2 = list(re.finditer(r"!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp)[^)]*)\)", prev))
            img = im2[-1].group(1) if im2 else None
        pending_images[i] = img
    for i in range(1, len(parts)):
        part = parts[i]
        m = re.match(r"([^\]]+)\]\((https?://[^)]+)\)", part)
        if not m:
            continue
        title = clean(m.group(1))
        url = m.group(2).split("?")[0]
        if not title or len(title) < 8:
            continue
        if title.startswith("![") or title.startswith("["):
            continue
        block = part
        image = pending_images.get(i)
        # price
        pm = re.search(r"\$([\d,]+(?:\.\d+)?)\s*(?:-\s*\$?([\d,]+(?:\.\d+)?))?", block)
        price_low = float(pm.group(1).replace(",", "")) if pm else None
        price_high = float(pm.group(2).replace(",", "")) if pm and pm.group(2) else price_low
        # supplier company name + profile url
        sm = re.search(r"\[([^\]]+)\]\((https?://[^)]*company_profile[^)]*)\)", block)
        company = clean(sm.group(1)) if sm else None
        sup_url = sm.group(2).split("?")[0] if sm else None
        if not company:
            # fallback: text near "Co., Ltd." / "Factory" / "Group"
            cm = re.search(r"([A-Z][\w&.\- ]{6,}(?:Co\.,?\s*Ltd\.?|Limited|Factory|Group|Company|Inc\.?))", block)
            company = clean(cm.group(1)) if cm else None
        # country: alicdn flag icons carry alt-text "Flag of CN" (emoji may be stripped)
        country = None
        fm = re.search(r"Flag of ([A-Z]{2})", block)
        if fm:
            country = fm.group(1)
        else:
            # country code immediately before years: "[CN]CN 15 yrs" / "CN 10 yrs"
            cm2 = re.search(r"(?:\[)?([A-Z]{2})(?:\])?\s*(\d{1,2})\s*(?:yrs|years)", block)
            if cm2:
                country = cm2.group(1)
            else:
                for flag, code in FLAGS.items():
                    if flag in block:
                        country = code
                        break
        # years in business
        ym = re.search(r"(\d{1,2})\s*(?:yrs|years?|Yrs)", block)
        years = int(ym.group(1)) if ym else None
        # rating like 4.9/5.0(30)
        rm = re.search(r"(\d\.\d)/5\.0(?:\((\d+)\))?", block)
        rating = float(rm.group(1)) if rm else None
        sold = rm.group(2) if rm and rm.group(2) else None
        # min order
        mom = re.search(r"Min\.? order:?\s*([\d,]+)\s*([a-zA-Z]+)", block)
        moq = float(mom.group(1).replace(",", "")) if mom else None
        moq_unit = mom.group(2) if mom else None
        records.append({
            "query": query,
            "title": title,
            "url": url,
            "image": image,
            "price_low": price_low,
            "price_high": price_high,
            "company": company,
            "supplier_url": sup_url,
            "country": country,
            "years": years,
            "rating": rating,
            "sold": sold,
            "moq": moq,
            "moq_unit": moq_unit,
        })
    return records


def run_batch(queries, pages=(1,), out=OUT, sleep_s=1.0, char_limit=40000, retries=1):
    """Fetch + parse a batch of queries; append records to JSONL."""
    from hermes_tools import web_extract
    os.makedirs(os.path.dirname(out), exist_ok=True)
    total = 0
    for q in queries:
        for page in pages:
            url = ("https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en"
                   f"&SearchText={q.replace(' ', '+')}&tab=all&has4Tab=true&page={page}")
            recs = []
            for attempt in range(retries + 1):
                try:
                    r = web_extract([url], char_limit=char_limit)
                    txt = r["results"][0].get("content") or ""
                    recs = parse_markdown(txt, q)
                    if recs:
                        break
                    print(f"[--] {q} p{page} attempt{attempt}: empty")
                except Exception as e:
                    print(f"[ERR] {q} p{page} attempt{attempt}: {e}")
                time.sleep(sleep_s * 2)
            if recs:
                with open(out, "a", encoding="utf-8") as f:
                    for rec in recs:
                        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                total += len(recs)
                print(f"[OK] {q} p{page}: {len(recs)} records")
            time.sleep(sleep_s)
    print(f"BATCH DONE: {total} new records -> {out}")
    return total
