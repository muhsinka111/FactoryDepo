import json, os, urllib.request
from PIL import Image
from io import BytesIO

urls = {
    "copper-cathode": "https://v3b.fal.media/files/b/0aa53d11/3uVo-fViaRwUYzb4-m_Yg_TFQEytrZ.png",
    "steel-coil": "https://v3b.fal.media/files/b/0aa53d11/XOYwBPJxKEm4N3EDhKiv-_qzbDTURX.png",
    "lithium-carbonate": "https://v3b.fal.media/files/b/0aa53d22/hRPIS7JoO9Y8fyWUiPJcp_NoCY8qbo.png",
    "industrial-pump": "https://v3b.fal.media/files/b/0aa53d22/hj3SBSoEBG7MBcd5iHzEX_LAdPuSLO.png",
    "solar-panel": "https://v3b.fal.media/files/b/0aa53d11/rswVW2waw-sd9wBvWQN8e_QBKUvxBO.png",
    "cnc-machine": "https://v3b.fal.media/files/b/0aa53d13/0X0iWt9Ktp6gt_ISiKy-n_bYqDGnDy.png",
    "aluminum-ingot": "https://v3b.fal.media/files/b/0aa53d24/VmRKtyoCqmalmwCUR4qve_U38r3huE.png",
    "antimony-ore": "https://v3b.fal.media/files/b/0aa53d13/sWpoymfWqn7CNpjbHrmJV_a1qgD483.png",
    "plastic-granules": "https://v3b.fal.media/files/b/0aa53d13/oEDq-gn8DR1MhSD3SbDhf_6gTVNAa1.png",
    "kraft-paper": "https://v3b.fal.media/files/b/0aa53d13/po4SQ0-mpEQbpNZmvunDj_aHaP0FvI.png",
}

assets_dir = "C:/Users/Hp/FactoryDepo/assets/products"
public_dir = "C:/Users/Hp/FactoryDepo/artifacts/web/public/products"
os.makedirs(assets_dir, exist_ok=True)
os.makedirs(public_dir, exist_ok=True)

for name, url in urls.items():
    try:
        data = urllib.request.urlopen(url, timeout=60).read()
        im = Image.open(BytesIO(data)).convert("RGB")
        im = im.resize((800, 800), Image.LANCZOS)
        for d in (assets_dir, public_dir):
            im.save(f"{d}/{name}.jpg", "JPEG", quality=84, optimize=True)
        print(f"{name}.jpg ok ({len(data)//1024}KB -> {os.path.getsize(assets_dir+'/'+name+'.jpg')//1024}KB)")
    except Exception as e:
        print(f"{name}.jpg FAILED: {e}")
