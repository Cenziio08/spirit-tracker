"""
Crée icons/<id>-<variante>.webp : copies légères (128 px) des icônes des esprits,
servies par le site lui-même. Nécessaire pour l'image téléchargeable de la
collection (le navigateur refuse de dessiner dans une image à télécharger des
icônes venant d'un autre site), et le site ne dépend plus de fortnite.gg.

À relancer après avoir ajouté des esprits (après build_fingerprints.py, qui
remplit le cache tools/.icon-cache).

Usage (depuis le dossier du site) :
    python tools/build_icons.py
"""
import os
import re
import sys

import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".icon-cache")
OUT = os.path.join(ROOT, "icons")
SIZE = 128


def main():
    src = open(os.path.join(ROOT, "spirits-data.js"), encoding="utf-8").read()
    keys = [f"{a}-{b}" for a, b in re.findall(r'\["(\d+)","[^"]*","[^"]*","[^"]*","([^"]+)"', src)]
    os.makedirs(OUT, exist_ok=True)
    missing, total = [], 0
    for key in keys:
        path = os.path.join(CACHE, key + ".webp")
        img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if img is None:
            missing.append(key)
            continue
        small = cv2.resize(img, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".webp", small, [cv2.IMWRITE_WEBP_QUALITY, 82])
        buf.tofile(os.path.join(OUT, key + ".webp"))
        total += len(buf)
    print(f"{len(keys) - len(missing)} icônes, {total / 1024:.0f} Ko au total")
    if missing:
        print("absentes du cache (lancer build_fingerprints.py d'abord) :", missing)
        return 1


if __name__ == "__main__":
    sys.exit(main())
