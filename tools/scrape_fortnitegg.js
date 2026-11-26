// Relevé des esprits sur fortnite.gg, pour la mise à jour (« maj ») du site.
// fortnite.gg bloque les téléchargements directs (Cloudflare) : ce code se
// lance dans un onglet ouvert sur https://fortnite.gg/sprites?season=all
// (console du navigateur, ou outil JavaScript du navigateur de Claude).
//
//   1. Coller tout ce fichier, puis :  copy(JSON.stringify(scrapeList()))
//      -> enregistrer dans un fichier, ex. list.json
//      -> python tools/update_spirits.py list.json
//   2. Pour les fiches (ce que fait chaque esprit) :
//        copy(JSON.stringify(await scrapeDetails(["339", "340"])))
//      -> details.json -> python tools/update_details.py details.json
//      (scrapeDetails() sans argument = tous les esprits de la page)

function scrapeList() {
  return [...document.querySelectorAll(".sprite-card")].map(card => {
    const d = card.dataset;
    const img = card.querySelector("img");
    const src = (img && (img.getAttribute("data-src") || img.getAttribute("src"))) || "";
    return {
      id: d.sprite, parent: d.parent, name: d.parentName, rarity: d.rarity,
      variant: d.variant, season: d.season, image: src.split("/").pop(),
      hidden: card.classList.contains("is-hidden")
    };
  });
}

async function scrapeDetails(ids) {
  ids = ids || [...document.querySelectorAll(".sprite-card")].map(c => c.dataset.sprite);
  const clean = s => s.replace(/\s+/g, " ").trim();
  const out = {};
  for (const id of ids) {
    const html = await (await fetch(`/sprites/${id}`)).text();
    const panel = new DOMParser().parseFromString(html, "text/html").querySelector(".sprite-detail-panel");
    if (!panel) { out[id] = null; continue; }
    const fact = label => {
      const f = [...panel.querySelectorAll(".sprite-fact")].find(e => clean(e.querySelector("span")?.textContent || "") === label);
      return f ? clean(f.querySelector("b")?.textContent || "") : "";
    };
    out[id] = {
      bonus: clean(panel.querySelector(".sprite-desc-special")?.textContent || ""),
      desc: [...panel.querySelectorAll(".sprite-desc")].map(e => clean(e.textContent)).filter(Boolean),
      location: fact("Location"),
      cost: fact("Summon Cost") || "0",
      chest: fact("Sprite Chest") || "0%"
    };
  }
  return out;
}
