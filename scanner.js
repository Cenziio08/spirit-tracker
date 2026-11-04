// Scanner de captures d'écran de la collection d'esprits Fortnite.
//
// Principe :
//  1. on repère la grille de cases dans la capture (fonds clairs réguliers) ;
//  2. chaque case est comparée aux empreintes 32x32 de tous les esprits
//     (spirits-fingerprints.js) : l'esprit le plus ressemblant gagne ;
//  3. on cherche la couronne jaune au-dessus de l'esprit (= maîtrisé).
//
// Aucune dépendance à l'ordre des captures ni au tri du jeu : chaque case
// est reconnue par son image. Tout se fait dans le navigateur.

(function () {
  "use strict";

  // Géométrie d'une case du jeu (mesurée sur des captures 1920x1080 :
  // case 135x150, espacement 155x174, icône carrée de 116 px décalée de 10,12)
  const TILE_RATIO = 150 / 135;
  const PITCH_X = 155 / 135;
  const PITCH_Y = 174 / 150;
  const ICON_X = 10 / 135;
  const ICON_Y = 12 / 150;
  const ICON_S = 116 / 135;

  const MATCH_MAX_ERROR = 26;   // au-delà : ce n'est pas un esprit reconnu
  const CROWN_MIN_RATIO = 0.003; // part de pixels "couronne" dans le carré de l'icône

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
    const idx = [];
    const col = [];
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

  // Réduit une empreinte 32x32 en 16x16 (moyenne 2x2 en couleurs prémultipliées)
  function halve(rgba, n) {
    const m = n / 2;
    const out = new Uint8Array(m * m * 4);
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
        if (a > 1e-3) {
          out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a;
        }
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

  async function fileToImageData(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), canvas };
  }

  // Tables de sommes (integral image) pour des moyennes de zone instantanées
  function integral(img) {
    const { width: W, height: H, data } = img;
    const W1 = W + 1;
    const sr = new Float64Array(W1 * (H + 1));
    const sg = new Float64Array(W1 * (H + 1));
    const sb = new Float64Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) {
      let rr = 0, rg = 0, rb = 0;
      const row = (y + 1) * W1, prev = y * W1;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        rr += data[i]; rg += data[i + 1]; rb += data[i + 2];
        sr[row + x + 1] = sr[prev + x + 1] + rr;
        sg[row + x + 1] = sg[prev + x + 1] + rg;
        sb[row + x + 1] = sb[prev + x + 1] + rb;
      }
    }
    return { sr, sg, sb, W, H, W1 };
  }

  // Réduit le carré (x, y, s) de la capture en n x n pixels (moyenne de zone)
  function sampleSquare(sat, x, y, s, n, out) {
    const { sr, sg, sb, W, H, W1 } = sat;
    if (x < 0 || y < 0 || x + s > W || y + s > H) return false;
    const step = s / n;
    for (let j = 0; j < n; j++) {
      const y0 = Math.round(y + j * step), y1 = Math.max(y0 + 1, Math.round(y + (j + 1) * step));
      for (let i = 0; i < n; i++) {
        const x0 = Math.round(x + i * step), x1 = Math.max(x0 + 1, Math.round(x + (i + 1) * step));
        const a = y0 * W1 + x0, b = y0 * W1 + x1, c = y1 * W1 + x0, d = y1 * W1 + x1;
        const area = (x1 - x0) * (y1 - y0);
        const o = (j * n + i) * 3;
        out[o] = (sr[d] - sr[b] - sr[c] + sr[a]) / area;
        out[o + 1] = (sg[d] - sg[b] - sg[c] + sg[a]) / area;
        out[o + 2] = (sb[d] - sb[b] - sb[c] + sb[a]) / area;
      }
    }
    return true;
  }

  /* ---------- Détection de la grille ---------- */

  // Pixels "clairs et peu saturés" = fond des cases
  function lightMask(img) {
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

  // Ouverture morphologique 3x3 (retire le bruit fin)
  function open3(m, W, H) {
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    const pass = (src, dst, isMin, horiz) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let v = isMin ? 1 : 0;
          for (let d = -1; d <= 1; d++) {
            const xx = horiz ? x + d : x, yy = horiz ? y : y + d;
            const s = xx < 0 || yy < 0 || xx >= W || yy >= H ? (isMin ? 0 : 0) : src[yy * W + xx];
            v = isMin ? Math.min(v, s) : Math.max(v, s);
          }
          dst[y * W + x] = v;
        }
      }
    };
    pass(m, tmp, true, true);
    pass(tmp, out, true, false);
    pass(out, tmp, false, true);
    pass(tmp, out, false, false);
    return out;
  }

  function components(m, W, H) {
    const label = new Int32Array(W * H);
    const stack = new Int32Array(W * H);
    const comps = [];
    let next = 1;
    for (let p = 0; p < W * H; p++) {
      if (!m[p] || label[p]) continue;
      let sp = 0, area = 0;
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      stack[sp++] = p; label[p] = next;
      while (sp) {
        const q = stack[--sp];
        const x = q % W, y = (q / W) | 0;
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

  function findCells(img) {
    const W = img.width, H = img.height;
    const lm = lightMask(img);
    const opened = open3(lm, W, H);
    // Les cases font ~135 px en 1080p : on ignore tout ce qui est bien plus petit
    // (lettres, icônes de l'interface). Repli plus permissif pour les petites captures.
    const comps = components(opened, W, H);
    const pick = minSide => comps.filter(c =>
      c.w >= minSide && c.h >= minSide &&
      c.w / c.h > 0.7 && c.w / c.h < 1.1 &&
      c.area / (c.w * c.h) > 0.35);
    let seeds = pick(40);
    if (seeds.length < 2) seeds = pick(24);
    if (!seeds.length) return [];

    const mw = median(seeds.map(s => s.w));
    seeds = seeds.filter(s => s.w > 0.9 * mw && s.w < 1.12 * mw);
    if (!seeds.length) return [];

    const tw = median(seeds.map(s => s.w));
    const th = Math.round(tw * TILE_RATIO);

    const xs = [...new Set(seeds.map(s => s.x))].sort((a, b) => a - b);
    const dx = xs.slice(1).map((x, i) => x - xs[i]).filter(d => d > tw * 0.8);
    const px = dx.length ? Math.min(...dx) : tw * PITCH_X;

    const tol = Math.max(3, tw * 0.025);
    const normal = seeds.filter(s => Math.abs(s.w - tw) <= tol);
    const fullN = normal.filter(s => s.h >= th * 0.95);
    const ys = [...new Set((fullN.length ? fullN : normal).map(s => s.y))].sort((a, b) => a - b);
    const dy = ys.slice(1).map((y, i) => y - ys[i]).filter(d => d > th * 0.8);
    const py = dy.length ? Math.min(...dy) : th * PITCH_Y;

    const x0 = Math.min(...normal.map(s => s.x));
    const y0 = ys[0];
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
          if (s / tw > 0.3) {
            if (top < 0) top = yy;
            bot = yy; count++;
          }
        }
        if (count < th * 0.3) continue;

        const gl = lightFrac(x - gap + 2, x - 2, top, bot);
        const gr = lightFrac(x + tw + 2, x + tw + gap - 2, top, bot);
        if (Math.min(gl, gr) > 0.5) continue;

        const visible = (bot - top + 1) / th;
        if (visible < 0.5) continue;
        cells.push({ x, y, w: tw, h: th, top, bot, visible });
      }
    }
    return cells;
  }

  /* ---------- Reconnaissance ---------- */

  function errorFor(level, sample) {
    const { idx, col } = level;
    let e = 0;
    for (let k = 0, c = 0; k < idx.length; k++, c += 3) {
      const o = idx[k] * 3;
      e += Math.abs(sample[o] - col[c]) + Math.abs(sample[o + 1] - col[c + 1]) + Math.abs(sample[o + 2] - col[c + 2]);
    }
    return idx.length ? e / (idx.length * 3) : Infinity;
  }

  // Placements de l'icône à essayer : normal, et "case sélectionnée" (agrandie)
  function placements(cell) {
    const base = {
      x: cell.x + ICON_X * cell.w,
      y: cell.y + ICON_Y * cell.h,
      s: ICON_S * cell.w
    };
    const k = 1.11;
    const cx = base.x + base.s / 2, cy = base.y + base.s / 2 - 0.055 * cell.h;
    const big = { x: cx - (base.s * k) / 2, y: cy - (base.s * k) / 2, s: base.s * k };
    return [base, big];
  }

  function matchCell(sat, cell, R) {
    const n = R.size, m = n / 2;
    const scale = cell.w / 135;
    const coarseBuf = new Float32Array(m * m * 3);
    const fineBuf = new Float32Array(n * n * 3);

    // 1) passe grossière (16x16) sur tous les esprits
    const coarse = new Float32Array(R.length).fill(Infinity);
    const bestPos = new Array(R.length);
    for (const pl of placements(cell)) {
      for (const jx of [-5, 0, 5]) {
        for (const jy of [-5, 0, 5]) {
          const x = pl.x + jx * scale, y = pl.y + jy * scale;
          if (!sampleSquare(sat, x, y, pl.s, m, coarseBuf)) continue;
          for (let r = 0; r < R.length; r++) {
            const e = errorFor(R[r].coarse, coarseBuf);
            if (e < coarse[r]) { coarse[r] = e; bestPos[r] = { x, y, s: pl.s }; }
          }
        }
      }
    }
    const order = [...coarse.keys()].sort((a, b) => coarse[a] - coarse[b]).slice(0, 8);
    if (!isFinite(coarse[order[0]])) return null;

    // 2) passe fine (32x32) sur les meilleurs candidats, avec recadrage précis
    let best = null, second = Infinity;
    for (const r of order) {
      const p0 = bestPos[r];
      let bestE = Infinity, pos = p0;
      for (const jx of [-3, -1.5, 0, 1.5, 3]) {
        for (const jy of [-3, -1.5, 0, 1.5, 3]) {
          const x = p0.x + jx * scale, y = p0.y + jy * scale;
          if (!sampleSquare(sat, x, y, p0.s, n, fineBuf)) continue;
          const e = errorFor(R[r].fine, fineBuf);
          if (e < bestE) { bestE = e; pos = { x, y, s: p0.s }; }
        }
      }
      if (!best || bestE < best.error) {
        if (best) second = Math.min(second, best.error);
        best = { ref: R[r], error: bestE, pos };
      } else {
        second = Math.min(second, bestE);
      }
    }
    best.second = second;
    return best;
  }

  // Couronne : pixels jaunes au-dessus de l'esprit, là où l'icône est transparente
  function detectCrown(img, match, cell) {
    const { width: W, height: H, data } = img;
    const { x, y, s } = match.pos;
    const n = refs.size, alpha = match.ref.alpha;
    const zx0 = Math.max(0, Math.round(x + 0.40 * s)), zx1 = Math.min(W, Math.round(x + 0.95 * s));
    const zy0 = Math.round(y - 0.06 * s), zy1 = Math.min(H, Math.round(y + 0.30 * s));
    const zyStart = Math.max(0, zy0);
    const zw = Math.max(0, zx1 - zx0), zh = Math.max(0, zy1 - zyStart);
    const mask = new Uint8Array(zw * zh);
    const hues = new Float32Array(zw * zh);
    for (let yy = zyStart; yy < zy1; yy++) {
      for (let xx = zx0; xx < zx1; xx++) {
        const i = (yy * W + xx) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const v = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (v < 140) continue;
        const sat = (255 * (v - mn)) / v;
        if (sat < 110) continue;
        // teinte en échelle OpenCV (0-180)
        let h;
        const d = v - mn;
        if (v === r) h = 60 * (((g - b) / d) % 6);
        else if (v === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
        if (h < 0) h += 360;
        h /= 2;
        if (h < 15 || h > 40) continue;
        // partie de l'icône ? (alors c'est l'esprit, pas la couronne)
        const ax = Math.floor(((xx - x) / s) * n), ay = Math.floor(((yy - y) / s) * n);
        if (ax >= 0 && ay >= 0 && ax < n && ay < n && alpha[ay * n + ax] / 255 >= 0.3) continue;
        const m = (yy - zyStart) * zw + (xx - zx0);
        mask[m] = 1;
        hues[m] = h;
      }
    }

    // On regroupe les pixels jaunes en taches et on ne garde que celles de la
    // teinte dorée de la couronne (~23-27 sur l'échelle 0-180). Écartées :
    // la coche "équipé" (jaune-vert, ~31) et les reflets orangés d'un esprit
    // sur une case sélectionnée (~17). La forme n'est pas fiable : la tête de
    // l'esprit coupe souvent la couronne en plusieurs morceaux.
    const minArea = 15 * (s / 116) * (s / 116);
    const seen = new Uint8Array(zw * zh);
    const stack = [];
    const blobs = [];
    let count = 0;
    for (let p = 0; p < zw * zh; p++) {
      if (!mask[p] || seen[p]) continue;
      let area = 0, hueSum = 0, bx0 = zw, by0 = zh, bx1 = 0, by1 = 0;
      stack.push(p); seen[p] = 1;
      while (stack.length) {
        const q = stack.pop();
        const qx = q % zw, qy = (q / zw) | 0;
        area++; hueSum += hues[q];
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx;
        if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = qx + dx, ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= zw || ny >= zh) continue;
            const r = ny * zw + nx;
            if (mask[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
          }
        }
      }
      if (area < minArea) continue;
      const fill = area / ((bx1 - bx0 + 1) * (by1 - by0 + 1));
      const hue = hueSum / area;
      const isCrown = hue >= 20.5 && hue < 28.5;
      blobs.push({ area, fill: +fill.toFixed(2), hue: +hue.toFixed(1), w: bx1 - bx0 + 1, h: by1 - by0 + 1, isCrown });
      if (isCrown) count += area;
    }
    if (window.SPIRIT_SCANNER_DEBUG) console.log(match.ref.key, { count, s: Math.round(s), blobs });

    const crowned = count >= CROWN_MIN_RATIO * s * s;
    // haut de la case coupé par le défilement : on ne peut pas conclure à "pas de couronne"
    const zoneVisible = cell.top <= zy0 + 0.04 * s;
    return { crowned, certain: crowned || zoneVisible };
  }

  function thumbnail(canvas, cell) {
    const t = document.createElement("canvas");
    t.width = 54; t.height = 60;
    t.getContext("2d").drawImage(canvas, cell.x, cell.y, cell.w, cell.h, 0, 0, 54, 60);
    return t.toDataURL("image/jpeg", 0.7);
  }

  const nextFrame = () => new Promise(r => setTimeout(r, 0));

  /**
   * Analyse des captures. onProgress(fraction, message) est appelé au fil de l'eau.
   * Résultat : { found: Map(key -> {key, crowned, crownCertain, thumb, error}),
   *              unknown: [{thumb, file}], files, cells }
   */
  async function scan(files, onProgress = () => {}) {
    const R = loadRefs();
    const found = new Map();
    const unknown = [];
    let cellsTotal = 0;

    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      onProgress(f / files.length, `Analyse de ${file.name || "la capture " + (f + 1)}…`);
      await nextFrame();

      let img, canvas;
      try {
        ({ data: img, canvas } = await fileToImageData(file));
      } catch (e) {
        console.error(e);
        continue;
      }
      const cells = findCells(img);
      const sat = integral(img);
      await nextFrame();

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const match = matchCell(sat, cell, R);
        if (c % 3 === 2) {
          onProgress((f + (c + 1) / cells.length) / files.length, `Analyse de ${file.name || "la capture " + (f + 1)}…`);
          await nextFrame();
        }
        if (!match) continue;
        if (match.error > MATCH_MAX_ERROR) {
          // case bien visible mais non reconnue : on la signale
          // (les zones d'interface prises pour des cases dépassent 35 : on ne les signale pas)
          if (cell.visible > 0.95 && match.error < 32) {
            unknown.push({ thumb: thumbnail(canvas, cell), file: file.name, error: match.error });
          }
          continue;
        }
        cellsTotal++;
        const crown = detectCrown(img, match, cell);
        const key = match.ref.key;
        const prev = found.get(key);
        if (!prev) {
          found.set(key, {
            key,
            crowned: crown.crowned,
            crownCertain: crown.certain,
            error: match.error,
            thumb: thumbnail(canvas, cell)
          });
        } else {
          prev.crowned = prev.crowned || crown.crowned;
          prev.crownCertain = prev.crownCertain || crown.certain;
          if (match.error < prev.error) {
            prev.error = match.error;
            prev.thumb = thumbnail(canvas, cell);
          }
        }
      }
    }
    onProgress(1, "Analyse terminée");
    return { found, unknown, files: files.length, cells: cellsTotal };
  }

  window.SpiritScanner = { scan, _findCells: findCells };
})();
