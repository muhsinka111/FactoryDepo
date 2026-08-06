import json
import time
import urllib.request

BASE = "http://localhost:9091/api"
RUN = str(int(time.time()))  # unique suffix so re-runs don't collide


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


# 1. register buyer
s, buyer = call("POST", "/auth/register", {"name": "Smoke Buyer", "email": f"smoke-buyer-{RUN}@test.co", "password": "smoke12345", "role": "buyer", "company": "Smoke Trading", "country": "Saudi Arabia"})
assert s in (200, 201), (s, buyer)
buyer_token = buyer["token"]
print("1. buyer registered:", buyer["user"]["role"], buyer["user"]["email"])

# 2. duplicate email -> 409
s, dup = call("POST", "/auth/register", {"name": "Dup User", "email": f"smoke-buyer-{RUN}@test.co", "password": "smoke12345"})
assert s == 409, (s, dup)
print("2. duplicate email rejected:", dup)

# 3. login
s, login = call("POST", "/auth/login", {"email": f"smoke-buyer-{RUN}@test.co", "password": "smoke12345"})
assert s == 200
print("3. login ok")

# 4. wrong password -> 401
s, bad = call("POST", "/auth/login", {"email": f"smoke-buyer-{RUN}@test.co", "password": "wrongpass"})
assert s == 401, (s, bad)
print("4. wrong password rejected:", bad)

# 5. buyer posts RFQ
s, rfq = call("POST", "/rfqs", {"title": "Smoke Test Copper Cathode", "category": "Metals & Minerals", "quantity": 25, "unit": "MT", "targetCountry": "Türkiye", "description": "LME Grade A, 99.99%"}, token=buyer_token)
assert s in (200, 201), (s, rfq)
rfq_id = rfq["id"]
print("5. RFQ posted:", rfq["title"], "id", rfq_id, "status", rfq["status"])

# 6. supplier cannot post RFQ -> 403
s, supplier = call("POST", "/auth/register", {"name": "Smoke Supplier", "email": f"smoke-supplier-{RUN}@test.co", "password": "smoke12345", "role": "supplier", "company": "Smoke Metals", "country": "China"})
assert s in (200, 201), (s, supplier)
supplier_token = supplier["token"]
s, forbidden = call("POST", "/rfqs", {"title": "Should Fail", "category": "Steel", "quantity": 1, "unit": "MT"}, token=supplier_token)
assert s == 403, (s, forbidden)
print("6. supplier blocked from RFQs:", forbidden)

# 7. supplier quotes the RFQ
s, quote = call("POST", f"/rfqs/{rfq_id}/quotes", {"price": 8500, "currency": "USD", "leadTimeDays": 30, "notes": "FOB Tianjin, sample available"}, token=supplier_token)
assert s in (200, 201), (s, quote)
print("7. quote submitted:", quote["price"], "USD,", quote["leadTimeDays"], "days")

# 8. buyer viewing RFQ detail sees quote
s, detail = call("GET", f"/rfqs/{rfq_id}")
assert s == 200 and len(detail["quotes"]) == 1
print("8. RFQ detail shows", len(detail["quotes"]), "quote:", detail["quotes"][0]["supplierName"])

# 9. buyer cannot quote -> 403
s, blocked = call("POST", f"/rfqs/{rfq_id}/quotes", {"price": 1, "leadTimeDays": 1}, token=buyer_token)
assert s == 403, (s, blocked)
print("9. buyer blocked from quoting:", blocked)

# 10. unauthenticated /me -> 401
s, me = call("GET", "/me")
assert s == 401, (s, me)
print("10. /me without token rejected")

# 11. product filters
s, filtered = call("GET", "/products?category=Steel&page=1&limit=5")
assert s == 200 and filtered["total"] > 0
print("11. Steel category:", filtered["total"], "results; first:", filtered["items"][0]["name"])

# 12. search
s, q = call("GET", "/products?q=copper")
print("12. search 'copper':", q["total"], "results; first:", q["items"][0]["name"])

print("\nALL SMOKE TESTS PASSED")
