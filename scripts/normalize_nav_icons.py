#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Normalise the nav icons in artifacts/web/src/components.tsx.

Editing emoji through a text patch is unreliable on this host: the icons silently
degraded to empty strings or a lone variation selector, which would ship a sidebar
with blank glyphs. This rewrites each nav row's icon from an explicit code-point
table, so the result is deterministic and re-runnable.

    python scripts/normalize_nav_icons.py
"""
import io
import re
import sys

PATH = r"C:\Users\Hp\FactoryDepo\artifacts\web\src\components.tsx"

ICONS = {
    "feed": "\U0001F3E0",            # house
    "explore": "\U0001F9ED",         # compass
    "categories": "\U0001F5C2\uFE0F",  # card index dividers
    "sell": "\u2795",                # plus
    "offers-buyer": "\U0001F3F7\uFE0F",  # label
    "rfqs": "\U0001F4C4",            # page
    "orders": "\U0001F9FE",          # receipt
    "shipments": "\U0001F69A",       # truck
    "messages": "\U0001F4AC",        # speech balloon
    "saved": "\U0001F516",           # bookmark
    "notifications": "\U0001F514",   # bell
    "help": "\u2753",                # question mark
    "profile": "\U0001F464",         # bust
    "listings": "\U0001F4E6",        # package
    "post": "\u2795",
    "offers-sup": "\U0001F3F7\uFE0F",
    "rfq-opps": "\U0001F4C4",
    "verification": "\U0001F6E1\uFE0F",  # shield
    "overview": "\U0001F3E0",
    "admin-suppliers": "\U0001F69A",
    "admin-verify": "\U0001F6E1\uFE0F",
    "admin-listings": "\U0001F4E6",
    "admin-rfqs": "\U0001F4C4",
    "admin-payments": "\U0001F4B3",  # card
    "sources": "\U0001F50C",         # plug
    "growth": "\U0001F4E3",          # megaphone
    "features": "\u2699\uFE0F",      # gear
    "suppliers": "\U0001F3ED",       # factory
}

# { key: 'x', icon: <anything incl. empty>, label: 'nav.y', path: '/z' },
ROW = re.compile(
    r"^(\s*\{ key: '(?P<key>[a-z][a-z-]*)', icon: )"
    r".*?"
    r"(, label: 'nav\.[^']*', path: '[^']*' \},)$"
)


def main() -> int:
    raw = io.open(PATH, "r", encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    lines = raw.split(nl)

    changed = 0
    unknown = set()
    out = []
    for line in lines:
        m = ROW.match(line)
        if not m:
            out.append(line)
            continue
        key = m.group("key")
        icon = ICONS.get(key)
        if icon is None:
            unknown.add(key)
            out.append(line)
            continue
        rebuilt = "%s'%s'%s" % (m.group(1), icon, m.group(3))
        if rebuilt != line:
            changed += 1
        out.append(rebuilt)

    io.open(PATH, "w", encoding="utf-8", newline="").write(nl.join(out))
    print("nav rows rewritten: %d" % changed)
    if unknown:
        print("no icon defined for: %s" % ", ".join(sorted(unknown)))
    return 0


if __name__ == "__main__":
    sys.exit(main())