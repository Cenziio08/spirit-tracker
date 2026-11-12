// Synchronisation de la progression entre appareils (téléphone, PC…)
// avec Firebase : connexion Google, une fiche par personne dans Firestore
// (progress/<identifiant du compte>), mise à jour en direct.
//
// - À la connexion, la progression de l'appareil et celle en ligne sont
//   FUSIONNÉES (rien n'est perdu : possédé/maîtrisé d'un côté ou de l'autre).
// - Ensuite, chaque changement est envoyé, et les changements faits sur un
//   autre appareil arrivent tout seuls.
// Inactif tant que firebase-config.js ne contient pas la configuration.

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
const config = window.FIREBASE_CONFIG;
const box = document.getElementById("sync");

if (config && box && window.SpiritProgress) {
  start().catch(error => {
    console.error(error);
    showStatus("sync.startError");
  });
}

// Message d'état, gardé sous forme de clé pour être retraduit si on change de langue
let lastStatus = null;
function showStatus(key, vars) {
  lastStatus = [key, vars];
  const el = document.getElementById("sync-status");
  if (el) el.textContent = window.I18N.t(key, vars);
}
let lastSignedIn = false;
function showBackupText() {
  const backupText = document.getElementById("backup-text");
  if (backupText) backupText.textContent = window.I18N.t(lastSignedIn ? "backup.synced" : "backup.local");
}
window.addEventListener("langchange", () => {
  if (lastStatus) showStatus(...lastStatus);
  showBackupText();
});

// possédé/maîtrisé de l'un OU de l'autre
function merge(a, b) {
  const out = { ...a };
  for (const [key, value] of Object.entries(b || {})) {
    const prev = out[key] || { owned: false, mastered: false };
    out[key] = {
      owned: !!(prev.owned || value.owned || value.mastered),
      mastered: !!(prev.mastered || value.mastered)
    };
  }
  return out;
}

const time = () => new Date().toLocaleTimeString(window.I18N.lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });

async function start() {
  box.hidden = false;
  const [{ initializeApp }, auth, store] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);
  const app = initializeApp(config);
  const authInstance = auth.getAuth(app);
  const db = store.getFirestore(app);

  const signInButton = document.getElementById("sync-signin");
  const signOutButton = document.getElementById("sync-signout");
  const who = document.getElementById("sync-who");

  signInButton.addEventListener("click", async () => {
    const provider = new auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(authInstance, provider);
    } catch (error) {
      if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
        await auth.signInWithRedirect(authInstance, provider);
      } else if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
        console.error(error);
        showStatus("sync.loginError", { code: error.code || error.message });
      }
    }
  });
  signOutButton.addEventListener("click", () => auth.signOut(authInstance));
  auth.getRedirectResult(authInstance).catch(() => {});

  let unsubscribe = null;
  let pushTimer = null;
  let pending = false;

  auth.onAuthStateChanged(authInstance, async user => {
    unsubscribe?.();
    unsubscribe = null;
    window.SpiritProgress.onSave = null;
    clearTimeout(pushTimer);
    pending = false;

    box.classList.toggle("is-connected", !!user);
    signInButton.hidden = !!user;
    signOutButton.hidden = !user;
    who.textContent = user ? (user.email || user.displayName || "") : "";
    lastSignedIn = !!user;
    showBackupText();
    if (!user) {
      showStatus("sync.prompt");
      return;
    }

    const ref = store.doc(db, "progress", user.uid);
    const push = async () => {
      pending = false;
      try {
        await store.setDoc(ref, {
          data: JSON.stringify(window.SpiritProgress.get()),
          updatedAt: store.serverTimestamp()
        });
        showStatus("sync.ok", { time: time() });
      } catch (error) {
        console.error(error);
        showStatus("sync.offline");
      }
    };

    // 1) fusion de l'appareil et de la version en ligne
    showStatus("sync.working");
    try {
      const snap = await store.getDoc(ref);
      const remote = snap.exists() ? JSON.parse(snap.data().data || "{}") : {};
      const merged = merge(window.SpiritProgress.get(), remote);
      window.SpiritProgress.replace(merged);
      await push();
    } catch (error) {
      console.error(error);
      showStatus("sync.failed", { code: error.code || error.message });
    }

    // 2) envoi des changements faits ici (regroupés, 1 s après le dernier)
    window.SpiritProgress.onSave = () => {
      showStatus("sync.working");
      pending = true;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(push, 1000);
    };

    // 3) réception en direct des changements faits ailleurs
    unsubscribe = store.onSnapshot(ref, snap => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const text = snap.data().data || "{}";
      if (text === JSON.stringify(window.SpiritProgress.get())) return;
      // un changement fait ici est en attente d'envoi : c'est lui qui gagne
      if (pending) return;
      window.SpiritProgress.replace(JSON.parse(text));
      showStatus("sync.remote", { time: time() });
    }, error => console.error(error));
  });
}
