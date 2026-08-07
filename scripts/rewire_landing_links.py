import re, sys

p = r"C:\Users\Hp\FactoryDepo\artifacts\landing\variants\marketplace-light.html"
h = open(p, encoding="utf-8").read()

def rewrite(href_for, tag_open_full):
    """For each title in href_for, rewrite the href of its enclosing card/cat anchor."""
    global h
    count = 0
    for title, href in href_for.items():
        idx = h.find(title)
        if idx == -1:
            print("MISS title:", title[:40])
            continue
        start = h.rfind(tag_open_full, 0, idx)
        if start == -1:
            print("MISS tag for:", title[:40])
            continue
        end = h.find(">", start)
        tag = h[start:end + 1]
        new_tag = re.sub(r'href="[^"]*"', 'href="' + href + '"', tag)
        h_ = h[:start] + new_tag + h[end + 1:]
        count += 1
        h = h_
    return h, count

cards = {
    "Copper Cathode 99.99%": "/products?q=copper",
    "Steel Coil Cold Rolled": "/products?q=steel",
    "Lithium Carbonate": "/products?q=lithium",
    "Industrial Pump IE4": "/products?q=pump",
    "Solar Panel 550W": "/products?q=solar",
    "Aluminum Ingot 99.7%": "/products?q=aluminum",
    "CNC Machining Center": "/products?q=cnc",
    "Antimony Ore 50": "/products?q=antimony",
}
h, n1 = rewrite(cards, 'a class="pcard')
print("cards:", n1)

cats = {
    "Metals &amp; Minerals": "/products?category=Metals+%26+Minerals",
    ">Steel<": "/products?category=Steel",
    ">Chemicals<": "/products?category=Chemicals",
    ">Machinery<": "/products?category=Machinery",
    "Industrial Equipment": "/products?category=Industrial+Equipment",
    "Renewable Energy": "/products?category=Renewable+Energy",
    "Aluminum &amp; Metals": "/products?category=Metals+%26+Minerals",
    "Mining &amp; Ore": "/products?category=Metals+%26+Minerals",
    "Plastic &amp; Rubber": "/products?category=Plastic+%26+Rubber",
    ">Packaging<": "/products?category=Packaging",
    ">Automotive<": "/products?category=Automotive",
    ">Electronics<": "/products?category=Electronics",
}
# cat tiles: <a class="cat reveal" ... href="#products"><img ...><span class="nm">NAME</span></a>
h, n2 = rewrite(cats, 'a class="cat')
print("cats:", n2)

open(p, "w", encoding="utf-8", newline="\n").write(h)
print("remaining href=# :", h.count('href="#"'))
