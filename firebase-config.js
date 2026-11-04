// Configuration Firebase pour la synchronisation entre appareils.
// Ces valeurs ne sont pas secrètes (elles identifient juste le projet) :
// la protection vient des règles Firestore, qui ne laissent chacun lire et
// écrire que sa propre progression (progress/<identifiant du compte>).
// Mettre `null` pour masquer la synchronisation.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBkx_QSO6fGN-a8n5zeWcSM4UYEnImULWU",
  authDomain: "spirit-tracker-2ca8c.firebaseapp.com",
  projectId: "spirit-tracker-2ca8c",
  storageBucket: "spirit-tracker-2ca8c.firebasestorage.app",
  messagingSenderId: "346301212379",
  appId: "1:346301212379:web:78ae1ddffead6d8c074efe"
};
