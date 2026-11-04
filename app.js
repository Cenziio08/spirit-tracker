const STORAGE_KEY = "spirit-tracker-progress";

// Ancien cache du catalogue en ligne (plus utilisé) : on fait le ménage
localStorage.removeItem("spirit-tracker-catalog");

// Ordre et libellés des raretés (les raretés inconnues passent à la fin)
const RARITIES = {
  common: { label: "Commun", order: 0 },
  uncommon: { label: "Peu commun", order: 1 },
  rare: { label: "Rare", order: 2 },
  epic: { label: "Épique", order: 3 },
  legendary: { label: "Légendaire", order: 4 },
  mythic: { label: "Mythique", order: 5 },
  special: { label: "Spécial", order: 6 }
};

// Noms des variantes (tels qu'affichés dans le jeu)
const VARIANTS = {
  base: "Base",
  cheatmaster: "Cheat Master",
  hacker: "Loot Hacker",
  reaper: "Bounty Hunter",
  tricktreat: "Trick or Treat",
  gold: "Gold",
  candy: "Gummy",
  galaxy: "Galaxy",
  gem: "Gem",
  holofoil: "Holofoil",
  cube: "Cube",
  quack: "Quack",
  cursed: "Cursed",
  jeweled: "Fortune"
};

// Liste locale complète (spirits-data.js)
const LOCAL_SPIRITS = (window.SPIRITS_DATA?.spirits || []).map(
  ([spriteId, parent, name, rarity, variant, season, image, unreleased]) => ({
    spriteId,
    parent,
    name,
    rarity,
    variant,
    season,
    unreleased: Boolean(unreleased),
    // icône servie par le site (icons/), fortnite.gg en secours
    url: `icons/${spriteId}-${variant}.webp`,
    remoteUrl: /^https?:/.test(image)
      ? image
      : window.SPIRITS_DATA.imageBase + image
  })
);

const $ = id => document.getElementById(id);

const spiritsElement = $("spirits");
const searchElement = $("search");
const statusElement = $("status");
const emptyElement = $("empty");
const rarityFilter = $("rarity-filter");
const variantFilter = $("variant-filter");
const seasonFilter = $("season-filter");
const sortElement = $("sort");

let spirits = [];
let statusFilter = "all";
let progress = loadJSON(STORAGE_KEY, {});

/* ---------- Utilitaires ---------- */

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

// Demande au navigateur de ne pas effacer la progression pour faire de la
// place (Chrome/Android l'accorde souvent ; sur iPhone, ajouter le site à
// l'écran d'accueil protège aussi les données).
let persistAsked = false;
function askPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

function saveProgress() {
  askPersistentStorage();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getKey(spirit) {
  return `${spirit.spriteId}-${spirit.variant}`;
}

function getState(spirit) {
  return progress[getKey(spirit)] || { owned: false, mastered: false };
}

// "FillerGrunt" -> "Filler Grunt"
function prettyName(name = "") {
  return String(name)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function capitalize(text = "") {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rarityLabel(rarity) {
  return RARITIES[rarity]?.label || capitalize(rarity || "Inconnue");
}

function rarityOrder(rarity) {
  return RARITIES[rarity]?.order ?? 99;
}

function displayName(spirit) {
  return spirit.name || prettyName(spirit.parent);
}

function variantLabel(variant) {
  return VARIANTS[variant] || capitalize(prettyName(variant));
}

// "c7s3" -> "Ch. 7 S3", "c7ms" -> "Ch. 7 Mini-saison"
function seasonLabel(season) {
  const match = /^c(\d+)(?:s(\d+)|(ms))$/i.exec(season || "");
  if (!match) return season || "—";
  return match[3]
    ? `Ch. ${match[1]} Mini-saison`
    : `Ch. ${match[1]} S${match[2]}`;
}

// Valeur numérique pour trier les saisons (la mini-saison vient après S4)
function seasonValue(season) {
  const match = /^c(\d+)(?:s(\d+)|(ms))$/i.exec(season || "");
  if (!match) return 0;
  return Number(match[1]) * 100 + (match[3] ? 45 : Number(match[2]) * 10);
}

let toastTimer;
function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 2500);
}

/* ---------- Statistiques ---------- */

function updateStats() {
  // On ne compte que les esprits présents dans le catalogue actuel
  const total = spirits.length;
  let owned = 0;
  let mastered = 0;
  const byRarity = {};

  spirits.forEach(spirit => {
    const state = getState(spirit);
    const rarity = spirit.rarity || "unknown";

    byRarity[rarity] ??= { total: 0, mastered: 0 };
    byRarity[rarity].total++;

    if (state.owned) owned++;
    if (state.mastered) {
      mastered++;
      byRarity[rarity].mastered++;
    }
  });

  $("owned").textContent = owned;
  $("mastered").textContent = mastered;
  document.querySelectorAll(".total").forEach(el => {
    el.textContent = total;
  });

  const percent = total ? Math.round(mastered / total * 100) : 0;
  $("progress").textContent = percent + "%";
  $("bar-owned").style.width = total ? (owned / total * 100) + "%" : "0";
  $("bar-mastered").style.width = total ? (mastered / total * 100) + "%" : "0";

  // Progression par rareté
  const container = $("rarity-stats");
  container.replaceChildren();

  Object.keys(byRarity)
    .sort((a, b) => rarityOrder(a) - rarityOrder(b))
    .forEach(rarity => {
      const { total: count, mastered: done } = byRarity[rarity];
      const pill = document.createElement("div");
      pill.className = `rarity-pill rarity-${rarity}`;
      if (done === count) pill.classList.add("complete");
      pill.textContent = `${rarityLabel(rarity)} ${done}/${count}`;
      container.append(pill);
    });
}

/* ---------- Filtres ---------- */

function fillSelect(select, values, labelFn) {
  const current = select.value;
  const first = select.options[0];
  select.replaceChildren(first);

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFn(value);
    select.append(option);
  });

  // Garde la sélection si elle existe toujours
  select.value = values.includes(current) ? current : "";
}

function populateFilters() {
  const unique = field =>
    [...new Set(spirits.map(s => s[field]).filter(Boolean))];

  fillSelect(
    rarityFilter,
    unique("rarity").sort((a, b) => rarityOrder(a) - rarityOrder(b)),
    rarityLabel
  );
  fillSelect(
    variantFilter,
    unique("variant").sort((a, b) =>
      a === "base" ? -1 : b === "base" ? 1
        : variantLabel(a).localeCompare(variantLabel(b))),
    variantLabel
  );
  fillSelect(
    seasonFilter,
    unique("season").sort((a, b) => seasonValue(b) - seasonValue(a)),
    seasonLabel
  );
}

function matchesStatus(state) {
  switch (statusFilter) {
    case "missing": return !state.owned;
    case "owned": return state.owned;
    case "unmastered": return state.owned && !state.mastered;
    case "mastered": return state.mastered;
    default: return true;
  }
}

// Minuscules sans accents : "Légendaire" et "legendaire" se trouvent pareil
function normalize(text) {
  return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function getVisibleSpirits() {
  const search = normalize(searchElement.value.trim());
  const rarity = rarityFilter.value;
  const variant = variantFilter.value;
  const season = seasonFilter.value;

  const filtered = spirits.filter(spirit => {
    const text = [
      spirit.parent,
      prettyName(spirit.parent),
      displayName(spirit),
      spirit.variant,
      variantLabel(spirit.variant),
      spirit.rarity,
      rarityLabel(spirit.rarity),
      seasonLabel(spirit.season),
      spirit.unreleased ? "pas encore sorti bientôt leak" : ""
    ].join(" ");

    return normalize(text).includes(search)
      && (!rarity || spirit.rarity === rarity)
      && (!variant || spirit.variant === variant)
      && (!season || spirit.season === season)
      && matchesStatus(getState(spirit));
  });

  const byName = (a, b) =>
    displayName(a).localeCompare(displayName(b))
    || (a.variant === "base" ? -1 : b.variant === "base" ? 1
      : variantLabel(a.variant).localeCompare(variantLabel(b.variant)));

  const statusRank = spirit => {
    const state = getState(spirit);
    return state.mastered ? 2 : state.owned ? 1 : 0;
  };

  const sorters = {
    name: byName,
    rarity: (a, b) =>
      rarityOrder(b.rarity) - rarityOrder(a.rarity) || byName(a, b),
    season: (a, b) =>
      seasonValue(b.season) - seasonValue(a.season) || byName(a, b),
    status: (a, b) => statusRank(a) - statusRank(b) || byName(a, b)
  };

  // « Toutes les saisons » : rangé par saison (la plus récente d'abord),
  // puis par nom, comme sur fortnite.gg
  const sortBy = !season && sortElement.value === "name" ? "season" : sortElement.value;
  return filtered.sort(sorters[sortBy] || byName);
}

// Titres de saison dans la grille quand les esprits sont rangés par saison
function showsSeasonHeadings() {
  return !seasonFilter.value && ["name", "season"].includes(sortElement.value);
}

/* ---------- Cartes ---------- */

function createCheckbox(label, className, checked) {
  const wrapper = document.createElement("label");
  wrapper.className = className;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;

  wrapper.append(input, " " + label);
  return { wrapper, input };
}

function createCard(spirit) {
  const key = getKey(spirit);
  const saved = getState(spirit);
  const name = displayName(spirit);

  const card = document.createElement("article");
  card.className = `card rarity-${spirit.rarity || "unknown"}`;
  card.classList.toggle("owned", saved.owned);
  card.classList.toggle("mastered", saved.mastered);

  // Zone image : l'esprit + sa couronne posée sur la tête (comme fortnite.gg)
  const art = document.createElement("div");
  art.className = "card-art";

  const crown = document.createElement("div");
  crown.className = "mastery-crown";
  crown.setAttribute("aria-hidden", "true");

  // Image (avec repli si elle ne charge pas)
  const img = document.createElement("img");
  img.src = spirit.url;
  img.alt = name;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    // icône locale absente : on essaie fortnite.gg, sinon un "?"
    if (spirit.remoteUrl && img.src !== spirit.remoteUrl) {
      img.src = spirit.remoteUrl;
      return;
    }
    img.replaceWith(Object.assign(document.createElement("div"), {
      className: "img-fallback",
      textContent: "?"
    }));
  });

  const title = document.createElement("h3");
  title.textContent = name;

  const tags = document.createElement("div");
  tags.className = "tags";

  const rarity = document.createElement("span");
  rarity.className = "tag rarity-tag";
  rarity.textContent = rarityLabel(spirit.rarity);

  const variant = document.createElement("span");
  variant.className = "tag";
  variant.textContent = variantLabel(spirit.variant);

  tags.append(rarity, variant);

  if (spirit.unreleased) {
    const upcoming = document.createElement("span");
    upcoming.className = "tag upcoming-tag";
    upcoming.textContent = "Pas encore sorti";
    tags.append(upcoming);
  }

  if (spirit.season) {
    const season = document.createElement("span");
    season.className = "tag season-tag";
    season.textContent = seasonLabel(spirit.season);
    tags.append(season);
  }

  const owned = createCheckbox("Possédé", "check-owned", saved.owned);
  const mastered = createCheckbox("Maîtrisé", "check-mastered", saved.mastered);

  function update(next) {
    progress[key] = next;
    if (!next.owned && !next.mastered) delete progress[key];

    owned.input.checked = next.owned;
    mastered.input.checked = next.mastered;
    card.classList.toggle("owned", next.owned);
    card.classList.toggle("mastered", next.mastered);

    saveProgress();
    updateStats();
  }

  // Décocher Possédé retire aussi la maîtrise
  owned.input.addEventListener("change", () => {
    update({
      owned: owned.input.checked,
      mastered: owned.input.checked && mastered.input.checked
    });
  });

  // Maîtrisé implique automatiquement Possédé
  mastered.input.addEventListener("change", () => {
    update({
      owned: mastered.input.checked || owned.input.checked,
      mastered: mastered.input.checked
    });
  });

  const checks = document.createElement("div");
  checks.className = "checks";
  checks.append(owned.wrapper, mastered.wrapper);

  art.append(img, crown);
  card.append(art, title, tags, checks);
  return card;
}

function renderSpirits() {
  const visible = getVisibleSpirits();
  const fragment = document.createDocumentFragment();

  const headings = showsSeasonHeadings();
  let lastSeason = null;
  visible.forEach(spirit => {
    if (headings && spirit.season !== lastSeason) {
      lastSeason = spirit.season;
      const count = visible.filter(s => s.season === spirit.season).length;
      const title = document.createElement("h2");
      title.className = "season-heading";
      title.textContent = spirit.season ? seasonLabel(spirit.season) : "Autres";
      const small = document.createElement("span");
      small.textContent = `${count} esprit(s)`;
      title.append(small);
      fragment.append(title);
    }
    fragment.append(createCard(spirit));
  });
  spiritsElement.replaceChildren(fragment);

  emptyElement.hidden = visible.length > 0 || spirits.length === 0;

  if (spirits.length) {
    statusElement.textContent =
      `${visible.length} esprit(s) affiché(s) sur ${spirits.length}.`;
  }

  updateStats();
}

/* ---------- Catalogue ---------- */

// La liste des esprits vient uniquement de spirits-data.js
function setCatalog() {
  spirits = [...LOCAL_SPIRITS];

  // Pas de catégorie "Spécial" : chaque variante prend la rareté de son esprit
  // de base (ex. Jonesy Gold -> Rare). La variante reste indiquée par son étiquette.
  const baseRarity = new Map();
  spirits.forEach(s => {
    if (s.variant === "base" && s.rarity !== "special") baseRarity.set(s.parent, s.rarity);
  });
  spirits = spirits.map(s =>
    s.rarity === "special" && baseRarity.has(s.parent)
      ? { ...s, rarity: baseRarity.get(s.parent) }
      : s);
  populateFilters();
  renderSpirits();
}

/* ---------- Sauvegarde ---------- */

function exportProgress() {
  const blob = new Blob(
    [JSON.stringify({ app: "spirit-tracker", version: 1, progress }, null, 2)],
    { type: "application/json" }
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `spirit-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  // libéré un peu plus tard : certains navigateurs annulent le téléchargement sinon
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  toast("Progression exportée.");
}

// Retrouve l'identifiant d'un esprit dans une entrée de détection :
// champ "id"/"spriteId", ou URL fortnite.gg du type ".../sprites/182-jonesy-sprite"
function detectionId(entry) {
  if (entry?.spriteId != null) return String(entry.spriteId);
  if (entry?.id != null) return String(entry.id);
  const match = /\/sprites\/(\d+)/.exec(entry?.url || "");
  return match ? match[1] : null;
}

// Importe le résultat de match_sprites.py (sprites_detected.json).
// Tout ce qui apparaît dans les captures du jeu est possédé ;
// la couronne détectée indique la maîtrise.
// On ne retire jamais rien : une maîtrise déjà cochée reste cochée.
function importGameDetection(list) {
  const byId = new Map();
  spirits.forEach(spirit => {
    if (!byId.has(spirit.spriteId)) byId.set(spirit.spriteId, spirit);
  });

  const unknown = [];
  const updates = [];

  list.forEach(entry => {
    const spirit = byId.get(detectionId(entry));
    if (!spirit) {
      unknown.push(entry?.name || detectionId(entry) || "?");
      return;
    }
    updates.push({ spirit, mastered: Boolean(entry.mastered) });
  });

  if (!updates.length) {
    toast("Aucun esprit de ce fichier n'a été reconnu.");
    return;
  }

  let newOwned = 0;
  let newMastered = 0;
  updates.forEach(({ spirit, mastered }) => {
    const state = getState(spirit);
    if (!state.owned) newOwned++;
    if (mastered && !state.mastered) newMastered++;
  });

  const masteredCount = updates.filter(u => u.mastered).length;
  let message =
    `Détection du jeu : ${updates.length} esprit(s) reconnu(s)\n` +
    `• ${masteredCount} maîtrisé(s), ${updates.length - masteredCount} possédé(s) sans couronne\n` +
    `• Nouveautés pour toi : ${newOwned} possédé(s), ${newMastered} maîtrisé(s)\n`;
  if (unknown.length) {
    message += `• ${unknown.length} non reconnu(s) : ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}\n`;
  }
  message += "\nAppliquer ? (rien ne sera décoché)";

  if (!confirm(message)) return;

  updates.forEach(({ spirit, mastered }) => {
    const key = getKey(spirit);
    const state = getState(spirit);
    progress[key] = { owned: true, mastered: state.mastered || mastered };
  });

  saveProgress();
  renderSpirits();
  toast(`Import terminé : +${newOwned} possédé(s), +${newMastered} maîtrisé(s).`);
}

async function importProgress(file) {
  try {
    const parsed = JSON.parse(await file.text());

    // Fichier de détection (liste d'esprits) plutôt qu'une sauvegarde
    if (Array.isArray(parsed)) {
      importGameDetection(parsed);
      return;
    }

    const data = parsed.progress ?? parsed;

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Fichier invalide");
    }

    const clean = {};
    Object.entries(data).forEach(([key, value]) => {
      const owned = Boolean(value?.owned || value?.mastered);
      const mastered = Boolean(value?.mastered);
      if (owned) clean[key] = { owned, mastered };
    });

    if (!confirm(`Importer ${Object.keys(clean).length} esprit(s) ? Ta progression actuelle sera remplacée.`)) {
      return;
    }

    progress = clean;
    saveProgress();
    renderSpirits();
    toast("Progression importée !");
  } catch (error) {
    console.error(error);
    toast("Ce fichier n'est pas une sauvegarde valide.");
  }
}

function resetProgress() {
  if (!confirm("Effacer toute ta progression ? Cette action est irréversible.")) {
    return;
  }
  progress = {};
  saveProgress();
  renderSpirits();
  toast("Progression réinitialisée.");
}

/* ---------- Scanner de captures d'écran ---------- */

let scanning = false;
const scanQueue = [];

function spiritByKey(key) {
  return spirits.find(s => getKey(s) === key);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Le scanner et ses empreintes (1,7 Mo) ne sont téléchargés que si on
// s'apprête à scanner : la page s'ouvre plus vite, surtout en 4G.
const ASSET_VERSION = (document.currentScript?.src.match(/\?v=([^&]+)/) || [])[1] || "";
let scannerLoading = null;
function loadScanner() {
  if (window.SpiritScanner) return Promise.resolve();
  if (scannerLoading) return scannerLoading;
  const add = name => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${name}?v=${ASSET_VERSION}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Impossible de charger ${name}`));
    document.head.append(script);
  });
  scannerLoading = Promise.all([add("spirits-fingerprints.js"), add("scanner.js")])
    .catch(error => { scannerLoading = null; throw error; });
  return scannerLoading;
}

window.SpiritLoadScanner = loadScanner; // pour tests/photo-test.js

async function runScan(files) {
  const images = [...files].filter(f => f.type.startsWith("image/"));
  if (!images.length) {
    toast("Ajoute des images (captures d'écran du jeu).");
    return;
  }
  if (scanning) {
    scanQueue.push(...images);
    return;
  }
  scanning = true;
  const progressBox = $("scan-progress");
  const report = $("scan-report");
  progressBox.hidden = false;
  report.hidden = true;

  try {
    if (!window.SpiritScanner) {
      $("scan-progress-bar").style.width = "0%";
      $("scan-progress-label").textContent = "Chargement du scanner…";
      await loadScanner();
    }
    const result = await window.SpiritScanner.scan(images, (fraction, label) => {
      $("scan-progress-bar").style.width = Math.round(fraction * 100) + "%";
      $("scan-progress-label").textContent =
        `${label} (${Math.round(fraction * 100)} %)`;
    });
    applyScan(result);
  } catch (error) {
    console.error(error);
    toast(String(error.message).startsWith("Impossible de charger")
      ? "Le scanner n'a pas pu se charger : vérifie ta connexion et réessaie."
      : "Erreur pendant l'analyse des captures.");
  } finally {
    progressBox.hidden = true;
    scanning = false;
    if (scanQueue.length) runScan(scanQueue.splice(0));
  }
}

// Applique automatiquement le résultat : vu = possédé, couronne = maîtrisé.
// Rien n'est jamais décoché ; un bouton permet d'annuler.
function applyScan(result) {
  const before = JSON.stringify(progress);
  const rows = [];
  let newOwned = 0, newMastered = 0, uncertain = 0;

  result.found.forEach(item => {
    const spirit = spiritByKey(item.key);
    if (!spirit) return;
    const state = getState(spirit);
    const mastered = state.mastered || item.crowned;
    const isNewOwned = !state.owned;
    const isNewMastered = mastered && !state.mastered;
    if (isNewOwned) newOwned++;
    if (isNewMastered) newMastered++;
    if (!item.crowned && !item.crownCertain && !state.mastered) uncertain++;
    progress[item.key] = { owned: true, mastered };
    rows.push({ spirit, item, isNewOwned, isNewMastered, mastered });
  });

  saveProgress();
  renderSpirits();
  showScanReport(result, rows, { newOwned, newMastered, uncertain, before });
}

// Esprits devinés sans certitude (photos floues, de biais…) : on demande.
function appendDoubtful(report, result) {
  const items = (result.doubtful || [])
    .map(d => ({ ...d, spirit: spiritByKey(d.key) }))
    .filter(d => d.spirit && !getState(d.spirit).owned);
  if (!items.length) return;

  const box = el("div", "scan-doubtful");
  box.append(
    el("strong", null, `À vérifier (${items.length})`),
    el("p", "scan-note",
      "Le scanner n'est pas sûr de ceux-là (photo floue ou de biais). Confirme ceux qui sont justes, en précisant s'ils ont la couronne ; les autres seront ignorés.")
  );
  const grid = el("div", "scan-grid");
  items.forEach(d => {
    const tile = el("div", "scan-tile is-doubtful");
    const img = el("img");
    img.src = d.thumb;
    img.alt = "";
    const name = el("div", "scan-tile-name",
      `${displayName(d.spirit)}${d.spirit.variant !== "base" ? " · " + variantLabel(d.spirit.variant) : ""} ?`);
    // la couronne est elle aussi incertaine sur ces images : on laisse choisir
    const buttons = el("div", "scan-confirm-row");
    const confirm = mastered => {
      const state = getState(d.spirit);
      progress[d.key] = { owned: true, mastered: state.mastered || mastered };
      saveProgress();
      renderSpirits();
      tile.classList.add("is-confirmed");
      buttons.replaceWith(el("div", "scan-tile-badge", mastered ? "👑 Ajouté" : "✓ Ajouté"));
    };
    const owned = el("button", "scan-confirm secondary", "✓ Je l'ai");
    const crowned = el("button", "scan-confirm" + (d.crowned ? "" : " secondary"), "👑 Maîtrisé");
    [owned, crowned].forEach(b => { b.type = "button"; });
    owned.addEventListener("click", () => confirm(false));
    crowned.addEventListener("click", () => confirm(true));
    buttons.append(owned, crowned);
    tile.append(img, name, buttons);
    grid.append(tile);
  });
  box.append(grid);
  report.append(box);
}

function showScanReport(result, rows, info) {
  const report = $("scan-report");
  report.replaceChildren();
  report.hidden = false;

  const head = el("div", "scan-report-head");
  const summary = el("div", "scan-summary");

  if (!rows.length) {
    summary.append(
      el("strong", null, result.doubtful?.length ? "Aucun esprit reconnu avec certitude." : "Aucun esprit reconnu."),
      el("span", null,
        " Vérifie que l'image montre bien la grille des esprits (onglet Esprits). Pour une photo : bien en face, nette, sans reflet.")
    );
    head.append(summary);
    report.append(head);
    appendDoubtful(report, result);
    return;
  }

  summary.append(
    el("strong", null,
      `${rows.length} esprit(s) reconnu(s) sur ${result.files} image(s)`),
    el("span", null,
      ` — +${info.newOwned} possédé(s), +${info.newMastered} maîtrisé(s) ajouté(s) à ta collection.`)
  );

  const undo = el("button", "secondary", "Annuler");
  undo.type = "button";
  undo.addEventListener("click", () => {
    progress = JSON.parse(info.before);
    saveProgress();
    renderSpirits();
    report.hidden = true;
    toast("Scan annulé : ta progression est revenue comme avant.");
  });

  const close = el("button", "icon-button", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Fermer le rapport");
  close.addEventListener("click", () => { report.hidden = true; });

  head.append(summary, undo, close);
  report.append(head);

  appendDoubtful(report, result);

  if (info.uncertain) {
    report.append(el("p", "scan-note",
      `${info.uncertain} esprit(s) étaient coupés en haut de la capture : leur couronne n'était pas visible. ` +
      "Ils sont cochés « Possédé » ; vérifie leur maîtrise ou ajoute une capture où ils sont entiers."));
  }

  // Esprits attendus de la même saison mais absents des captures
  const seasons = new Set(rows.map(r => r.spirit.season));
  const seenKeys = new Set(rows.map(r => getKey(r.spirit)));
  const missing = spirits.filter(s =>
    seasons.has(s.season) && !s.unreleased && !seenKeys.has(getKey(s)) && !getState(s).owned);
  if (missing.length && missing.length <= 40) {
    report.append(el("p", "scan-note",
      `Pas vu dans tes captures (${missing.length}) : ` +
      missing.map(s => `${displayName(s)}${s.variant !== "base" ? " " + variantLabel(s.variant) : ""}`).join(", ") +
      ". Si tu les as, ajoute une capture de l'endroit où ils apparaissent."));
  }

  const details = el("details", "scan-details");
  const sum = el("summary", null, "Voir le détail des esprits reconnus");
  details.append(sum);

  const grid = el("div", "scan-grid");
  rows
    .sort((a, b) => (b.isNewOwned + b.isNewMastered) - (a.isNewOwned + a.isNewMastered))
    .forEach(({ spirit, item, isNewOwned, isNewMastered, mastered }) => {
      const tile = el("div", "scan-tile");
      if (isNewOwned || isNewMastered) tile.classList.add("is-new");
      const img = el("img");
      img.src = item.thumb;
      img.alt = "";
      const label = el("div", "scan-tile-name",
        `${displayName(spirit)}${spirit.variant !== "base" ? " · " + variantLabel(spirit.variant) : ""}`);
      const badge = el("div", "scan-tile-badge",
        mastered ? "👑 Maîtrisé" : "✓ Possédé");
      if (isNewMastered || isNewOwned) badge.append(el("span", "scan-new", " nouveau"));
      tile.append(img, label, badge);
      grid.append(tile);
    });
  details.append(grid);
  report.append(details);

  if (result.unknown.length) {
    const unk = el("details", "scan-details");
    unk.append(el("summary", null,
      `${result.unknown.length} case(s) non reconnue(s)`));
    const ugrid = el("div", "scan-grid");
    result.unknown.forEach(u => {
      const tile = el("div", "scan-tile");
      const img = el("img");
      img.src = u.thumb;
      img.alt = "";
      tile.append(img, el("div", "scan-tile-name", "Non reconnu"));
      ugrid.append(tile);
    });
    unk.append(el("p", "scan-note",
      "Souvent un esprit tout nouveau : demande une mise à jour de la liste (spirits-data.js) et des empreintes."), ugrid);
    report.append(unk);
  }

  report.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const dropzone = $("dropzone");
// préchargement dès qu'on approche de la zone (souris, doigt, clavier)
["pointerenter", "touchstart", "focus", "dragenter"].forEach(type =>
  dropzone.addEventListener(type, () => loadScanner().catch(() => {}), { once: true, passive: true }));
dropzone.addEventListener("click", () => $("scan-files").click());
dropzone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    $("scan-files").click();
  }
});
$("scan-files").addEventListener("change", event => {
  runScan(event.target.files);
  event.target.value = "";
});
["dragenter", "dragover"].forEach(type =>
  dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  }));
["dragleave", "drop"].forEach(type =>
  dropzone.addEventListener(type, () => dropzone.classList.remove("dragging")));
dropzone.addEventListener("drop", event => {
  event.preventDefault();
  event.stopPropagation();
  runScan(event.dataTransfer.files);
});
// Évite que le navigateur ouvre l'image si on la lâche à côté de la zone
window.addEventListener("dragover", event => event.preventDefault());
window.addEventListener("drop", event => {
  event.preventDefault();
  if (event.dataTransfer?.files?.length) runScan(event.dataTransfer.files);
});
// Coller une capture (Ctrl+V) n'importe où sur la page
document.addEventListener("paste", event => {
  const files = [...(event.clipboardData?.items || [])]
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile())
    .filter(Boolean);
  if (files.length) {
    event.preventDefault();
    runScan(files);
  }
});

/* ---------- Événements ---------- */

searchElement.addEventListener("input", renderSpirits);
[rarityFilter, variantFilter, seasonFilter, sortElement].forEach(el =>
  el.addEventListener("change", renderSpirits));

$("status-filter").addEventListener("click", event => {
  const chip = event.target.closest(".chip");
  if (!chip) return;

  statusFilter = chip.dataset.status;
  document.querySelectorAll("#status-filter .chip").forEach(c =>
    c.classList.toggle("active", c === chip));
  renderSpirits();
});

$("export").addEventListener("click", exportProgress);
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", event => {
  const file = event.target.files[0];
  if (file) importProgress(file);
  event.target.value = "";
});
$("reset").addEventListener("click", resetProgress);

/* ---------- Menus déroulants personnalisés ---------- */

// Remplace l'affichage d'un <select> natif par un menu assorti au site.
// Le <select> reste en place (caché) : il garde la valeur et déclenche "change".
function enhanceSelect(select) {
  const wrapper = el("div", "dropdown");
  const toggle = el("button", "dropdown-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-haspopup", "listbox");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", select.getAttribute("aria-label") || "");
  const label = el("span", "dropdown-label");
  const chevron = el("span", "dropdown-chevron");
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(label, chevron);

  const menu = el("ul", "dropdown-menu");
  menu.setAttribute("role", "listbox");
  menu.tabIndex = -1;
  menu.hidden = true;

  select.before(wrapper);
  wrapper.append(toggle, menu, select);
  select.classList.add("native-select");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  let activeIndex = -1;
  const isSort = select.id === "sort";

  function refresh() {
    const current = select.options[select.selectedIndex];
    label.textContent = current ? current.textContent : "";
    // un filtre actif est mis en évidence (pas le tri, qui a toujours une valeur)
    wrapper.classList.toggle("is-active", !isSort && select.value !== "");
  }

  function build() {
    menu.replaceChildren();
    [...select.options].forEach((option, index) => {
      const item = el("li", "dropdown-option", option.textContent);
      item.setAttribute("role", "option");
      item.dataset.index = index;
      if (index === select.selectedIndex) {
        item.classList.add("selected");
        item.setAttribute("aria-selected", "true");
      }
      item.addEventListener("click", () => choose(index));
      item.addEventListener("mousemove", () => highlight(index));
      menu.append(item);
    });
  }

  function highlight(index) {
    activeIndex = index;
    [...menu.children].forEach((item, i) =>
      item.classList.toggle("active", i === index));
    menu.children[index]?.scrollIntoView({ block: "nearest" });
  }

  function open() {
    document.querySelectorAll(".dropdown.open").forEach(d => d !== wrapper && d.closeMenu());
    build();
    menu.hidden = false;
    wrapper.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    highlight(select.selectedIndex);
  }

  function close(focusToggle = false) {
    menu.hidden = true;
    wrapper.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    if (focusToggle) toggle.focus();
  }
  wrapper.closeMenu = close;

  function choose(index) {
    if (index !== select.selectedIndex) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event("change"));
    }
    refresh();
    close(true);
  }

  toggle.addEventListener("click", () => (menu.hidden ? open() : close()));

  toggle.addEventListener("keydown", event => {
    const count = select.options.length;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && menu.hidden) {
      event.preventDefault();
      open();
      return;
    }
    if (menu.hidden) return;
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); highlight(Math.min(count - 1, activeIndex + 1)); break;
      case "ArrowUp": event.preventDefault(); highlight(Math.max(0, activeIndex - 1)); break;
      case "Home": event.preventDefault(); highlight(0); break;
      case "End": event.preventDefault(); highlight(count - 1); break;
      case "Enter":
      case " ": event.preventDefault(); choose(activeIndex); break;
      case "Escape": event.preventDefault(); close(true); break;
      case "Tab": close(); break;
    }
  });

  document.addEventListener("click", event => {
    if (!wrapper.contains(event.target)) close();
  });

  // Les options sont recréées quand le catalogue change : on suit le mouvement
  new MutationObserver(refresh).observe(select, { childList: true });
  select.addEventListener("change", refresh);
  refresh();
}

[rarityFilter, variantFilter, seasonFilter, sortElement].forEach(enhanceSelect);

/* ---------- Thèmes ---------- */

const THEME_KEY = "spirit-tracker-theme";
// [valeur, nom, couleurs de la pastille (fond, accent)]
const THEMES = [
  ["", "Violet (d'origine)", "#10111b", "#7651e8"],
  ["sombre", "Sombre", "#0b0b0e", "#6b7280"],
  ["clair", "Clair", "#eef0f6", "#6a43e0"],
  ["fortnite", "Fortnite", "#0e2865", "#f8e548"],
  ["hacker", "Système hacké", "#050a07", "#19c35a"],
  ["rose", "Rose bonbon", "#2a1729", "#e0479e"]
];

const CUSTOM_KEY = "spirit-tracker-custom-theme";
const CUSTOM_BG_KEY = "spirit-tracker-custom-bg";

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  if (theme === "perso") SpiritTheme.applyCustom();
  else SpiritTheme.clearCustom();
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) { /* stockage bloqué : le thème ne sera pas retenu */ }
  document.querySelectorAll(".theme-option").forEach(option => {
    option.setAttribute("aria-checked", String(option.dataset.theme === theme));
  });
}

(function setupThemePicker() {
  const toggle = $("theme-toggle");
  const menu = $("theme-menu");
  if (!toggle || !menu) return;
  const current = document.documentElement.dataset.theme || "";

  const addOption = (value, label, swatchBg, onClick, extraClass = "") => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "theme-option " + extraClass;
    option.setAttribute("role", "menuitemradio");
    option.setAttribute("aria-checked", String(value === current));
    option.dataset.theme = value;
    const swatch = document.createElement("span");
    swatch.className = "theme-swatch";
    swatch.style.background = swatchBg;
    option.append(swatch, label);
    option.addEventListener("click", () => {
      close();
      onClick();
    });
    menu.append(option);
    return option;
  };

  THEMES.forEach(([value, label, bg, accent]) => {
    addOption(value, label, `linear-gradient(135deg, ${bg} 50%, ${accent} 50%)`, () => {
      applyTheme(value);
      toggle.focus();
    });
  });
  const customOption = addOption("perso", "Mon thème…", "", () => openCustomTheme(), "theme-custom-option");
  const paintCustomSwatch = () => {
    const c = SpiritTheme.load(), img = SpiritTheme.image();
    customOption.querySelector(".theme-swatch").style.background = img
      ? `center / cover url("${img}")`
      : `linear-gradient(135deg, ${c.bg} 50%, ${c.accent} 50%)`;
  };
  paintCustomSwatch();

  function close() {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('[aria-checked="true"]')?.focus();
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".theme-picker")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) { close(); toggle.focus(); }
  });

  /* --- « Mon thème » : couleurs au choix et image de la galerie --- */

  const dialog = $("custom-theme");
  const inputs = { bg: $("ct-bg"), panel: $("ct-panel"), accent: $("ct-accent"), dim: $("ct-dim"), glass: $("ct-glass") };
  const preview = $("ct-preview");
  const fileInput = $("ct-file");

  function readForm() {
    return {
      bg: inputs.bg.value, panel: inputs.panel.value, accent: inputs.accent.value,
      dim: Number(inputs.dim.value), glass: Number(inputs.glass.value)
    };
  }

  function save(c) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); } catch (e) { /* ignoré */ }
  }

  function refreshImageUI() {
    const img = SpiritTheme.image();
    preview.style.backgroundImage = img ? `url("${img}")` : "none";
    preview.textContent = img ? "" : "Aucune";
    $("ct-remove").hidden = !img;
    // voile et transparence ne servent qu'avec une image
    [inputs.dim, inputs.glass].forEach(i => {
      i.disabled = !img;
      i.closest("label").classList.toggle("is-disabled", !img);
    });
  }

  function update() {
    const c = readForm();
    save(c);
    applyTheme("perso");
    paintCustomSwatch();
  }

  function openCustomTheme() {
    const c = SpiritTheme.load();
    Object.entries(inputs).forEach(([k, input]) => { input.value = c[k]; });
    refreshImageUI();
    applyTheme("perso");
    dialog.showModal();
  }

  Object.values(inputs).forEach(input => input.addEventListener("input", update));

  $("ct-pick").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const dataUrl = await shrinkImage(file);
      localStorage.setItem(CUSTOM_BG_KEY, dataUrl);
    } catch (e) {
      console.error(e);
      toast("Impossible d'utiliser cette image, essaie une autre.");
      return;
    }
    refreshImageUI();
    update();
  });

  $("ct-remove").addEventListener("click", () => {
    try { localStorage.removeItem(CUSTOM_BG_KEY); } catch (e) { /* ignoré */ }
    refreshImageUI();
    update();
  });

  $("ct-reset").addEventListener("click", () => {
    try {
      localStorage.removeItem(CUSTOM_KEY);
      localStorage.removeItem(CUSTOM_BG_KEY);
    } catch (e) { /* ignoré */ }
    dialog.close();
    paintCustomSwatch();
    applyTheme("");
  });

  // Photo de la galerie -> JPEG d'au plus 1600 px (une photo de téléphone
  // brute ne tiendrait pas dans la mémoire du navigateur)
  async function shrinkImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    for (const quality of [0.82, 0.7, 0.55]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length < 1.5e6) return url;
    }
    return canvas.toDataURL("image/jpeg", 0.4);
  }
})();

/* ---------- Démarrage ---------- */

setCatalog();

// Comme fortnite.gg : on arrive directement sur la saison en cours
// (la plus récente ayant des esprits déjà sortis). « Toutes les saisons »
// reste disponible dans le menu.
const currentSeason = spirits
  .filter(s => !s.unreleased && s.season)
  .reduce((best, s) => (seasonValue(s.season) > seasonValue(best) ? s.season : best), "");
if (currentSeason) {
  seasonFilter.value = currentSeason;
  seasonFilter.dispatchEvent(new Event("change"));
}
