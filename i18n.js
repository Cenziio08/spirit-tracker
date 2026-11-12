// Textes du site en français et en anglais (bouton FR / EN en haut).
// Chargé dans <head> : la langue est appliquée avant l'affichage.
//   I18N.t("clé", { n: 3 })  -> texte dans la langue choisie
//   éléments HTML : data-i18n="clé" (texte), data-i18n-html="clé" (avec balises),
//                   data-i18n-attr="placeholder:clé;aria-label:clé2"
// Changer de langue déclenche l'événement "langchange" sur window.

(function () {
  "use strict";

  const s = n => (n > 1 ? "s" : "");             // pluriel français
  const es = n => (n === 1 ? "" : "s");          // pluriel anglais

  const DICT = {
    fr: {
      "meta.description": "Suis ta collection d'esprits Fortnite : possédés, maîtrisés, scanner de captures et de photos.",
      "lang.switch": "Langue",
      "theme.button": "Thème",
      "theme.title": "Changer de thème",
      "theme.violet": "Violet (d'origine)",
      "theme.sombre": "Sombre",
      "theme.clair": "Clair",
      "theme.fortnite": "Fortnite",
      "theme.hacker": "Système hacké",
      "theme.rose": "Rose bonbon",
      "theme.custom": "Mon thème…",

      "stats.owned": "Esprits possédés",
      "stats.mastered": "Maîtrisés",
      "stats.progress": "Progression",
      "stats.bySeason": "Progression par saison",
      "season.showAll": "Afficher toutes les saisons",
      "season.showOnly": v => `Afficher seulement ${v.season}`,
      "season.ownedCount": v => `${v.owned}/${v.total} possédés`,
      "season.mini": "Mini-saison",
      "season.others": "Autres",
      "season.count": v => `${v.n} esprit${s(v.n)}`,

      "share.button": "📥 Télécharger l'image de ma collection",
      "share.creating": "Création de l'image…",
      "share.empty": "Aucun esprit à mettre dans l'image pour cette saison.",
      "share.done": "Image téléchargée !",
      "share.fileProtocol": "Impossible ici : ouvre le site en ligne pour télécharger l'image.",
      "share.error": "Impossible de créer l'image, réessaie.",
      "share.title": "Ma collection d'esprits",
      "image.allSeasons": "Toutes les saisons",
      "image.owned": "POSSÉDÉS",
      "image.mastered": "MAÎTRISÉS",

      "scan.aria": "Ajouter des captures d'écran de ta collection",
      "scan.title": "Scanne ta collection depuis le jeu",
      "scan.desktop": "Glisse tes captures d'écran ou photos ici, clique pour les choisir, ou fais <kbd>Ctrl</kbd>+<kbd>V</kbd> après une capture.",
      "scan.touch": "Touche ici pour prendre une photo de l'écran ou choisir des images.",
      "scan.hint": "Dans le jeu : Esprits → fais défiler la liste, une image par écran. L'ordre n'a pas d'importance.",
      "tips.summary": "📱 Conseils pour les photos prises au téléphone",
      "tips.1": "<strong>Bien en face</strong> de l'écran, téléphone droit (pas en biais).",
      "tips.2": "<strong>La grille des esprits en grand</strong> : rapproche-toi pour qu'elle remplisse la photo.",
      "tips.3": "<strong>Pas de reflet</strong> sur l'écran (éteins la lumière derrière toi si besoin).",
      "tips.4": "<strong>Photo nette</strong> : appuie sur l'écran du téléphone pour faire la mise au point.",
      "tips.5": "Une capture d'écran reste toujours plus fiable qu'une photo, si c'est possible.",
      "scan.analysing": "Analyse…",
      "scan.loading": "Chargement du scanner…",
      "scan.file": v => `Analyse de ${v.name}…`,
      "scan.fileN": v => `Analyse de l'image ${v.n}…`,
      "scan.finished": "Analyse terminée",
      "scan.noImages": "Ajoute des images (captures d'écran du jeu).",
      "scan.loadError": "Le scanner n'a pas pu se charger : vérifie ta connexion et réessaie.",
      "scan.error": "Erreur pendant l'analyse des captures.",
      "scan.noneSure": "Aucun esprit reconnu avec certitude.",
      "scan.none": "Aucun esprit reconnu.",
      "scan.noneHelp": " Vérifie que l'image montre bien la grille des esprits (onglet Esprits). Pour une photo : bien en face, nette, sans reflet.",
      "scan.summary": v => `${v.n} esprit${s(v.n)} reconnu${s(v.n)} sur ${v.files} image${s(v.files)}`,
      "scan.added": v => ` — +${v.owned} possédé${s(v.owned)}, +${v.mastered} maîtrisé${s(v.mastered)} ajouté${s(v.owned + v.mastered)} à ta collection.`,
      "scan.undo": "Annuler",
      "scan.undone": "Scan annulé : ta progression est revenue à son état d'avant.",
      "scan.close": "Fermer le rapport",
      "scan.cutTop": v => v.n > 1
        ? `${v.n} esprits étaient coupés en haut de la capture : leur couronne n'était pas visible. Ils sont cochés « Possédé » ; vérifie leur maîtrise ou ajoute une capture où ils apparaissent en entier.`
        : "1 esprit était coupé en haut de la capture : sa couronne n'était pas visible. Il est coché « Possédé » ; vérifie sa maîtrise ou ajoute une capture où il apparaît en entier.",
      "scan.notSeen": v => `Absents de tes captures (${v.n}) : ${v.list}. Si tu les as, ajoute une capture de l'endroit où ils apparaissent.`,
      "scan.details": "Voir le détail des esprits reconnus",
      "scan.owned": "✓ Possédé",
      "scan.mastered": "👑 Maîtrisé",
      "scan.new": " nouveau",
      "scan.unknown": v => `${v.n} case${s(v.n)} non reconnue${s(v.n)}`,
      "scan.unknownTile": "Non reconnu",
      "scan.unknownHelp": "Souvent un esprit tout nouveau : il faut mettre à jour la liste des esprits du site.",
      "scan.doubtTitle": v => `À vérifier (${v.n})`,
      "scan.doubtHelp": "Le scanner n'est pas sûr de ceux-là (photo floue ou de biais). Confirme ceux qui sont justes, en précisant s'ils ont la couronne ; les autres seront ignorés.",
      "scan.haveIt": "✓ Je l'ai",
      "scan.added1": "✓ Ajouté",
      "scan.addedCrown": "👑 Ajouté",

      "search.placeholder": "Rechercher un esprit…",
      "filter.season": "Saison",
      "filter.status": "Statut",
      "filter.rarity": "Rareté",
      "filter.variant": "Variante",
      "filter.sort": "Tri",
      "filter.all": "Toutes",
      "status.all": "Tous",
      "status.owned": "Possédés",
      "status.missing": "Manquants",
      "status.mastered": "Maîtrisés",
      "status.unmastered": "À maîtriser",
      "status.unmasteredTitle": "Possédés mais pas maîtrisés",
      "sort.name": "Nom",
      "sort.rarity": "Rareté",
      "sort.season": "Saison",
      "sort.status": "À faire d'abord",

      "list.loading": "Chargement du catalogue…",
      "list.count": v => `${v.n} esprit${s(v.n)} affiché${s(v.n)} sur ${v.total}.`,
      "list.empty": "Aucun esprit ne correspond à ta recherche.",
      "card.owned": "Possédé",
      "card.mastered": "Maîtrisé",
      "card.upcoming": "Pas encore sorti",
      "card.details": v => `Voir ce que fait ${v.name}`,

      "rarity.common": "Commun",
      "rarity.uncommon": "Peu commun",
      "rarity.rare": "Rare",
      "rarity.epic": "Épique",
      "rarity.legendary": "Légendaire",
      "rarity.mythic": "Mythique",
      "rarity.special": "Spécial",
      "rarity.unknown": "Inconnue",

      "detail.close": "Fermer",
      "detail.variantBonus": "Bonus de la variante",
      "detail.ability": "Ce qu'il fait",
      "detail.location": "Où le trouver",
      "detail.summonCost": "Coût d'invocation",
      "detail.chestChance": "Probabilité dans un coffre à esprits",
      "detail.noInfo": "Pas encore d'informations sur cet esprit.",

      "backup.title": "Sauvegarde",
      "backup.local": "Ta progression est enregistrée dans ce navigateur. Connecte-toi avec Google pour la retrouver sur tous tes appareils, ou exporte-la en fichier.",
      "backup.synced": "Ta progression est sauvegardée en ligne avec ton compte Google et suit tous tes appareils. L'export reste possible pour garder une copie en fichier.",
      "backup.tip": "📱 Sur téléphone, ajoute le site à ton écran d'accueil (Safari : Partager → « Sur l'écran d'accueil » ; Chrome : ⋮ → « Ajouter à l'écran d'accueil »). Il s'ouvre alors comme une appli, et sur iPhone ta progression ne risque plus d'être effacée si tu ne viens pas pendant une semaine.",
      "backup.export": "Exporter",
      "backup.import": "Importer",
      "backup.reset": "Tout réinitialiser",
      "backup.exported": "Progression exportée.",
      "backup.importConfirm": v => `Importer ${v.n} esprit${s(v.n)} ? Ta progression actuelle sera remplacée.`,
      "backup.imported": "Progression importée !",
      "backup.invalid": "Ce fichier n'est pas une sauvegarde valide.",
      "backup.resetConfirm": "Effacer toute ta progression ? Cette action est irréversible.",
      "backup.resetDone": "Progression réinitialisée.",
      "detect.none": "Aucun esprit de ce fichier n'a été reconnu.",
      "detect.confirm": v => `Détection du jeu : ${v.n} esprit${s(v.n)} reconnu${s(v.n)}\n` +
        `• ${v.mastered} maîtrisé${s(v.mastered)}, ${v.plain} possédé${s(v.plain)} sans couronne\n` +
        `• Nouveautés pour toi : ${v.newOwned} possédé${s(v.newOwned)}, ${v.newMastered} maîtrisé${s(v.newMastered)}\n` +
        (v.unknown ? `• ${v.unknown} non reconnu${s(v.unknown)} : ${v.unknownList}\n` : "") +
        "\nAppliquer ? (rien ne sera décoché)",
      "detect.done": v => `Import terminé : +${v.newOwned} possédé${s(v.newOwned)}, +${v.newMastered} maîtrisé${s(v.newMastered)}.`,

      "sync.title": "☁️ Synchronisation entre appareils",
      "sync.loading": "Chargement…",
      "sync.signin": "Se connecter avec Google",
      "sync.signout": "Se déconnecter",
      "sync.startError": "La synchronisation n'a pas pu démarrer (connexion ?).",
      "sync.loginError": v => `Connexion impossible : ${v.code}`,
      "sync.prompt": "Connecte-toi avec Google pour retrouver ta progression sur tous tes appareils.",
      "sync.ok": v => `✓ Synchronisé (${v.time})`,
      "sync.offline": "⚠️ Pas synchronisé (hors connexion ?). La synchronisation reprendra toute seule.",
      "sync.working": "Synchronisation…",
      "sync.failed": v => `⚠️ Synchronisation impossible pour l'instant : ${v.code}`,
      "sync.remote": v => `✓ Mis à jour depuis un autre appareil (${v.time})`,

      "custom.title": "🎨 Mon thème",
      "custom.bg": "Fond",
      "custom.panel": "Cartes",
      "custom.accent": "Boutons",
      "custom.image": "Image de fond",
      "custom.pick": "🖼️ Choisir une image",
      "custom.remove": "Retirer l'image",
      "custom.none": "Aucune",
      "custom.dim": "Voile sur l'image (pour bien lire)",
      "custom.glass": "Cartes transparentes",
      "custom.reset": "Revenir au violet",
      "custom.done": "Terminé",
      "custom.badImage": "Impossible d'utiliser cette image, choisis-en une autre."
    },

    en: {
      "meta.description": "Track your Fortnite Sprites collection: owned, mastered, and a scanner for screenshots and photos.",
      "lang.switch": "Language",
      "theme.button": "Theme",
      "theme.title": "Change theme",
      "theme.violet": "Purple (original)",
      "theme.sombre": "Dark",
      "theme.clair": "Light",
      "theme.fortnite": "Fortnite",
      "theme.hacker": "System Hacked",
      "theme.rose": "Bubblegum Pink",
      "theme.custom": "My theme…",

      "stats.owned": "Sprites owned",
      "stats.mastered": "Mastered",
      "stats.progress": "Progress",
      "stats.bySeason": "Progress by season",
      "season.showAll": "Show all seasons",
      "season.showOnly": v => `Show only ${v.season}`,
      "season.ownedCount": v => `${v.owned}/${v.total} owned`,
      "season.mini": "Mini Season",
      "season.others": "Other",
      "season.count": v => `${v.n} sprite${es(v.n)}`,

      "share.button": "📥 Download an image of my collection",
      "share.creating": "Creating the image…",
      "share.empty": "No sprites to put in the image for this season.",
      "share.done": "Image downloaded!",
      "share.fileProtocol": "Not possible here: open the online site to download the image.",
      "share.error": "Couldn't create the image. Please try again.",
      "share.title": "My Sprites collection",
      "image.allSeasons": "All seasons",
      "image.owned": "OWNED",
      "image.mastered": "MASTERED",

      "scan.aria": "Add screenshots of your collection",
      "scan.title": "Scan your collection from the game",
      "scan.desktop": "Drop your screenshots or photos here, click to choose them, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> after taking a screenshot.",
      "scan.touch": "Tap here to take a photo of the screen or choose images.",
      "scan.hint": "In the game: Sprites → scroll through the list, one image per screen. The order doesn't matter.",
      "tips.summary": "📱 Tips for photos taken with a phone",
      "tips.1": "<strong>Face the screen straight on</strong>, phone held level (not at an angle).",
      "tips.2": "<strong>Make the Sprites grid big</strong>: move closer so it fills the photo.",
      "tips.3": "<strong>No glare</strong> on the screen (turn off the light behind you if needed).",
      "tips.4": "<strong>Sharp photo</strong>: tap the phone screen to focus.",
      "tips.5": "A screenshot is always more reliable than a photo, if you can take one.",
      "scan.analysing": "Analysing…",
      "scan.loading": "Loading the scanner…",
      "scan.file": v => `Analysing ${v.name}…`,
      "scan.fileN": v => `Analysing image ${v.n}…`,
      "scan.finished": "Analysis complete",
      "scan.noImages": "Add some images (screenshots from the game).",
      "scan.loadError": "The scanner couldn't load: check your connection and try again.",
      "scan.error": "Something went wrong while analysing the screenshots.",
      "scan.noneSure": "No sprites recognised with certainty.",
      "scan.none": "No sprites recognised.",
      "scan.noneHelp": " Make sure the image shows the Sprites grid (Sprites tab). For a photo: straight on, sharp, no glare.",
      "scan.summary": v => `${v.n} sprite${es(v.n)} recognised in ${v.files} image${es(v.files)}`,
      "scan.added": v => ` — +${v.owned} owned, +${v.mastered} mastered added to your collection.`,
      "scan.undo": "Undo",
      "scan.undone": "Scan undone: your progress is back to how it was.",
      "scan.close": "Close the report",
      "scan.cutTop": v => `${v.n} sprite${es(v.n)} ${v.n === 1 ? "was" : "were"} cut off at the top of the screenshot, so the crown wasn't visible. ${v.n === 1 ? "It is" : "They are"} ticked as Owned; check the mastery, or add a screenshot where ${v.n === 1 ? "it is" : "they are"} fully visible.`,
      "scan.notSeen": v => `Not seen in your screenshots (${v.n}): ${v.list}. If you have them, add a screenshot of where they appear.`,
      "scan.details": "See the recognised sprites",
      "scan.owned": "✓ Owned",
      "scan.mastered": "👑 Mastered",
      "scan.new": " new",
      "scan.unknown": v => `${v.n} unrecognised slot${es(v.n)}`,
      "scan.unknownTile": "Not recognised",
      "scan.unknownHelp": "Usually a brand-new sprite: the site's sprite list needs an update.",
      "scan.doubtTitle": v => `To check (${v.n})`,
      "scan.doubtHelp": "The scanner isn't sure about these (blurry or angled photo). Confirm the right ones and say whether they have the crown; the others will be ignored.",
      "scan.haveIt": "✓ I have it",
      "scan.added1": "✓ Added",
      "scan.addedCrown": "👑 Added",

      "search.placeholder": "Search for a sprite…",
      "filter.season": "Season",
      "filter.status": "Status",
      "filter.rarity": "Rarity",
      "filter.variant": "Variant",
      "filter.sort": "Sort",
      "filter.all": "All",
      "status.all": "All",
      "status.owned": "Owned",
      "status.missing": "Missing",
      "status.mastered": "Mastered",
      "status.unmastered": "To master",
      "status.unmasteredTitle": "Owned but not mastered",
      "sort.name": "Name",
      "sort.rarity": "Rarity",
      "sort.season": "Season",
      "sort.status": "Unfinished first",

      "list.loading": "Loading the catalogue…",
      "list.count": v => `Showing ${v.n} of ${v.total} sprites.`,
      "list.empty": "No sprites match your search.",
      "card.owned": "Owned",
      "card.mastered": "Mastered",
      "card.upcoming": "Not out yet",
      "card.details": v => `See what ${v.name} does`,

      "rarity.common": "Common",
      "rarity.uncommon": "Uncommon",
      "rarity.rare": "Rare",
      "rarity.epic": "Epic",
      "rarity.legendary": "Legendary",
      "rarity.mythic": "Mythic",
      "rarity.special": "Special",
      "rarity.unknown": "Unknown",

      "detail.close": "Close",
      "detail.variantBonus": "Variant bonus",
      "detail.ability": "What it does",
      "detail.location": "Where to find it",
      "detail.summonCost": "Summon cost",
      "detail.chestChance": "Sprite Chest drop chance",
      "detail.noInfo": "No information about this sprite yet.",

      "backup.title": "Backup",
      "backup.local": "Your progress is saved in this browser. Sign in with Google to get it on all your devices, or export it to a file.",
      "backup.synced": "Your progress is saved online with your Google account and follows you on all your devices. You can still export it to keep a copy in a file.",
      "backup.tip": "📱 On a phone, add the site to your home screen (Safari: Share → “Add to Home Screen”; Chrome: ⋮ → “Add to Home screen”). It then opens like an app, and on iPhone your progress can no longer be erased if you don't visit for a week.",
      "backup.export": "Export",
      "backup.import": "Import",
      "backup.reset": "Reset everything",
      "backup.exported": "Progress exported.",
      "backup.importConfirm": v => `Import ${v.n} sprite${es(v.n)}? Your current progress will be replaced.`,
      "backup.imported": "Progress imported!",
      "backup.invalid": "This file isn't a valid backup.",
      "backup.resetConfirm": "Erase all your progress? This can't be undone.",
      "backup.resetDone": "Progress reset.",
      "detect.none": "No sprites from this file were recognised.",
      "detect.confirm": v => `Game detection: ${v.n} sprite${es(v.n)} recognised\n` +
        `• ${v.mastered} mastered, ${v.plain} owned without a crown\n` +
        `• New for you: ${v.newOwned} owned, ${v.newMastered} mastered\n` +
        (v.unknown ? `• ${v.unknown} not recognised: ${v.unknownList}\n` : "") +
        "\nApply? (nothing will be unticked)",
      "detect.done": v => `Import complete: +${v.newOwned} owned, +${v.newMastered} mastered.`,

      "sync.title": "☁️ Sync between devices",
      "sync.loading": "Loading…",
      "sync.signin": "Sign in with Google",
      "sync.signout": "Sign out",
      "sync.startError": "Sync couldn't start (check your connection).",
      "sync.loginError": v => `Sign-in failed: ${v.code}`,
      "sync.prompt": "Sign in with Google to get your progress on all your devices.",
      "sync.ok": v => `✓ Synced (${v.time})`,
      "sync.offline": "⚠️ Not synced (offline?). It will resume on its own.",
      "sync.working": "Syncing…",
      "sync.failed": v => `⚠️ Sync isn't possible right now: ${v.code}`,
      "sync.remote": v => `✓ Updated from another device (${v.time})`,

      "custom.title": "🎨 My theme",
      "custom.bg": "Background",
      "custom.panel": "Cards",
      "custom.accent": "Buttons",
      "custom.image": "Background image",
      "custom.pick": "🖼️ Choose an image",
      "custom.remove": "Remove the image",
      "custom.none": "None",
      "custom.dim": "Overlay on the image (for readability)",
      "custom.glass": "See-through cards",
      "custom.reset": "Back to purple",
      "custom.done": "Done",
      "custom.badImage": "Couldn't use this image. Please try another one."
    }
  };

  // Noms français des esprits, tels qu'affichés dans le jeu en français.
  // Seulement ceux dont le nom officiel est connu (sources : le jeu, playnews.gg,
  // fortnite.bte.ar) ; les autres gardent leur nom d'origine.
  // Clé = "parent" de spirits-data.js.
  const NAMES_FR = {
    // Chapitre 7 – Saison 3
    Water: "Esprit de l'eau",
    Earth: "Esprit de la terre",
    Spitfire: "Esprit du feu",
    Duck: "Esprit de canard",
    Ghost: "Esprit fantôme",
    Sleepy: "Esprit onirique",
    Demon: "Esprit démoniaque",
    King: "Esprit royal",
    ZeroPoint: "Esprit du point zéro",
    Fishy: "Poiscaille",
    Soccer: "Foot",
    Grim: "La Faucheuse",
    // Chapitre 7 – Saison 4
    WinnerE: "Esprit du miel",
    // Chapitre 7 – Mini-saison (Chasse aux trésors)
    PeelyBones: "Frécinette pelée",
    Parrot: "Pierroquet",
    BarrelOfFish: "Barry O'Poisson",
    Compass: "Nordbert",
    TreasureChest: "Orlando",
    UnbotheredFish: "Carpe diem",
    TreasureMap: "Marqueswell",
    Squibbly: "Mini Crapoulpe",
    FeedJet: "Escargophone",
    StarLight: "Esprit des songes sereins",
    CoinPile: "Tador"
  };

  // Noms français des variantes (au masculin : « un esprit doré »)
  const VARIANTS_FR = {
    base: "Base",
    gold: "Doré",
    candy: "Gélifié",
    galaxy: "Galactique",
    gem: "Gemme",
    holofoil: "Iridescent",
    cube: "Cubique",
    quack: "Canardesque",
    tricktreat: "Farce ou friandise",
    jeweled: "Chanceux",
    cursed: "Maudit"
  };

  const KEY = "spirit-tracker-lang";
  let lang = "fr";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "fr" || saved === "en") lang = saved;
    else if (!/^fr\b/i.test(navigator.language || "fr")) lang = "en";
  } catch (e) { /* stockage bloqué : français par défaut */ }

  // Français : espace insécable avant ! ? : ; » et après « (pas de « ! » seul en début de ligne)
  function typo(text) {
    if (lang !== "fr" || typeof text !== "string") return text;
    return text.replace(/ ([!?:;»])/g, " $1").replace(/« /g, "« ");
  }

  function t(key, vars = {}) {
    const value = DICT[lang][key] ?? DICT.fr[key];
    if (value == null) return key;
    return typo(typeof value === "function" ? value(vars) : value);
  }

  // Applique les textes aux éléments marqués data-i18n…
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll("[data-i18n-attr]").forEach(el => {
      el.dataset.i18nAttr.split(";").forEach(pair => {
        const [attr, key] = pair.split(":");
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      });
    });
    document.documentElement.lang = lang;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  }

  function set(next) {
    if (next !== "fr" && next !== "en" || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* ignoré */ }
    apply();
    window.dispatchEvent(new Event("langchange"));
  }

  document.documentElement.lang = lang;
  window.I18N = { t, typo, apply, set, get lang() { return lang; }, DICT, NAMES_FR, VARIANTS_FR };
})();
