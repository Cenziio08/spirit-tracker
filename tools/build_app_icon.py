"""
Icône du site (onglet du navigateur + écran d'accueil du téléphone) :
l'esprit Jonesy sur un fond violet arrondi. Crée icons/app-192.png,
icons/app-512.png et icons/app-180.png (iPhone).

Usage (depuis le dossier du site) :
    python tools/build_app_icon.py
"""
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPIRIT = os.path.join(ROOT, "tools", ".icon-cache", "182-base.webp")


def make(size, rounded):
    n = 1024
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    t = ((xx + yy) / (2 * n))[..., None]
    top, bottom = np.array([232, 81, 118], np.float32), np.array([46, 24, 21], np.float32)  # BGR
    bg = top * (1 - t) + bottom * t
    glow = np.exp(-((xx - n / 2) ** 2 + (yy - n * 0.42) ** 2) / (2 * (n * 0.3) ** 2))[..., None]
    bg = bg + glow * np.array([120, 80, 60], np.float32)
    canvas = np.clip(bg, 0, 255)

    spirit = cv2.imread(SPIRIT, cv2.IMREAD_UNCHANGED)
    s = int(n * 0.78)
    spirit = cv2.resize(spirit, (s, s), interpolation=cv2.INTER_AREA).astype(np.float32)
    x0, y0 = (n - s) // 2, int(n * 0.12)
    a = spirit[..., 3:4] / 255
    region = canvas[y0:y0 + s, x0:x0 + s]
    canvas[y0:y0 + s, x0:x0 + s] = region * (1 - a) + spirit[..., :3] * a

    alpha = np.full((n, n), 255, np.uint8)
    if rounded:
        r = int(n * 0.22)
        alpha[:] = 0
        cv2.rectangle(alpha, (r, 0), (n - r, n), 255, -1)
        cv2.rectangle(alpha, (0, r), (n, n - r), 255, -1)
        for cx, cy in [(r, r), (n - r, r), (r, n - r), (n - r, n - r)]:
            cv2.circle(alpha, (cx, cy), r, 255, -1, cv2.LINE_AA)
    out = np.dstack([canvas.astype(np.uint8), alpha])
    return cv2.resize(out, (size, size), interpolation=cv2.INTER_AREA)


def main():
    # Android/PC : coins arrondis ; iPhone arrondit lui-même (fond plein)
    cv2.imwrite(os.path.join(ROOT, "icons", "app-192.png"), make(192, True))
    cv2.imwrite(os.path.join(ROOT, "icons", "app-512.png"), make(512, False))
    cv2.imwrite(os.path.join(ROOT, "icons", "app-180.png"), make(180, False))
    cv2.imwrite(os.path.join(ROOT, "icons", "favicon-64.png"), make(64, True))
    print("icônes créées")


if __name__ == "__main__":
    main()
