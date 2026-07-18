/* ==========================================================================
   SiteMarket — firebase-config.js
   Инициализация Firebase (Firestore + Storage) для синхронизации данных
   между устройствами. Работает поверх localStorage: если Firebase недоступен
   (нет интернета, не настроен) — сайт продолжает работать локально, как раньше.
   ========================================================================== */

const SM_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCggJHbMHmrNED1UIr57v2hPreHYyhRBbk",
  authDomain: "site-ee45a.firebaseapp.com",
  projectId: "site-ee45a",
  storageBucket: "site-ee45a.firebasestorage.app",
  messagingSenderId: "1054570730634",
  appId: "1:1054570730634:web:060fae4de45454bfda4973",
  measurementId: "G-9GQMHV6M3R"
};

let smDb = null;
let smStorage = null;
let smFirebaseReady = false;

try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(SM_FIREBASE_CONFIG);
    smDb = firebase.firestore();
    smStorage = firebase.storage();
    smFirebaseReady = true;
    console.log('[firebase-config] Firebase инициализирован, синхронизация включена.');
  } else {
    console.warn('[firebase-config] SDK Firebase не загружен — сайт работает только локально (localStorage), без синхронизации между устройствами.');
  }
} catch (e) {
  console.warn('[firebase-config] Не удалось инициализировать Firebase, работаем в локальном режиме:', e);
  smFirebaseReady = false;
}
