const STORAGE_KEY = "spirit-tracker-progress";

// Ancien cache du catalogue en ligne (plus utilisé) : on fait le ménage
localStorage.removeItem("spirit-tracker-catalog");

// Ordre et libellés des raretés (les raretés inconnues passent à la fin)
// (les noms affichés viennent de i18n.js : rarity.<clé>)
const RARITIES = {
  common: { order: 0 },
  uncommon: { order: 1 },
  rare: { order: 2 },
  epic: { order: 3 },
  legendary: { order: 4 },
  mythic: { order: 5 },
  special: { order: 6 }
};

const t = (key, vars) => window.I18N.t(key, vars);

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
  window.SpiritProgress.onSave?.(); // synchronisation (sync.js), si active
}

// Accès à la progression pour la synchronisation en ligne (sync.js)
window.SpiritProgress = {
  get: () => progress,
  // remplace la progression par celle venue d'un autre appareil
  replace(next) {
    progress = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    if (spirits.length) renderSpirits();
  },
  onSave: null
};

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
  return RARITIES[rarity] ? t(`rarity.${rarity}`) : capitalize(rarity || t("rarity.unknown"));
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

// "c7s3" -> "Ch. 7 S3", "c7ms" -> "Ch. 7 Mini-saison" / "Ch. 7 Mini Season"
function seasonLabel(season) {
  const match = /^c(\d+)(?:s(\d+)|(ms))$/i.exec(season || "");
  if (!match) return season || "—";
  return match[3]
    ? `Ch. ${match[1]} ${t("season.mini")}`
    : `Ch. ${match[1]} S${match[2]}`;
}

// Valeur numérique pour trier les saisons (la mini-saison vient après S4)
function seasonValue(season) {
  const match = /^c(\d+)(?:s(\d+)|(ms))$/i.exec(season || "");
  if (!match) return 0;
  return Number(match[1]) * 100 + (match[3] ? 45 : Number(match[2]) * 10);
}

// "45 %" en français, "45%" en anglais
function percentText(n) {
  return window.I18N.lang === "fr" ? `${n} %` : `${n}%`;
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
  $("progress").textContent = percentText(percent);
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

  updateSeasonStats();
}

// Progression par saison (la plus récente d'abord). Les esprits pas encore
// sortis ne comptent pas, sauf s'ils sont déjà possédés. Un clic sur une
// saison l'affiche dans la liste (re-clic : toutes les saisons).
function updateSeasonStats() {
  const container = $("season-stats");
  if (!container) return;
  const bySeason = new Map();
  spirits.forEach(spirit => {
    if (!spirit.season) return;
    const state = getState(spirit);
    if (spirit.unreleased && !state.owned) return;
    const s = bySeason.get(spirit.season) || { total: 0, owned: 0, mastered: 0 };
    s.total++;
    if (state.owned) s.owned++;
    if (state.mastered) s.mastered++;
    bySeason.set(spirit.season, s);
  });

  container.replaceChildren(...[...bySeason.keys()]
    .sort((a, b) => seasonValue(b) - seasonValue(a))
    .map(season => {
      const { total, owned, mastered } = bySeason.get(season);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "season-stat";
      card.classList.toggle("active", seasonFilter.value === season);
      card.classList.toggle("complete", mastered === total);
      card.setAttribute("aria-pressed", String(seasonFilter.value === season));
      card.title = seasonFilter.value === season
        ? t("season.showAll")
        : t("season.showOnly", { season: seasonLabel(season) });

      const head = document.createElement("span");
      head.className = "season-stat-head";
      const name = document.createElement("strong");
      name.textContent = seasonLabel(season);
      const percent = document.createElement("span");
      percent.textContent = (mastered === total ? "✓ " : "") + percentText(Math.round(mastered / total * 100));
      head.append(name, percent);

      const bar = document.createElement("span");
      bar.className = "season-stat-bar";
      const barOwned = document.createElement("span");
      barOwned.className = "season-bar-owned";
      barOwned.style.width = (owned / total * 100) + "%";
      const barMastered = document.createElement("span");
      barMastered.className = "season-bar-mastered";
      barMastered.style.width = (mastered / total * 100) + "%";
      bar.append(barOwned, barMastered);

      const counts = document.createElement("span");
      counts.className = "season-stat-counts";
      const o = document.createElement("span");
      o.className = "count-owned";
      o.textContent = t("season.ownedCount", { owned, total });
      const m = document.createElement("span");
      m.className = "count-mastered";
      m.textContent = `👑 ${mastered}/${total}`;
      counts.append(o, m);

      card.append(head, bar, counts);
      card.addEventListener("click", () => {
        seasonFilter.value = seasonFilter.value === season ? "" : season;
        seasonFilter.dispatchEvent(new Event("change"));
      });
      return card;
    }));
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
      window.I18N.DICT.fr[`rarity.${spirit.rarity}`] || "",
      window.I18N.DICT.en[`rarity.${spirit.rarity}`] || "",
      seasonLabel(spirit.season),
      spirit.season?.endsWith("ms") ? "mini-saison mini season" : "",
      spirit.unreleased ? "pas encore sorti bientôt leak not out yet soon upcoming" : ""
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

  // clic sur l'image ou le nom : fiche de l'esprit (ce qu'il fait)
  [art, title].forEach(zone => {
    zone.classList.add("opens-detail");
    zone.tabIndex = zone === art ? 0 : -1;
    zone.setAttribute("role", zone === art ? "button" : "presentation");
    if (zone === art) zone.setAttribute("aria-label", t("card.details", { name }));
    zone.addEventListener("click", () => openSpiritDetail(spirit));
    zone.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSpiritDetail(spirit);
      }
    });
  });

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
    upcoming.textContent = t("card.upcoming");
    tags.append(upcoming);
  }

  if (spirit.season) {
    const season = document.createElement("span");
    season.className = "tag season-tag";
    season.textContent = seasonLabel(spirit.season);
    tags.append(season);
  }

  const owned = createCheckbox(t("card.owned"), "check-owned", saved.owned);
  const mastered = createCheckbox(t("card.mastered"), "check-mastered", saved.mastered);

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
      title.textContent = spirit.season ? seasonLabel(spirit.season) : t("season.others");
      const small = document.createElement("span");
      small.textContent = t("season.count", { n: count });
      title.append(small);
      fragment.append(title);
    }
    fragment.append(createCard(spirit));
  });
  spiritsElement.replaceChildren(fragment);

  emptyElement.hidden = visible.length > 0 || spirits.length === 0;

  if (spirits.length) {
    statusElement.textContent = t("list.count", { n: visible.length, total: spirits.length });
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
  toast(t("backup.exported"));
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
    toast(t("detect.none"));
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
  const message = t("detect.confirm", {
    n: updates.length, mastered: masteredCount, plain: updates.length - masteredCount,
    newOwned, newMastered, unknown: unknown.length,
    unknownList: unknown.slice(0, 5).join(", ") + (unknown.length > 5 ? "…" : "")
  });

  if (!confirm(message)) return;

  updates.forEach(({ spirit, mastered }) => {
    const key = getKey(spirit);
    const state = getState(spirit);
    progress[key] = { owned: true, mastered: state.mastered || mastered };
  });

  saveProgress();
  renderSpirits();
  toast(t("detect.done", { newOwned, newMastered }));
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

    if (!confirm(t("backup.importConfirm", { n: Object.keys(clean).length }))) {
      return;
    }

    progress = clean;
    saveProgress();
    renderSpirits();
    toast(t("backup.imported"));
  } catch (error) {
    console.error(error);
    toast(t("backup.invalid"));
  }
}

function resetProgress() {
  if (!confirm(t("backup.resetConfirm"))) {
    return;
  }
  progress = {};
  saveProgress();
  renderSpirits();
  toast(t("backup.resetDone"));
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
    toast(t("scan.noImages"));
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
      $("scan-progress-label").textContent = t("scan.loading");
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
      ? t("scan.loadError")
      : t("scan.error"));
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
    el("strong", null, t("scan.doubtTitle", { n: items.length })),
    el("p", "scan-note", t("scan.doubtHelp"))
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
      buttons.replaceWith(el("div", "scan-tile-badge", mastered ? t("scan.addedCrown") : t("scan.added1")));
    };
    const owned = el("button", "scan-confirm secondary", t("scan.haveIt"));
    const crowned = el("button", "scan-confirm" + (d.crowned ? "" : " secondary"), t("scan.mastered"));
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
      el("strong", null, result.doubtful?.length ? t("scan.noneSure") : t("scan.none")),
      el("span", null, t("scan.noneHelp"))
    );
    head.append(summary);
    report.append(head);
    appendDoubtful(report, result);
    return;
  }

  summary.append(
    el("strong", null, t("scan.summary", { n: rows.length, files: result.files })),
    el("span", null, t("scan.added", { owned: info.newOwned, mastered: info.newMastered }))
  );

  const undo = el("button", "secondary", t("scan.undo"));
  undo.type = "button";
  undo.addEventListener("click", () => {
    progress = JSON.parse(info.before);
    saveProgress();
    renderSpirits();
    report.hidden = true;
    toast(t("scan.undone"));
  });

  const close = el("button", "icon-button", "✕");
  close.type = "button";
  close.setAttribute("aria-label", t("scan.close"));
  close.addEventListener("click", () => { report.hidden = true; });

  head.append(summary, undo, close);
  report.append(head);

  appendDoubtful(report, result);

  if (info.uncertain) {
    report.append(el("p", "scan-note", t("scan.cutTop", { n: info.uncertain })));
  }

  // Esprits attendus de la même saison mais absents des captures
  const seasons = new Set(rows.map(r => r.spirit.season));
  const seenKeys = new Set(rows.map(r => getKey(r.spirit)));
  const missing = spirits.filter(s =>
    seasons.has(s.season) && !s.unreleased && !seenKeys.has(getKey(s)) && !getState(s).owned);
  if (missing.length && missing.length <= 40) {
    report.append(el("p", "scan-note", t("scan.notSeen", {
      n: missing.length,
      list: missing.map(s => `${displayName(s)}${s.variant !== "base" ? " " + variantLabel(s.variant) : ""}`).join(", ")
    })));
  }

  const details = el("details", "scan-details");
  const sum = el("summary", null, t("scan.details"));
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
        mastered ? t("scan.mastered") : t("scan.owned"));
      if (isNewMastered || isNewOwned) badge.append(el("span", "scan-new", t("scan.new")));
      tile.append(img, label, badge);
      grid.append(tile);
    });
  details.append(grid);
  report.append(details);

  if (result.unknown.length) {
    const unk = el("details", "scan-details");
    unk.append(el("summary", null, t("scan.unknown", { n: result.unknown.length })));
    const ugrid = el("div", "scan-grid");
    result.unknown.forEach(u => {
      const tile = el("div", "scan-tile");
      const img = el("img");
      img.src = u.thumb;
      img.alt = "";
      tile.append(img, el("div", "scan-tile-name", t("scan.unknownTile")));
      ugrid.append(tile);
    });
    unk.append(el("p", "scan-note", t("scan.unknownHelp")), ugrid);
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

/* ---------- Filtres en boutons (façon fortnite.gg) ---------- */

// Chaque rangée de boutons reflète un <select> caché, qui garde la valeur et
// déclenche "change" (le reste du code ne lit que les <select>).
const chipRenderers = [];
function chipRow(select, container, { first = null, short = null, rarity = false } = {}) {
  function render() {
    const fragment = document.createDocumentFragment();
    [...select.options].forEach((option, i) => {
      const chip = el("button", "chip");
      chip.type = "button";
      chip.textContent = i === 0 && option.value === "" && first ? t(first) : (short ? short(option.value, option.text) : option.text);
      if (rarity && option.value) chip.classList.add("chip-rarity", `rarity-${option.value}`);
      const active = option.value === select.value;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
      chip.addEventListener("click", () => {
        if (select.value === option.value) return;
        select.value = option.value;
        select.dispatchEvent(new Event("change"));
      });
      fragment.append(chip);
    });
    container.replaceChildren(fragment);
    // rangée qui défile (téléphone) : le bouton choisi reste visible
    const active = container.querySelector(".active");
    if (active && container.scrollWidth > container.clientWidth) {
      container.scrollLeft = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
    }
  }
  // options recréées quand le catalogue change ; valeur changée par le code
  new MutationObserver(render).observe(select, { childList: true });
  select.addEventListener("change", render);
  chipRenderers.push(render);
  render();
}

chipRow(seasonFilter, $("season-chips"), { first: "filter.all" });
chipRow(rarityFilter, $("rarity-chips"), { first: "filter.all", rarity: true });
chipRow(variantFilter, $("variant-chips"), { first: "filter.all" });
chipRow(sortElement, $("sort-chips"));

/* ---------- Thèmes ---------- */

const THEME_KEY = "spirit-tracker-theme";
// [valeur, clé du nom (i18n.js), couleurs de la pastille (fond, accent)]
const THEMES = [
  ["", "theme.violet", "#10111b", "#7651e8"],
  ["sombre", "theme.sombre", "#0b0b0e", "#6b7280"],
  ["clair", "theme.clair", "#eef0f6", "#6a43e0"],
  ["fortnite", "theme.fortnite", "#0e2865", "#f8e548"],
  ["hacker", "theme.hacker", "#050a07", "#19c35a"],
  ["rose", "theme.rose", "#2a1729", "#e0479e"]
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
    const text = document.createElement("span");
    text.dataset.i18n = label;
    text.textContent = t(label);
    option.append(swatch, text);
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
  const customOption = addOption("perso", "theme.custom", "", () => openCustomTheme(), "theme-custom-option");
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
    preview.textContent = img ? "" : t("custom.none");
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
      toast(t("custom.badImage"));
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

/* ---------- Fiche d'un esprit (clic sur la carte) ---------- */

const DETAILS = window.SPIRITS_DETAILS || { strings: { en: [], fr: [] }, map: {} };

// Phrase n° i dans la langue choisie (anglais si la traduction manque)
function detailText(i) {
  if (i == null || i < 0) return "";
  const text = DETAILS.strings[window.I18N.lang]?.[i] || DETAILS.strings.en[i] || "";
  return window.I18N.typo(text.replace(/ -> /g, " → "));
}

// "2,700" -> "2 700" et "0.53%" -> "0,53 %" en français
function detailNumber(value) {
  if (window.I18N.lang !== "fr") return value;
  return String(value).replace(/,/g, " ").replace(/\./g, ",").replace(/%$/, " %");
}

let detailSpirit = null;

function openSpiritDetail(spirit) {
  detailSpirit = spirit;
  fillSpiritDetail();
  const dialog = $("spirit-detail");
  if (!dialog.open) dialog.showModal();
}

function fillSpiritDetail() {
  const spirit = detailSpirit;
  if (!spirit) return;
  const state = getState(spirit);
  const name = displayName(spirit);
  const variant = spirit.variant !== "base" ? ` ${variantLabel(spirit.variant)}` : "";

  const img = $("sd-img");
  img.onerror = () => { if (spirit.remoteUrl && img.src !== spirit.remoteUrl) img.src = spirit.remoteUrl; };
  img.src = spirit.url;
  img.alt = name;
  const box = $("spirit-detail");
  box.className = `spirit-detail rarity-${spirit.rarity || "unknown"}`;
  box.classList.toggle("owned", state.owned);
  box.classList.toggle("mastered", state.mastered);
  $("sd-name").textContent = name + variant;

  const tags = $("sd-tags");
  tags.replaceChildren(el("span", "tag rarity-tag", rarityLabel(spirit.rarity)),
    el("span", "tag", variantLabel(spirit.variant)));
  if (spirit.unreleased) tags.append(el("span", "tag upcoming-tag", t("card.upcoming")));
  if (spirit.season) tags.append(el("span", "tag", seasonLabel(spirit.season)));

  // mêmes cases que sur la carte (Maîtrisé implique Possédé)
  const checks = $("sd-checks");
  const owned = createCheckbox(t("card.owned"), "check-owned", state.owned);
  const mastered = createCheckbox(t("card.mastered"), "check-mastered", state.mastered);
  const save = next => {
    const key = getKey(spirit);
    if (next.owned || next.mastered) progress[key] = next; else delete progress[key];
    saveProgress();
    renderSpirits();
    fillSpiritDetail();
  };
  owned.input.addEventListener("change", () =>
    save({ owned: owned.input.checked, mastered: owned.input.checked && mastered.input.checked }));
  mastered.input.addEventListener("change", () =>
    save({ owned: mastered.input.checked || owned.input.checked, mastered: mastered.input.checked }));
  checks.replaceChildren(owned.wrapper, mastered.wrapper);

  const body = $("sd-body");
  body.replaceChildren();
  const info = DETAILS.map[spirit.spriteId];
  if (!info) {
    body.append(el("p", "sd-empty", t("detail.noInfo")));
  } else {
    const [bonus, descs, place, cost, chest] = info;
    if (bonus >= 0) {
      const section = el("div", "sd-section sd-bonus");
      section.append(el("h3", null, t("detail.variantBonus")), el("p", null, detailText(bonus)));
      body.append(section);
    }
    if (descs.length) {
      const section = el("div", "sd-section");
      section.append(el("h3", null, t("detail.ability")));
      descs.forEach(i => section.append(el("p", null, detailText(i))));
      body.append(section);
    }
    const facts = el("div", "sd-facts");
    const fact = (label, value) => {
      const row = el("div", "sd-fact");
      row.append(el("span", null, label), el("b", null, value));
      facts.append(row);
    };
    if (place >= 0) fact(t("detail.location"), detailText(place));
    if (cost && cost !== "0") fact(t("detail.summonCost"), detailNumber(cost));
    if (chest && chest !== "0%") fact(t("detail.chestChance"), detailNumber(chest));
    if (facts.childElementCount) body.append(facts);
  }
  $("sd-link").href = `https://fortnite.gg/sprites/${spirit.spriteId}`;
}

$("sd-close").addEventListener("click", () => $("spirit-detail").close());
// clic sur le fond sombre autour de la fiche : on ferme
$("spirit-detail").addEventListener("click", event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

/* ---------- Langue (FR / EN) ---------- */

function refreshLanguageButtons() {
  document.querySelectorAll(".lang-switch [data-lang]").forEach(button => {
    const active = button.dataset.lang === window.I18N.lang;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.querySelectorAll(".lang-switch [data-lang]").forEach(button =>
  button.addEventListener("click", () => window.I18N.set(button.dataset.lang)));

window.addEventListener("langchange", () => {
  refreshLanguageButtons();
  populateFilters();                 // noms des raretés et des saisons
  chipRenderers.forEach(render => render());
  renderSpirits();
  if ($("spirit-detail").open) fillSpiritDetail();
  const report = $("scan-report");   // rapport de scan : dans l'ancienne langue, on le referme
  if (!report.hidden) report.hidden = true;
});

window.I18N.apply();
refreshLanguageButtons();
chipRenderers.forEach(render => render()); // libellés du tri, déjà traduits

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
