// Banc d'essai du scanner : captures d'origine + fausses photos de téléphone
// (générées par tools/make_fake_photos.py dans tests/captures/photos).
// À lancer dans la console de la page servie en local :
//   const m = await import('/tests/photo-test.js'); await m.run()
// Référence : tests/captures/reference.json (résultats validés à la main,
// esprit -> maîtrisé ou non, pour chaque capture d'origine).

async function load(path) {
  const blob = await (await fetch(path)).blob();
  return new File([blob], path.split("/").pop(), { type: blob.type || "image/png" });
}

export async function run({ levels = ["png", "facile", "moyen", "dur"], bases } = {}) {
  if (!window.SpiritScanner) await window.SpiritLoadScanner();
  const REF = await (await fetch("/tests/captures/reference.json")).json();
  bases = bases || Object.keys(REF);
  const rows = [], totals = {};
  for (const base of bases) {
    const ref = REF[base];
    for (const level of levels) {
      const path = level === "png" ? `/tests/captures/${base}.png` : `/tests/captures/photos/${base}_${level}.jpg`;
      const t0 = performance.now();
      const res = await window.SpiritScanner.scan([await load(path)]);
      const ms = Math.round(performance.now() - t0);
      const keys = Object.keys(ref);
      const missing = keys.filter(k => !res.found.has(k));
      const wrong = [...res.found.keys()].filter(k => !(k in ref));
      const crown = [...res.found.values()].filter(f => f.key in ref && f.crowned !== ref[f.key]).map(f => f.key);
      const doubt = res.doubtful || [];
      const doubtOk = doubt.filter(d => d.key in ref && !res.found.has(d.key)).length;
      window.__progress = `${rows.length + 1} images (${base}_${level} : ${ms} ms)`;
      rows.push({ photo: `${base}_${level}`, ok: keys.length - missing.length, attendus: keys.length, faux: wrong, couronnes: crown, aVerifier: doubt.length, aVerifierJustes: doubtOk, ms });
      const t = (totals[level] ||= { attendus: 0, trouves: 0, faux: 0, couronnes: 0, aVerifier: 0, aVerifierJustes: 0, ms: 0 });
      t.attendus += keys.length; t.trouves += keys.length - missing.length;
      t.faux += wrong.length; t.couronnes += crown.length; t.ms += ms;
      t.aVerifier += doubt.length; t.aVerifierJustes += doubtOk;
    }
  }
  return { totals, rows };
}
