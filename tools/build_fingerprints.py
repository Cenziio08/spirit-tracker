"""
Génère spirits-fingerprints.js : une petite "empreinte" (image 32x32) de
chaque esprit listé dans spirits-data.js. Le scanner de captures d'écran
du site compare les cases du jeu à ces empreintes pour reconnaître les esprits.

À relancer seulement quand tu ajoutes de nouveaux esprits dans spirits-data.js.

Prérequis : pip install opencv-python numpy
Usage (depuis le dossier du site) :
    python tools/build_fingerprints.py
"""
import base64
import concurrent.futures as cf
import json
import os
import re
import sys
import urllib.request

import cv2
import numpy as np

SIZE = 32
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "spirits-data.js")
OUT_JS = os.path.join(ROOT, "spirits-fingerprints.js")
CACHE = os.path.join(ROOT, "tools", ".icon-cache")


def read_spirits():
    src = open(DATA_JS, encoding="utf-8").read()
    base = re.search(r'imageBase:\s*"([^"]+)"', src).group(1)
    rows = re.findall(
        r'\["(\d+)","[^"]*","[^"]*","[^"]*","([^"]+)","[^"]*","([^"]+)"', src)
    return base, rows


def download(base, row):
    sid, variant, img = row
    path = os.path.join(CACHE, f"{sid}-{variant}.webp")
    if not (os.path.exists(path) and os.path.getsize(path) > 0):
        url = img if img.startswith("http") else base + img
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
    return f"{sid}-{variant}", path


def fingerprint(path):
    ic = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if ic is None:
        raise ValueError(f"image illisible : {path}")
    if ic.shape[2] == 3:
        ic = np.dstack([ic, np.full(ic.shape[:2], 255, np.uint8)])
    ic = ic.astype(np.float32)
    a = ic[..., 3:4] / 255.0
    # couleurs prémultipliées par l'alpha, réduites par moyenne de zone
    pre = np.concatenate([ic[..., :3] * a, a * 255.0], axis=2)
    small = cv2.resize(pre, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    alpha = small[..., 3:4] / 255.0
    rgb = np.where(alpha > 1e-3, small[..., :3] / np.maximum(alpha, 1e-3), 0)
    bgr = rgb
    rgba = np.concatenate([bgr[..., ::-1], small[..., 3:4]], axis=2)  # BGR -> RGB
    return base64.b64encode(np.clip(np.round(rgba), 0, 255).astype(np.uint8).tobytes()).decode()


def main():
    os.makedirs(CACHE, exist_ok=True)
    base, rows = read_spirits()
    print(f"{len(rows)} esprits dans spirits-data.js")
    with cf.ThreadPoolExecutor(8) as ex:
        files = list(ex.map(lambda r: download(base, r), rows))
    prints = {}
    for key, path in files:
        prints[key] = fingerprint(path)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// Généré par tools/build_fingerprints.py - ne pas modifier à la main.\n")
        f.write("// Empreintes 32x32 (RGBA, base64) des icônes d'esprits, pour le scanner de captures.\n")
        f.write("window.SPIRITS_FINGERPRINTS = ")
        json.dump({"size": SIZE, "data": prints}, f, separators=(",", ":"))
        f.write(";\n")
    print(f"{len(prints)} empreintes écrites dans {OUT_JS}")


if __name__ == "__main__":
    sys.exit(main())
