// Scanner de la collection d'esprits Fortnite : captures d'écran ET photos
// prises au téléphone (écran vu de biais, couleurs faussées, reflets, flou).
//
// Principe :
//  1. on repère quelques cases sûres (rectangles clairs, même inclinés) ;
//  2. chaque case est "redressée" en une image standard de 135x150 px ;
//  3. ses couleurs sont corrigées grâce à l'étiquette « Niv. » (toujours
//     blanc pur / noir pur dans le jeu) ;
//  4. on vérifie que c'est bien une case (étiquette présente, haut clair),
//     puis on la compare aux empreintes 32x32 de tous les esprits ;
//  5. avec les cases trouvées, on calcule la déformation de toute la grille
//     (perspective comprise) pour aller chercher les autres cases ;
//  6. on cherche la couronne dorée au-dessus de l'esprit (= maîtrisé).
//
// Aucune dépendance à l'ordre des captures ni au tri du jeu. Tout se fait
// dans le navigateur. Prototype et réglages validés : tools/make_fake_photos.py
// + tests/photo-test.js.

(function () {
  "use strict";

  // Case standard (mesurée sur des captures 1920x1080) : 135x150 px,
  // espacement 155x174, icône carrée de 116 px décalée de (10, 12).
  const TW = 135, TH = 150;
  const IX = 10, IY = 12, IS = 116;
  const PX = 155 / 135, PY = 174 / 150;

  const WORK_MAX = 2600;        // les grandes photos sont réduites (mémoire des téléphones)
  const SEED_MAX = 1300;        // image réduite pour repérer les premières cases
  const MAX_ERROR = 30;         // au-delà : pas un esprit reconnu
  const STRICT_MAX_ERROR = 26;  // case coupée (capture nette) : seuil d'origine
  const SURE_MAX_ERROR = 26, SURE_MARGIN = 2; // photo : reconnaissance appliquée sans demander
  const UNKNOWN_MAX_ERROR = 40; // vraie case mais esprit inconnu (nouveauté ?)
  const MIN_LABEL_CONTRAST = 75;
  const TOP_MIN = 100;
  const TOP_DARK_MAX = 0.15;
  const LABEL_WHITE = 0.2, LABEL_DARK = 0.06;
  const CROWN_MIN_RATIO = 0.003;

  /* ---------- Empreintes de référence ---------- */

  let refs = null;

  function decodeBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Zones ignorées dans la comparaison : couronne (haut droite) et étiquette "Niv." (bas gauche)
  function ignored(x, y, n) {
    const fx = x / n, fy = y / n;
    return (fx > 0.45 && fy < 0.22) || (fx < 0.55 && fy > 0.86);
  }

  function buildLevel(rgba, n) {
    const idx = [], col = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        if (rgba[i + 3] / 255 > 0.6 && !ignored(x, y, n)) {
          idx.push(y * n + x);
          col.push(rgba[i], rgba[i + 1], rgba[i + 2]);
        }
      }
    }
    return { idx: Int32Array.from(idx), col: Float32Array.from(col) };
  }

  // 32x32 -> 16x16 (moyenne 2x2 en couleurs prémultipliées)
  function halve(rgba, n) {
    const m = n / 2, out = new Uint8Array(m * m * 4);
    for (let y = 0; y < m; y++) {
      for (let x = 0; x < m; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((y * 2 + dy) * n + (x * 2 + dx)) * 4;
            const al = rgba[i + 3] / 255;
            r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al; a += al;
          }
        }
        const o = (y * m + x) * 4;
        if (a > 1e-3) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
        out[o + 3] = Math.round((a / 4) * 255);
      }
    }
    return out;
  }

  function loadRefs() {
    if (refs) return refs;
    const fp = window.SPIRITS_FINGERPRINTS;
    if (!fp) throw new Error("Empreintes manquantes (spirits-fingerprints.js).");
    const n = fp.size;
    refs = Object.entries(fp.data).map(([key, b64]) => {
      const rgba = decodeBase64(b64);
      return {
        key,
        alpha: rgba.filter((_, i) => i % 4 === 3),
        fine: buildLevel(rgba, n),
        coarse: buildLevel(halve(rgba, n), n / 2)
      };
    });
    refs.size = n;
    return refs;
  }

  /* ---------- Image ---------- */

  async function loadImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return { img: ctx.getImageData(0, 0, canvas.width, canvas.height), canvas };
  }

  function downscale(canvas, maxSide) {
    const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const c = document.createElement("canvas");
    c.width = Math.round(canvas.width * s);
    c.height = Math.round(canvas.height * s);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return { img: ctx.getImageData(0, 0, c.width, c.height), s: c.width / canvas.width };
  }

  // Teinte / saturation / valeur à l'échelle d'OpenCV (H 0-180, S et V 0-255)
  function hsv(r, g, b) {
    const v = Math.max(r, g, b), mn = Math.min(r, g, b), d = v - mn;
    const s = v === 0 ? 0 : (255 * d) / v;
    let h = 0;
    if (d > 0) {
      if (v === r) h = 60 * (((g - b) / d) % 6);
      else if (v === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [h / 2, s, v];
  }

  function percentileFromHist(hist, total, p) {
    const target = total * p;
    let acc = 0;
    for (let i = 0; i < hist.length; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return hist.length - 1;
  }

  function percentile(values, p) {
    const s = Float32Array.from(values).sort();
    const pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  /* ---------- 1. Premières cases ("graines") ---------- */

  function erode3(m, W, H) {
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      tmp[p] = x > 0 && x < W - 1 ? m[p - 1] & m[p] & m[p + 1] : 0;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      out[p] = y > 0 && y < H - 1 ? tmp[p - W] & tmp[p] & tmp[p + W] : 0;
    }
    return out;
  }

  function dilate3(m, W, H) {
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      tmp[p] = m[p] | (x > 0 ? m[p - 1] : 0) | (x < W - 1 ? m[p + 1] : 0);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      out[p] = tmp[p] | (y > 0 ? tmp[p - W] : 0) | (y < H - 1 ? tmp[p + W] : 0);
    }
    return out;
  }

  // Enveloppe convexe (chaîne monotone)
  function convexHull(points) {
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of points) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  // Plus petit rectangle orienté contenant l'enveloppe (calipers tournants)
  function minAreaRect(hull) {
    let best = null;
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len === 0) continue;
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len;
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (const h of hull) {
        const u = h[0] * ux + h[1] * uy, v = -h[0] * uy + h[1] * ux;
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
      const area = (maxU - minU) * (maxV - minV);
      if (!best || area < best.area) {
        const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
        best = {
          area,
          cx: cu * ux - cv * uy, cy: cu * uy + cv * ux,
          w: maxU - minU, h: maxV - minV,
          ang: (Math.atan2(uy, ux) * 180) / Math.PI
        };
      }
    }
    return best;
  }

  function findSeeds(canvas) {
    const { img, s } = downscale(canvas, SEED_MAX);
    const W = img.width, H = img.height, data = img.data;
    const V = new Float32Array(W * H), Sat = new Float32Array(W * H);
    const hv = new Float64Array(256), hs = new Float64Array(256);
    for (let p = 0, i = 0; p < W * H; p++, i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const v = Math.max(r, g, b), mn = Math.min(r, g, b);
      V[p] = v; Sat[p] = v === 0 ? 0 : (255 * (v - mn)) / v;
      hv[v]++; hs[Math.min(255, Math.round(Sat[p]))]++;
    }
    const v75 = percentileFromHist(hv, W * H, 0.75), v50 = percentileFromHist(hv, W * H, 0.5);
    const s60 = percentileFromHist(hs, W * H, 0.6);

    // moyenne locale de V (fenêtre ~8 % de l'image) par table de sommes
    const k = (Math.floor(Math.max(W, H) * 0.08) | 1), r = k >> 1;
    const W1 = W + 1, sum = new Float64Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += V[y * W + x];
        sum[(y + 1) * W1 + x + 1] = sum[y * W1 + x + 1] + row;
      }
    }
    let mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const local = (sum[y1 * W1 + x1] - sum[y0 * W1 + x1] - sum[y1 * W1 + x0] + sum[y0 * W1 + x0]) /
          ((x1 - x0) * (y1 - y0));
        const p = y * W + x, v = V[p];
        mask[p] = ((v > local + 8) || (v > v75)) && Sat[p] < s60 + 20 && v > v50 ? 1 : 0;
      }
    }
    mask = dilate3(erode3(mask, W, H), W, H);

    const seeds = [];
    let m = mask;
    for (let er = 0; er <= 4; er += 2) {
      if (er) m = erode3(erode3(m, W, H), W, H);
      const label = new Int32Array(W * H), stack = new Int32Array(W * H);
      let next = 1;
      for (let p0 = 0; p0 < W * H; p0++) {
        if (!m[p0] || label[p0]) continue;
        let sp = 0, area = 0;
        const rows = new Map();
        stack[sp++] = p0; label[p0] = next;
        while (sp) {
          const q = stack[--sp], x = q % W, y = (q / W) | 0;
          area++;
          const ext = rows.get(y);
          if (!ext) rows.set(y, [x, x]); else { if (x < ext[0]) ext[0] = x; if (x > ext[1]) ext[1] = x; }
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= W) continue;
              const t = yy * W + xx;
              if (m[t] && !label[t]) { label[t] = next; stack[sp++] = t; }
            }
          }
        }
        next++;
        if (area < 300) continue;
        const pts = [];
        rows.forEach((ext, y) => { pts.push([ext[0], y]); if (ext[1] !== ext[0]) pts.push([ext[1], y]); });
        const rect = minAreaRect(convexHull(pts));
        if (!rect) continue;
        let { w, h, ang } = rect;
        if (w > h) { [w, h] = [h, w]; ang += 90; }
        ang = (((ang + 45) % 90) + 90) % 90 - 45;
        w += 2 * er; h += 2 * er;
        if (w < 20 || !(w / h > 0.78 && w / h < 1.0) || area / (w * h) < 0.4) continue;
        seeds.push({ cx: rect.cx / s, cy: rect.cy / s, w: w / s, h: h / s, ang });
      }
    }
    return seeds;
  }

  /* ---------- 1 bis. Grille droite (captures d'écran nettes) ---------- */
  // Méthode d'origine, validée sur captures : repère la grille alignée et
  // garde aussi les cases coupées par le défilement (haut ou bas caché).

  function lightMaskRGB(img) {
    const { width: W, height: H, data } = img;
    const m = new Uint8Array(W * H);
    for (let p = 0, i = 0; p < W * H; p++, i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const v = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = v === 0 ? 0 : (255 * (v - mn)) / v;
      m[p] = v > 150 && s < 110 ? 1 : 0;
    }
    return m;
  }

  function boxComponents(m, W, H) {
    const label = new Int32Array(W * H), stack = new Int32Array(W * H), comps = [];
    let next = 1;
    for (let p = 0; p < W * H; p++) {
      if (!m[p] || label[p]) continue;
      let sp = 0, area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      stack[sp++] = p; label[p] = next;
      while (sp) {
        const q = stack[--sp], x = q % W, y = (q / W) | 0;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const r = yy * W + xx;
            if (m[r] && !label[r]) { label[r] = next; stack[sp++] = r; }
          }
        }
      }
      comps.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
      next++;
    }
    return comps;
  }

  const median = arr => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  function findLatticeCells(img) {
    const W = img.width, H = img.height;
    const lm = lightMaskRGB(img);
    const comps = boxComponents(dilate3(erode3(lm, W, H), W, H), W, H);
    const pick = minSide => comps.filter(c =>
      c.w >= minSide && c.h >= minSide && c.w / c.h > 0.7 && c.w / c.h < 1.1 && c.area / (c.w * c.h) > 0.35);
    let seeds = pick(40);
    if (seeds.length < 2) seeds = pick(24);
    if (!seeds.length) return [];
    const mw = median(seeds.map(s => s.w));
    seeds = seeds.filter(s => s.w > 0.9 * mw && s.w < 1.12 * mw);
    if (!seeds.length) return [];

    const tw = median(seeds.map(s => s.w)), th = Math.round(tw * TH / TW);
    const xs = [...new Set(seeds.map(s => s.x))].sort((a, b) => a - b);
    const dx = xs.slice(1).map((x, i) => x - xs[i]).filter(d => d > tw * 0.8);
    const px = dx.length ? Math.min(...dx) : tw * PX;
    const tol = Math.max(3, tw * 0.025);
    const normal = seeds.filter(s => Math.abs(s.w - tw) <= tol);
    const fullN = normal.filter(s => s.h >= th * 0.95);
    const ys = [...new Set((fullN.length ? fullN : normal).map(s => s.y))].sort((a, b) => a - b);
    const dy = ys.slice(1).map((y, i) => y - ys[i]).filter(d => d > th * 0.8);
    const py = dy.length ? Math.min(...dy) : th * PY;
    const x0 = Math.min(...normal.map(s => s.x)), y0 = ys[0];
    const gap = Math.max(4, Math.round(px - tw));
    const lightFrac = (xa, xb, ya, yb) => {
      xa = Math.max(0, xa); xb = Math.min(W, xb);
      if (xb <= xa || yb <= ya) return 0;
      let s = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) s += lm[y * W + x];
      return s / ((xb - xa) * (yb - ya));
    };
    const cells = [];
    for (let r = -6; r < 8; r++) {
      for (let k = -6; k < 8; k++) {
        const x = Math.round(x0 + k * px), y = Math.round(y0 + r * py);
        if (x < 0 || x + tw > W) continue;
        const ya = Math.max(0, y), yb = Math.min(H, y + th);
        if (yb - ya < th * 0.3) continue;
        let top = -1, bot = -1, count = 0;
        for (let yy = ya; yy < yb; yy++) {
          let s = 0;
          for (let xx = x; xx < x + tw; xx++) s += lm[yy * W + xx];
          if (s / tw > 0.3) { if (top < 0) top = yy; bot = yy; count++; }
        }
        if (count < th * 0.3) continue;
        const gl = lightFrac(x - gap + 2, x - 2, top, bot), gr = lightFrac(x + tw + 2, x + tw + gap - 2, top, bot);
        if (Math.min(gl, gr) > 0.5) continue;
        if ((bot - top + 1) / th < 0.5) continue;
        cells.push({ cx: x + tw / 2, cy: y + th / 2, w: tw, h: th, topVisible: top <= y + 0.06 * th });
      }
    }
    return cells;
  }

  /* ---------- 2-4. Case redressée, couleurs, contrôles, comparaison ---------- */

  // Image standard 135x150 (RGB float) d'une case : centre, taille, angle (degrés)
  function warpTile(img, cx, cy, w, h, ang) {
    const { width: W, height: H, data } = img;
    const out = new Float32Array(TW * TH * 3);
    const a = (ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const sx = w / TW, sy = h / TH;
    for (let v = 0; v < TH; v++) {
      for (let u = 0; u < TW; u++) {
        const du = (u - TW / 2) * sx, dv = (v - TH / 2) * sy;
        const x = cx + ca * du - sa * dv, y = cy + sa * du + ca * dv;
        const o = (v * TW + u) * 3;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue; // hors image : noir
        const fx = x - x0, fy = y - y0;
        const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
        for (let c = 0; c < 3; c++) {
          out[o + c] = (data[i00 + c] * (1 - fx) + data[i10 + c] * fx) * (1 - fy) +
            (data[i01 + c] * (1 - fx) + data[i11 + c] * fx) * fy;
        }
      }
    }
    return out;
  }

  // Étalonnage par l'étiquette « Niv. » : son blanc -> 255, son noir -> 0
  function calibrate(tile) {
    const ch = [[], [], []];
    for (let v = 122; v < 146; v++) for (let u = 8; u < 60; u++) {
      const o = (v * TW + u) * 3;
      ch[0].push(tile[o]); ch[1].push(tile[o + 1]); ch[2].push(tile[o + 2]);
    }
    const wv = ch.map(c => percentile(c, 0.95)), dv = ch.map(c => percentile(c, 0.05));
    if (Math.min(...wv.map((w, i) => w - dv[i])) < MIN_LABEL_CONTRAST) return null;
    const out = new Float32Array(tile.length);
    for (let i = 0; i < tile.length; i++) {
      const c = i % 3;
      out[i] = Math.max(0, Math.min(255, ((tile[i] - dv[c]) * 255) / (wv[c] - dv[c])));
    }
    return out;
  }

  // Haut gauche = fond uni de la case. Du texte sombre à cet endroit veut dire
  // que le cadre est sans doute à cheval : c'est l'étiquette « Niv. » de la
  // case du dessus. La reconnaissance est alors gardée mais « à vérifier ».
  function topDarkFraction(t) {
    let dark = 0, n = 0;
    for (let v = 1; v < 10; v++) for (let u = 6; u < 62; u++) {
      const o = (v * TW + u) * 3;
      if ((t[o] + t[o + 1] + t[o + 2]) / 3 < 70) dark++;
      n++;
    }
    return dark / n;
  }

  // Est-ce bien une case ? (haut clair + étiquette blanche avec texte sombre)
  function looksLikeTile(t) {
    const top = [];
    for (let v = 2; v < 10; v++) for (let u = 8; u < 127; u++) {
      const o = (v * TW + u) * 3;
      top.push((t[o] + t[o + 1] + t[o + 2]) / 3);
    }
    if (percentile(top, 0.5) < TOP_MIN) return false;
    let white = 0, dark = 0, n = 0;
    for (let v = 124; v < 146; v++) for (let u = 10; u < 58; u++) {
      const o = (v * TW + u) * 3;
      const r = t[o], g = t[o + 1], b = t[o + 2];
      const gray = (r + g + b) / 3, sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (gray > 200 && sat < 45) white++;
      if (gray < 70) dark++;
      n++;
    }
    return white / n >= LABEL_WHITE && dark / n >= LABEL_DARK;
  }

  const PAD = 14;
  // Table de sommes de la case (avec bord répliqué) pour échantillonner vite
  function tileIntegral(t) {
    const W = TW + 2 * PAD, H = TH + 2 * PAD, W1 = W + 1;
    const sums = [new Float64Array(W1 * (H + 1)), new Float64Array(W1 * (H + 1)), new Float64Array(W1 * (H + 1))];
    for (let y = 0; y < H; y++) {
      const ty = Math.min(TH - 1, Math.max(0, y - PAD));
      const row = [0, 0, 0];
      for (let x = 0; x < W; x++) {
        const tx = Math.min(TW - 1, Math.max(0, x - PAD));
        const o = (ty * TW + tx) * 3;
        for (let c = 0; c < 3; c++) {
          row[c] += t[o + c];
          sums[c][(y + 1) * W1 + x + 1] = sums[c][y * W1 + x + 1] + row[c];
        }
      }
    }
    return { sums, W1 };
  }

  // Carré (xi, yi, si) de la case -> n x n pixels (moyenne de zone)
  function sample(ti, xi, yi, si, n, out) {
    const { sums, W1 } = ti;
    const step = si / n;
    for (let j = 0; j < n; j++) {
      const y0 = Math.round(yi + PAD + j * step), y1 = Math.max(y0 + 1, Math.round(yi + PAD + (j + 1) * step));
      for (let i = 0; i < n; i++) {
        const x0 = Math.round(xi + PAD + i * step), x1 = Math.max(x0 + 1, Math.round(xi + PAD + (i + 1) * step));
        const a = y0 * W1 + x0, b = y0 * W1 + x1, c = y1 * W1 + x0, d = y1 * W1 + x1;
        const area = (x1 - x0) * (y1 - y0), o = (j * n + i) * 3;
        for (let k = 0; k < 3; k++) out[o + k] = (sums[k][d] - sums[k][b] - sums[k][c] + sums[k][a]) / area;
      }
    }
  }

  function errorFor(level, s) {
    const { idx, col } = level;
    let e = 0;
    for (let k = 0, c = 0; k < idx.length; k++, c += 3) {
      const o = idx[k] * 3;
      e += Math.abs(s[o] - col[c]) + Math.abs(s[o + 1] - col[c + 1]) + Math.abs(s[o + 2] - col[c + 2]);
    }
    return idx.length ? e / (idx.length * 3) : Infinity;
  }

  function matchTile(t, R) {
    const n = R.size, m = n / 2;
    const ti = tileIntegral(t);
    const cb = new Float32Array(m * m * 3), fb = new Float32Array(n * n * 3);
    const coarse = new Float32Array(R.length).fill(Infinity);
    const pos = new Array(R.length);
    // passe grossière : tailles (dont la case "sélectionnée", agrandie) x décalages
    for (const sc of [1, 1.06, 0.94, 1.11]) {
      const s = IS * sc;
      for (const jx of [-6, 0, 6]) for (const jy of [-6, 0, 6]) {
        const xi = Math.round(TW / 2 - s / 2 + (IX + IS / 2 - TW / 2) * sc + jx);
        const yi = Math.round(IY * sc + jy - (sc - 1) * 8), si = Math.round(s);
        if (xi < -10 || yi < -10 || xi + si > TW + 10 || yi + si > TH + 10) continue;
        sample(ti, xi, yi, si, m, cb);
        for (let r = 0; r < R.length; r++) {
          const e = errorFor(R[r].coarse, cb);
          if (e < coarse[r]) { coarse[r] = e; pos[r] = { xi, yi, si }; }
        }
      }
    }
    const order = [...coarse.keys()].sort((a, b) => coarse[a] - coarse[b]).slice(0, 8);
    const results = order.map(r => {
      const p0 = pos[r];
      let be = Infinity, bp = p0;
      for (const jx of [-3, -1.5, 0, 1.5, 3]) for (const jy of [-3, -1.5, 0, 1.5, 3]) {
        const xi = Math.round(p0.xi + jx), yi = Math.round(p0.yi + jy);
        if (xi < -PAD || yi < -PAD || xi + p0.si > TW + PAD || yi + p0.si > TH + PAD) continue;
        sample(ti, xi, yi, p0.si, n, fb);
        const e = errorFor(R[r].fine, fb);
        if (e < be) { be = e; bp = { xi, yi, si: p0.si }; }
      }
      return { ref: R[r], error: be, pos: bp };
    }).sort((a, b) => a.error - b.error);
    return { ...results[0], second: results[1]?.error ?? Infinity };
  }

  // Couronne : taches dorées au-dessus de l'esprit, là où l'icône est transparente
  function detectCrown(t, match) {
    const { xi, yi, si } = match.pos, n = refs.size, alpha = match.ref.alpha;
    const zx0 = Math.trunc(0.40 * si), zx1 = Math.trunc(0.95 * si);
    const zy0 = Math.trunc(-0.06 * si), zy1 = Math.trunc(0.30 * si);
    const zw = zx1 - zx0, zh = zy1 - zy0;
    const mask = new Uint8Array(zw * zh), hues = new Float32Array(zw * zh);
    for (let j = 0; j < zh; j++) {
      const v = yi + zy0 + j, ry = zy0 + j;
      if (v < 0 || v >= TH) continue;
      for (let i = 0; i < zw; i++) {
        const u = xi + zx0 + i, rx = zx0 + i;
        if (u < 0 || u >= TW) continue;
        const o = (v * TW + u) * 3;
        const [h, s, val] = hsv(Math.round(t[o]), Math.round(t[o + 1]), Math.round(t[o + 2]));
        if (h < 17 || h > 31 || s < 70 || val < 110) continue;
        const inIcon = ry >= 0 && ry < si;
        const al = inIcon ? alpha[Math.floor((ry / si) * n) * n + Math.floor((rx / si) * n)] / 255 : 0;
        if (al >= 0.3) continue;
        mask[j * zw + i] = 1; hues[j * zw + i] = h;
      }
    }
    const minArea = 15 * (si / 116) * (si / 116);
    const seen = new Uint8Array(zw * zh), stack = [];
    let count = 0;
    for (let p = 0; p < zw * zh; p++) {
      if (!mask[p] || seen[p]) continue;
      let area = 0, hueSum = 0;
      stack.push(p); seen[p] = 1;
      while (stack.length) {
        const q = stack.pop(), qx = q % zw, qy = (q / zw) | 0;
        area++; hueSum += hues[q];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= zw || ny >= zh) continue;
          const r = ny * zw + nx;
          if (mask[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
      // teinte dorée de la couronne (~23-27) : écarte la coche "équipé" (~31)
      // et les reflets orangés (~17)
      const hue = hueSum / area;
      if (area >= minArea && hue >= 20.5 && hue < 28.5) count += area;
    }
    return count >= CROWN_MIN_RATIO * si * si;
  }

  function tileThumb(raw) {
    const c = document.createElement("canvas");
    c.width = TW; c.height = TH;
    const ctx = c.getContext("2d");
    const id = ctx.createImageData(TW, TH);
    for (let p = 0; p < TW * TH; p++) {
      id.data[p * 4] = raw[p * 3]; id.data[p * 4 + 1] = raw[p * 3 + 1];
      id.data[p * 4 + 2] = raw[p * 3 + 2]; id.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    const s = document.createElement("canvas");
    s.width = 54; s.height = 60;
    s.getContext("2d").drawImage(c, 0, 0, 54, 60);
    return s.toDataURL("image/jpeg", 0.7);
  }

  // Analyse d'un emplacement : null si ce n'est pas une case d'esprit possédé.
  // `lattice` (grille droite d'une capture nette) autorise aussi les cases
  // coupées par le défilement, avec le seuil strict d'origine.
  function tryCell(img, R, cx, cy, w, h, ang, unknown, lattice = null, realign = false) {
    if (lattice) return tryCellOnce(img, R, cx, cy, w, h, ang, unknown, lattice);
    let best = tryCellOnce(img, R, cx, cy, w, h, ang, null, null, UNKNOWN_MAX_ERROR);
    if (!best && realign) {
      // case repérée approximativement (photo délavée, très penchée) : le
      // contrôle « est-ce une case ? » rate car le cadre est décalé. On
      // cherche d'abord l'icône sans ce contrôle, on se recentre dessus, puis
      // on refait le contrôle normalement.
      const loose = tryCellOnce(img, R, cx, cy, w, h, ang, null, null, MAX_ERROR, true);
      if (loose && Math.hypot(loose.cx - cx, loose.cy - cy) <= 0.25 * w) {
        cx = loose.cx; cy = loose.cy;
        best = tryCellOnce(img, R, cx, cy, w, h, ang, null, null, UNKNOWN_MAX_ERROR);
      }
    }
    // On accepte d'abord large (vraie case mais mal cadrée), puis on recadre.
    // le recadrage ne doit pas glisser vers la case voisine (à cheval sur deux)
    const close = t => t && Math.hypot(t.cx - cx, t.cy - cy) <= 0.18 * w;
    if (!close(best)) return null;
    // Photo : la case est souvent un peu décalée / tournée par rapport à la
    // prédiction. On recadre sur l'icône trouvée et on réessaie (léger angle
    // et taille en plus) tant que ça s'améliore.
    for (let round = 0; round < 3 && best.error > 14; round++) {
      let improved = false;
      const from = best;
      for (const [da, ds] of [[0, 1], [-1.5, 1], [1.5, 1], [0, 0.96], [0, 1.04]]) {
        const t = tryCellOnce(img, R, from.cx, from.cy, from.w * ds, from.h * ds, from.ang + da, null, null, UNKNOWN_MAX_ERROR);
        if (close(t) && t.error < best.error - 0.3) { best = t; improved = true; }
      }
      if (!improved) break;
    }
    if (best.error > MAX_ERROR) {
      if (unknown) unknown.push({ cx: best.cx, cy: best.cy, w: best.w, raw: best.raw });
      return null;
    }
    return best;
  }

  function tryCellOnce(img, R, cx, cy, w, h, ang, unknown, lattice = null, maxError = MAX_ERROR, noGate = false) {
    const raw = warpTile(img, cx, cy, w, h, ang);
    const cal = calibrate(raw);
    let t, limit, complete = true;
    if (cal && (noGate || looksLikeTile(cal))) {
      t = cal; limit = maxError;
    } else if (lattice) {
      t = cal || raw; limit = STRICT_MAX_ERROR; complete = false;
    } else {
      return null;
    }
    const match = matchTile(t, R);
    if (match.error > limit) {
      if (unknown && complete && match.error <= UNKNOWN_MAX_ERROR) unknown.push({ cx, cy, w, raw });
      return null;
    }
    // centre corrigé d'après la position de l'icône trouvée
    const { xi, yi, si } = match.pos;
    const sc = si / IS;
    const dx = xi + si / 2 - (IX + IS / 2), dy = yi + si / 2 - (IY + IS / 2) + (sc - 1) * 8;
    const a = (ang * Math.PI) / 180, k = w / TW;
    const crowned = detectCrown(t, match);
    return {
      cx: cx + (dx * Math.cos(a) - dy * Math.sin(a)) * k,
      cy: cy + (dx * Math.sin(a) + dy * Math.cos(a)) * k,
      w, h, ang,
      key: match.ref.key, error: match.error, second: match.second,
      crowned,
      // case coupée en haut : couronne peut-être invisible
      crownCertain: crowned || complete || !!lattice?.topVisible,
      selected: sc > 1.08,
      shifted: complete && topDarkFraction(t) > TOP_DARK_MAX,
      raw
    };
  }

  /* ---------- 5. Grille complète ---------- */

  function solve(A, b) {
    const n = b.length, M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  // moindres carrés : (X^T X) a = X^T y
  function leastSquares(rows, ys) {
    const n = rows[0].length;
    const A = Array.from({ length: n }, () => new Array(n).fill(0)), b = new Array(n).fill(0);
    rows.forEach((r, k) => {
      for (let i = 0; i < n; i++) {
        b[i] += r[i] * ys[k];
        for (let j = 0; j < n; j++) A[i][j] += r[i] * r[j];
      }
    });
    return solve(A, b);
  }

  function rank3(idx) {
    // les indices sont-ils sur une seule droite ?
    if (idx.length < 3) return false;
    const [a] = idx;
    for (let i = 1; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) {
      const b = idx[i], c = idx[j];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1e-6) return true;
    }
    return false;
  }

  // Passage indice de grille (i, j) -> centre dans l'image
  function fitGrid(acc) {
    const ref = acc.reduce((a, b) => (b.error < a.error ? b : a));
    const a = (ref.ang * Math.PI) / 180;
    const u = [Math.cos(a) * ref.w * PX, Math.sin(a) * ref.w * PX];
    const v = [-Math.sin(a) * ref.h * PY, Math.cos(a) * ref.h * PY];
    const det = u[0] * v[1] - u[1] * v[0];
    const idx = [], pts = [];
    for (const t of acc) {
      if (t.selected) continue;
      const dx = t.cx - ref.cx, dy = t.cy - ref.cy;
      const i = (dx * v[1] - dy * v[0]) / det, j = (u[0] * dy - u[1] * dx) / det;
      const ri = Math.round(i), rj = Math.round(j);
      if (Math.abs(i - ri) < 0.3 && Math.abs(j - rj) < 0.3) { idx.push([ri, rj]); pts.push([t.cx, t.cy]); }
    }
    const pitch = Math.hypot(u[0], u[1]);
    const base = (i, j) => [ref.cx + i * u[0] + j * v[0], ref.cy + i * u[1] + j * v[1]];
    if (idx.length < 3 || !rank3(idx)) return { f: base, idx };

    const X = idx.map(([i, j]) => [i, j, 1]);
    const ax = leastSquares(X, pts.map(p => p[0])), ay = leastSquares(X, pts.map(p => p[1]));
    if (!ax || !ay) return { f: base, idx };
    const aff = (i, j) => [ax[0] * i + ax[1] * j + ax[2], ay[0] * i + ay[1] * j + ay[2]];
    if (!(Math.hypot(ax[0], ay[0]) / pitch > 0.7 && Math.hypot(ax[0], ay[0]) / pitch < 1.4)) return { f: base, idx };

    const di = new Set(idx.map(p => p[0])).size, dj = new Set(idx.map(p => p[1])).size;
    if (idx.length >= 6 && di >= 3 && dj >= 3) {
      const rows = [], ys = [];
      idx.forEach(([i, j], k) => {
        const [x, y] = pts[k];
        rows.push([i, j, 1, 0, 0, 0, -i * x, -j * x]); ys.push(x);
        rows.push([0, 0, 0, i, j, 1, -i * y, -j * y]); ys.push(y);
      });
      const hm = leastSquares(rows, ys);
      if (hm) {
        const hom = (i, j) => {
          const z = hm[6] * i + hm[7] * j + 1;
          return [(hm[0] * i + hm[1] * j + hm[2]) / z, (hm[3] * i + hm[4] * j + hm[5]) / z];
        };
        const rep = Math.max(...idx.map(([i, j], k) => Math.hypot(hom(i, j)[0] - pts[k][0], hom(i, j)[1] - pts[k][1])));
        const lo = [Math.min(...idx.map(p => p[0])) - 2, Math.min(...idx.map(p => p[1])) - 2];
        const hi = [Math.max(...idx.map(p => p[0])) + 2, Math.max(...idx.map(p => p[1])) + 2];
        const dev = Math.max(...[[lo[0], lo[1]], [lo[0], hi[1]], [hi[0], lo[1]], [hi[0], hi[1]]]
          .map(([i, j]) => Math.hypot(hom(i, j)[0] - aff(i, j)[0], hom(i, j)[1] - aff(i, j)[1])));
        if (rep < 0.15 * pitch && dev < 0.6 * pitch) return { f: hom, idx };
      }
    }
    return { f: aff, idx };
  }

  const nextFrame = () => new Promise(r => setTimeout(r, 0));

  async function scanImage(img, canvas, R, tick) {
    const unknown = [];
    let acc = [];
    const near = (cx, cy, list, f) => list.some(a => Math.hypot(cx - a.cx, cy - a.cy) < f * a.w);
    // capture nette : la grille droite donne directement toutes les cases.
    // Les cases coupées par le défilement ne sont acceptées que si l'image est
    // vraiment une capture nette (au moins 3 cases entières reconnues de façon
    // très sûre), sinon des bouts de décor d'une photo pourraient passer.
    const lattice = findLatticeCells(img);
    const left = [];
    for (const c of lattice) {
      const t = tryCell(img, R, c.cx, c.cy, c.w, c.h, 0, unknown);
      if (t && !near(t.cx, t.cy, acc, 0.45)) acc.push(t); else if (!t) left.push(c);
    }
    const screenshot = acc.filter(t => t.error <= 20).length >= 3;
    if (screenshot) {
      for (const c of left) {
        if (near(c.cx, c.cy, acc, 0.45)) continue;
        const t = tryCell(img, R, c.cx, c.cy, c.w, c.h, 0, null, c);
        if (t) acc.push(t);
      }
    }
    await tick();
    const seeds = findSeeds(canvas).sort((a, b) => b.w - a.w);
    const fromLattice = acc.length;
    for (const s of seeds) {
      if (near(s.cx, s.cy, acc, 0.45)) continue;
      const t = tryCell(img, R, s.cx, s.cy, s.w, s.h, s.ang, unknown, null, true);
      if (t) acc.push(t);
      if (acc.length - fromLattice >= 8) break;
    }
    await tick();
    if (window.SPIRIT_SCANNER_DEBUG) window.SPIRIT_SCANNER_SEEDS = { lattice: lattice.length, seeds, acc: acc.map(t => [t.key, t.error, t.cx, t.cy, t.w]) };
    if (!acc.length) return { cells: [], doubtful: [], unknown };

    for (let pass = 0; pass < 2; pass++) {
      const { f, idx } = fitGrid(acc);
      if (!idx.length) break;
      const lo = [Math.min(...idx.map(p => p[0])) - 2, Math.min(...idx.map(p => p[1])) - 2];
      const hi = [Math.max(...idx.map(p => p[0])) + 2, Math.max(...idx.map(p => p[1])) + 2];
      const found = [...acc];
      for (let i = lo[0]; i <= hi[0]; i++) {
        for (let j = lo[1]; j <= hi[1]; j++) {
          const [cx, cy] = f(i, j);
          if (near(cx, cy, found, 0.4)) continue;
          if (cx < 0 || cy < 0 || cx >= img.width || cy >= img.height) continue;
          const [x1, y1] = f(i + 0.5, j), [x0, y0] = f(i - 0.5, j);
          const [ex1, ey1] = f(i, j + 0.5), [ex0, ey0] = f(i, j - 0.5);
          const w = Math.hypot(x1 - x0, y1 - y0) / PX, h = Math.hypot(ex1 - ex0, ey1 - ey0) / PY;
          const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
          let t = tryCell(img, R, cx, cy, w, h, ang, unknown);
          if (!t) {
            // la prédiction peut être un peu décalée : on essaie autour
            for (const [ox, oy] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
              t = tryCell(img, R, cx + ox * w, cy + oy * h, w, h, ang, null);
              if (t) break;
            }
          }
          if (t) found.push(t);
        }
        await tick();
      }
      acc = found;
    }
    // inconnus : seulement ceux qui ne recouvrent pas un esprit reconnu
    const realUnknown = unknown.filter(u => !near(u.cx, u.cy, acc, 0.45))
      .filter((u, i, all) => !all.slice(0, i).some(o => Math.hypot(o.cx - u.cx, o.cy - u.cy) < 0.45 * o.w));
    // Seules les reconnaissances nettes (score bas ET bien meilleur que le
    // 2e candidat) sont appliquées ; les autres sont proposées "à vérifier".
    // Sur une capture nette, une très forte ressemblance suffit.
    const sure = t => (!t.shifted && t.error <= SURE_MAX_ERROR && t.second - t.error >= SURE_MARGIN) ||
      (screenshot && t.error <= 20);
    return { cells: acc.filter(sure), doubtful: acc.filter(t => !sure(t)), unknown: realUnknown };
  }

  /**
   * Analyse des captures/photos. onProgress(fraction, message) est appelé au fil de l'eau.
   * Résultat : { found: Map(key -> {key, crowned, crownCertain, thumb, error}),
   *              unknown: [{thumb, file}], files, cells }
   */
  async function scan(files, onProgress = () => {}) {
    const R = loadRefs();
    const found = new Map();
    const doubtful = new Map();
    const unknown = [];
    let cellsTotal = 0;

    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      const label = `Analyse de ${file.name || "l'image " + (f + 1)}…`;
      onProgress(f / files.length, label);
      await nextFrame();

      let img, canvas;
      try {
        ({ img, canvas } = await loadImage(file));
      } catch (e) {
        console.error(e);
        continue;
      }
      let ticks = 0;
      const tick = async () => {
        ticks++;
        onProgress((f + Math.min(0.95, ticks / 14)) / files.length, label);
        await nextFrame();
      };
      const res = await scanImage(img, canvas, R, tick);

      if (window.SPIRIT_SCANNER_DEBUG) window.SPIRIT_SCANNER_CELLS = res.cells.map(c => ({ key: c.key, error: c.error, second: c.second }));
      for (const cell of res.cells) {
        cellsTotal++;
        const prev = found.get(cell.key);
        if (!prev) {
          found.set(cell.key, {
            key: cell.key, crowned: cell.crowned, crownCertain: cell.crownCertain,
            error: cell.error, thumb: tileThumb(cell.raw)
          });
        } else {
          prev.crowned = prev.crowned || cell.crowned;
          prev.crownCertain = prev.crownCertain || cell.crownCertain;
          if (cell.error < prev.error) { prev.error = cell.error; prev.thumb = tileThumb(cell.raw); }
        }
      }
      res.unknown.forEach(u => unknown.push({ thumb: tileThumb(u.raw), file: file.name }));
      for (const cell of res.doubtful) {
        const prev = doubtful.get(cell.key);
        if (!prev || cell.error < prev.error) {
          doubtful.set(cell.key, { key: cell.key, crowned: cell.crowned || !!prev?.crowned, error: cell.error, thumb: tileThumb(cell.raw) });
        }
      }
    }
    // un esprit reconnu de façon sûre sur une autre image n'est plus "à vérifier"
    found.forEach((_, key) => doubtful.delete(key));
    onProgress(1, "Analyse terminée");
    return { found, doubtful: [...doubtful.values()], unknown, files: files.length, cells: cellsTotal };
  }

  window.SpiritScanner = { scan, _debug: { warpTile, calibrate, looksLikeTile, matchTile, loadRefs, loadImage, findSeeds } };
})();
