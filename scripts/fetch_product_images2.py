"""Download + optimize the 28 new product photos into assets/products/ and web/public/products/."""
import os, urllib.request
from PIL import Image
from io import BytesIO

urls = {
    "stainless-steel-sheet": "https://v3b.fal.media/files/b/0aa54140/xSRGTyvuRa3YRLg_AbINJ_oDkv8oHg.png",
    "zinc-ingot": "https://v3b.fal.media/files/b/0aa54140/UTyawWpU_Vl_KfQGFZugR_ceCH0u4d.png",
    "aluminum-profile": "https://v3b.fal.media/files/b/0aa54140/2A0FYwBToA-bZXYhuaGyS_NsIoGJNy.png",
    "hot-rolled-coil": "https://v3b.fal.media/files/b/0aa54140/J5Opx3TASI-imUBdsuTEy_uzrhzsXf.png",
    "cement-bags": "https://v3b.fal.media/files/b/0aa54140/uLHrwP2sIGJ-IgtRPq6_h_Bg9tCtkp.png",
    "pvc-pipes": "https://v3b.fal.media/files/b/0aa54142/kpP6DzD38tp2qsoi3K0Yc_7tWPNqnH.png",
    "manhole-cover": "https://v3b.fal.media/files/b/0aa54142/l63PRUXw9Qjb8YtXtQPr7_lshWL8Rc.png",
    "steel-structure": "https://v3b.fal.media/files/b/0aa54153/OeagbJLis3xV5mZdjpwxg_l6LaDNt3.png",
    "wind-blade": "https://v3b.fal.media/files/b/0aa54142/nTk9D3nuvJn-oW3ZkyfKz_9Jt0Mfbo.png",
    "corrugated-boxes": "https://v3b.fal.media/files/b/0aa54153/vnTbTr7HrFYPzOBBlQf6u_6ebFufHM.png",
    "rubber-seals": "https://v3b.fal.media/files/b/0aa54144/yQIQWkSX9YM_xqa5gsL57_fDSI4SyS.png",
    "polyester-yarn": "https://v3b.fal.media/files/b/0aa54144/4s1sjIALbqHBANQhU2a1__3wPzOYoc.png",
    "brake-disc": "https://v3b.fal.media/files/b/0aa54155/0d4uRNTZ0LMOEggY1P2nU_iyWRKfzF.png",
    "engine-valves": "https://v3b.fal.media/files/b/0aa54155/EKgYekFTdIu_Ve9mVexzg_TtVFvIRZ.png",
    "alloy-wheel": "https://v3b.fal.media/files/b/0aa54155/zRKsxHt4aylKaqkyfcQ2P_3w1qRnOk.png",
    "caustic-soda": "https://v3b.fal.media/files/b/0aa54145/Iar6E3GdQ2iRFg6o1wzKB_gdwrA04H.png",
    "epoxy-resin": "https://v3b.fal.media/files/b/0aa54145/SD8LSczRqRBlNGRTj0C5N_H0ErxKKH.png",
    "titanium-dioxide": "https://v3b.fal.media/files/b/0aa54145/4JbejsUVrIXcdLD9i0ZAk_gitu0MDQ.png",
    "injection-machine": "https://v3b.fal.media/files/b/0aa54156/SC3CyiAz1F6vO8v5DU6iD_vSlIZ7AT.png",
    "air-compressor": "https://v3b.fal.media/files/b/0aa54146/16_27BAOGoEujueAw8a6e_AGii5vze.png",
    "induction-motor": "https://v3b.fal.media/files/b/0aa54148/CaT01VZvy7hhtN1lKiXyh_s2IPrFcS.png",
    "gearbox": "https://v3b.fal.media/files/b/0aa54148/laLhvu2BNXgFTLH7hllZc_AW86Tbjp.png",
    "hydraulic-press": "https://v3b.fal.media/files/b/0aa54148/R-NU4TuBO6CHsRE-N5l-A_TlMhUXpT.png",
    "plc-controller": "https://v3b.fal.media/files/b/0aa54148/GPfS7QEnRAbHMTt4f14YM_LblMBjTz.png",
    "servo-drive": "https://v3b.fal.media/files/b/0aa54148/8nwefQDD6X2UwLdMRqdOv_7P2hpKvE.png",
    "proximity-sensors": "https://v3b.fal.media/files/b/0aa5415a/DEbB3z8vNiTH1EZMLKdbf_kvV9kOYY.png",
    "solar-inverter": "https://v3b.fal.media/files/b/0aa5415c/Og5JQYuTGwHmFGjoTelJB_q4ApXvom.png",
    "battery-pack": "https://v3b.fal.media/files/b/0aa5414b/OKgjrhAsCAEm_HJr7Z4Zj_wLN69M8V.png",
}

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dests = [os.path.join(root, "assets", "products"), os.path.join(root, "artifacts", "web", "public", "products")]
for d in dests:
    os.makedirs(d, exist_ok=True)

ok, fail = 0, []
for name, url in urls.items():
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        im = Image.open(BytesIO(data)).convert("RGB")
        im = im.resize((800, 800), Image.LANCZOS)
        for d in dests:
            im.save(os.path.join(d, name + ".jpg"), "JPEG", quality=82, optimize=True)
        ok += 1
        print(f"ok {name} {im.size}")
    except Exception as e:
        fail.append((name, str(e)))
        print(f"FAIL {name}: {e}")
print(f"\ndone: {ok}/28, failures: {fail if fail else 'none'}")
