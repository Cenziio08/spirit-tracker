// Image partageable de la collection, façon fortnite.gg : une ligne par
// esprit avec ses variantes, couronne au-dessus des maîtrisés, case cochée
// en dessous, compteurs en haut. Suit le filtre de saison choisi.
// Utilise les variables d'app.js (spirits, getState, seasonFilter…).

(function () {
  "use strict";

  const CELL_W = 104, CELL_H = 146, ICON = 92;
  const COL_GAP = 56, MARGIN = 48, HEADER = 190, FOOTER = 70;

  // Couleurs du thème choisi, résolues en vraies couleurs (les variables CSS
  // peuvent contenir color-mix(), que le canvas ne comprend pas)
  function themeColors() {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.append(probe);
    // couleur peinte sur 1 pixel puis relue : donne toujours "rgba(r, g, b, a)"
    // (le navigateur peut renvoyer "color(srgb …)" pour un color-mix)
    const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const read = v => {
      probe.style.color = `var(${v})`;
      pixel.clearRect(0, 0, 1, 1);
      pixel.fillStyle = getComputedStyle(probe).color;
      pixel.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    };
    const c = {
      bg: read("--bg"), panel: read("--panel"), surface: read("--surface"),
      text: read("--text"), muted: read("--muted"), accent: read("--accent"),
      accentText: read("--accent-text"), line: read("--line-strong"),
      owned: read("--owned"), gold: read("--gold"), veil: read("--bg-veil")
    };
    probe.remove();
    const custom = document.documentElement.dataset.theme === "perso";
    c.image = custom && window.SpiritTheme ? window.SpiritTheme.image() : "";
    return c;
  }

  // "rgb(1, 2, 3)" ou "rgba(…)" -> même couleur avec une autre opacité
  function withAlpha(color, alpha) {
    const m = color.match(/[\d.]+/g) || [0, 0, 0];
    return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`;
  }

  function loadUrl(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function loadIcon(spirit) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = spirit.url;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // même couronne que sur le site (dessinée, pas d'image externe)
  function drawCrown(ctx, cx, top, w) {
    const s = w / 62;
    ctx.save();
    ctx.translate(cx - 31 * s, top);
    ctx.scale(s, s);
    const g = ctx.createLinearGradient(0, 0, 0, 42);
    g.addColorStop(0, "#fff27a");
    g.addColorStop(0.5, "#fcd31e");
    g.addColorStop(1, "#e89a00");
    ctx.fillStyle = g;
    ctx.strokeStyle = "#3b2600";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(7, 31); ctx.lineTo(5, 11); ctx.lineTo(19, 22); ctx.lineTo(31, 5);
    ctx.lineTo(43, 22); ctx.lineTo(57, 11); ctx.lineTo(55, 31); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    roundRect(ctx, 7, 30, 48, 9, 2); ctx.fill(); ctx.stroke();
    for (const [x, y] of [[5, 10], [31, 5], [57, 10]]) {
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawCheck(ctx, cx, cy, state, T) {
    const s = 26;
    roundRect(ctx, cx - s / 2, cy - s / 2, s, s, 6);
    if (state.owned) {
      ctx.fillStyle = state.mastered ? "#fce51e" : "#32cd32";
      ctx.fill();
      ctx.strokeStyle = "#16161f";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 6.5, cy + 0.5);
      ctx.lineTo(cx - 1.5, cy + 5.5);
      ctx.lineTo(cx + 7, cy - 5);
      ctx.stroke();
    } else {
      ctx.fillStyle = withAlpha(T.panel, 0.75);
      ctx.fill();
      ctx.strokeStyle = T.line;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function statPill(ctx, x, y, big, total, label, T) {
    const w = 150, h = 62;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = withAlpha(T.panel, 0.8);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = T.text;
    ctx.font = "bold 26px system-ui, 'Segoe UI', Arial, sans-serif";
    const bigW = ctx.measureText(String(big)).width;
    ctx.font = "16px system-ui, 'Segoe UI', Arial, sans-serif";
    const totW = ctx.measureText(` / ${total}`).width;
    const start = x + w / 2 - (bigW + totW) / 2;
    ctx.textAlign = "left";
    ctx.font = "bold 26px system-ui, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(String(big), start, y + 32);
    ctx.font = "16px system-ui, 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = T.muted;
    ctx.fillText(` / ${total}`, start + bigW, y + 32);
    ctx.textAlign = "center";
    ctx.fillStyle = T.muted;
    ctx.font = "bold 11px system-ui, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(label, x + w / 2, y + 52);
  }

  // Esprits à mettre dans l'image : saison choisie, sans les "pas encore sortis"
  // (sauf s'ils sont déjà possédés).
  function pickSpirits() {
    const season = seasonFilter.value;
    const list = spirits.filter(s =>
      (!season || s.season === season) && (!s.unreleased || getState(s).owned));
    // toutes les saisons : rangées de la plus récente à la plus ancienne
    // (sort est stable : l'ordre du jeu est gardé dans chaque saison)
    return season ? list : list.sort((a, b) => seasonValue(b.season) - seasonValue(a.season));
  }

  async function buildImage() {
    const list = pickSpirits();
    // une ligne par esprit (même "parent"), dans l'ordre de la liste
    const groups = [];
    const byParent = new Map();
    for (const s of list) {
      const k = `${s.season}|${s.parent}`;
      if (!byParent.has(k)) { byParent.set(k, []); groups.push(byParent.get(k)); }
      byParent.get(k).push(s);
    }
    if (!groups.length) return null;

    // deux colonnes équilibrées (une seule si peu d'esprits)
    const twoCols = groups.length > 6;
    const split = twoCols ? Math.ceil(groups.length / 2) : groups.length;
    const cols = twoCols ? [groups.slice(0, split), groups.slice(split)] : [groups];
    const colW = cols.map(c => Math.max(...c.map(g => g.length)) * CELL_W);
    const rows = Math.max(...cols.map(c => c.length));
    const W = Math.max(MARGIN * 2 + colW.reduce((a, b) => a + b, 0) + (cols.length - 1) * COL_GAP, 560);
    const H = HEADER + rows * CELL_H + FOOTER;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // fond aux couleurs du thème (ou image de « Mon thème » + voile)
    const T = themeColors();
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    const bgImage = T.image ? await loadUrl(T.image) : null;
    if (bgImage) {
      const k = Math.max(W / bgImage.width, H / bgImage.height);
      const iw = bgImage.width * k, ih = bgImage.height * k;
      ctx.drawImage(bgImage, (W - iw) / 2, (H - ih) / 2, iw, ih);
      ctx.fillStyle = T.veil;
      ctx.fillRect(0, 0, W, H);
    } else {
      const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.8);
      glow.addColorStop(0, withAlpha(T.accent, 0.3));
      glow.addColorStop(1, withAlpha(T.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // en-tête
    const owned = list.filter(s => getState(s).owned).length;
    const mastered = list.filter(s => getState(s).mastered).length;
    ctx.textAlign = "center";
    ctx.fillStyle = T.text;
    ctx.font = "bold 34px system-ui, 'Segoe UI', Arial, sans-serif";
    ctx.fillText("SPIRIT TRACKER", W / 2, 58);
    ctx.fillStyle = T.accentText;
    ctx.font = "18px system-ui, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(seasonFilter.value ? seasonLabel(seasonFilter.value) : "Toutes les saisons", W / 2, 88);
    statPill(ctx, W / 2 - 160, 106, owned, list.length, "POSSÉDÉS", T);
    statPill(ctx, W / 2 + 10, 106, mastered, list.length, "MAÎTRISÉS", T);

    // esprits
    const icons = await Promise.all(list.map(loadIcon));
    const iconOf = new Map(list.map((s, i) => [s, icons[i]]));
    let x0 = MARGIN;
    cols.forEach((col, c) => {
      col.forEach((group, r) => {
        group.forEach((s, i) => {
          const cx = x0 + i * CELL_W + CELL_W / 2, top = HEADER + r * CELL_H;
          const state = getState(s);
          const img = iconOf.get(s);
          if (img) {
            ctx.save();
            if (!state.owned) ctx.globalAlpha = 0.28; // non possédé : estompé
            ctx.drawImage(img, cx - ICON / 2, top + 14, ICON, ICON);
            ctx.restore();
          }
          if (state.mastered) drawCrown(ctx, cx + 10, top + 2, 26);
          drawCheck(ctx, cx, top + 14 + ICON + 18, state, T);
        });
      });
      x0 += colW[c] + COL_GAP;
    });

    // pied de page
    ctx.textAlign = "center";
    ctx.fillStyle = T.muted;
    ctx.font = "15px system-ui, 'Segoe UI', Arial, sans-serif";
    const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    ctx.fillText(`cenziio08.github.io/spirit-tracker · ${date}`, W / 2, H - 30);

    return canvas;
  }

  async function downloadCollectionImage(button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Création de l'image…";
    try {
      const canvas = await buildImage();
      if (!canvas) {
        toast("Aucun esprit à mettre dans l'image pour cette saison.");
        return;
      }
      // JPEG : bien plus léger et rapide à créer qu'un PNG pour ce genre d'image
      const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
      const season = seasonFilter.value || "toutes-saisons";
      const name = `spirit-tracker-${season}.jpg`;
      const file = new File([blob], name, { type: "image/jpeg" });
      // téléphone : feuille de partage (Enregistrer l'image, Snapchat…)
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Ma collection d'esprits" });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
        }
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      toast("Image téléchargée !");
    } catch (error) {
      console.error(error);
      // page ouverte en double-cliquant sur index.html : le navigateur bloque
      toast(location.protocol === "file:"
        ? "Impossible ici : ouvre le site en ligne pour télécharger l'image."
        : "Impossible de créer l'image, réessaie.");
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  window.SpiritCollectionImage = { buildImage, download: downloadCollectionImage };

  const button = document.getElementById("share-image");
  if (button) button.addEventListener("click", () => downloadCollectionImage(button));
})();
