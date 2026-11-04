"""
Fabrique de fausses "photos de téléphone" à partir de captures d'écran du jeu,
pour tester le scanner dans des conditions difficiles : écran vu de biais,
légère rotation, couleurs faussées, flou, bruit, moiré, reflet, compression JPEG.

Usage (depuis le dossier du site) :
    python tools/make_fake_photos.py tests/captures tests/captures/photos
"""
import os
import sys

import cv2
import numpy as np

LEVELS = {
    # angle max (°), décalage max des coins (part de la taille), flou, bruit, moiré, reflet
    "facile": dict(rot=2.0, persp=0.02, blur=1.0, noise=3, moire=0, glare=0.0, wb=0.06, jpeg=85),
    "moyen": dict(rot=4.0, persp=0.05, blur=1.8, noise=6, moire=6, glare=0.25, wb=0.12, jpeg=75),
    "dur": dict(rot=7.0, persp=0.08, blur=2.6, noise=9, moire=10, glare=0.45, wb=0.18, jpeg=65),
}


def fake_photo(img, p, rng):
    h, w = img.shape[:2]
    # 1) l'écran est posé dans une scène plus grande (bord de l'écran, pièce sombre)
    out_w, out_h = 4032, 3024
    scale = rng.uniform(0.80, 0.95) * out_w / w
    sw, sh = w * scale, h * scale
    cx, cy = out_w / 2 + rng.uniform(-80, 80), out_h / 2 + rng.uniform(-80, 80)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[cx - sw / 2, cy - sh / 2], [cx + sw / 2, cy - sh / 2],
                      [cx + sw / 2, cy + sh / 2], [cx - sw / 2, cy + sh / 2]])
    # rotation + perspective (coins déplacés aléatoirement)
    a = np.deg2rad(rng.uniform(-p["rot"], p["rot"]))
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    dst = (dst - [cx, cy]) @ R.T + [cx, cy]
    dst += rng.uniform(-p["persp"], p["persp"], dst.shape) * [sw, sh]
    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    bg = np.full((out_h, out_w, 3), rng.integers(15, 45), np.uint8)
    photo = cv2.warpPerspective(img, M, (out_w, out_h), dst=bg, borderMode=cv2.BORDER_TRANSPARENT,
                                flags=cv2.INTER_LINEAR)
    photo = photo.astype(np.float32)

    # 2) couleurs : balance des blancs, gamma, contraste
    gains = 1 + rng.uniform(-p["wb"], p["wb"], 3)
    photo *= gains
    gamma = rng.uniform(1 - p["wb"], 1 + p["wb"])
    photo = 255 * np.clip(photo / 255, 0, 1) ** gamma
    photo = (photo - 128) * rng.uniform(0.85, 1.05) + 128 + rng.uniform(-15, 10)

    # 3) moiré (interférence entre les pixels de l'écran et le capteur)
    if p["moire"]:
        yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
        f = rng.uniform(0.15, 0.35)
        th = rng.uniform(0, np.pi)
        pattern = np.sin(f * (xx * np.cos(th) + yy * np.sin(th)) + 0.002 * xx * yy / out_w)
        photo += p["moire"] * pattern[..., None]

    # 4) reflet (tache lumineuse douce)
    if p["glare"]:
        yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
        gx, gy = rng.uniform(0.2, 0.8) * out_w, rng.uniform(0.2, 0.8) * out_h
        r = rng.uniform(0.15, 0.3) * out_w
        g = np.exp(-((xx - gx) ** 2 + (yy - gy) ** 2) / (2 * r * r))
        photo = photo * (1 - p["glare"] * g[..., None]) + 255 * p["glare"] * g[..., None]

    # 5) flou + bruit + JPEG
    photo = cv2.GaussianBlur(np.clip(photo, 0, 255), (0, 0), p["blur"])
    photo += rng.normal(0, p["noise"], photo.shape)
    photo = np.clip(photo, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, p["jpeg"]])
    return buf


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    rng = np.random.default_rng(42)
    files = sorted(f for f in os.listdir(src_dir) if f.lower().endswith(".png"))
    for f in files:
        img = cv2.imread(os.path.join(src_dir, f))
        for level, p in LEVELS.items():
            buf = fake_photo(img, p, rng)
            name = f"{os.path.splitext(f)[0]}_{level}.jpg"
            buf.tofile(os.path.join(out_dir, name))
    print(len(files) * len(LEVELS), "photos dans", out_dir)


if __name__ == "__main__":
    main()
