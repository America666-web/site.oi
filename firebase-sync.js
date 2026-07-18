/* ==========================================================================
   SiteMarket — firebase-sync.js
   Двусторонняя синхронизация localStorage <-> Firestore.

   Идея: весь остальной код (storage.js, admin.js, author.js и т.д.)
   продолжает читать данные из localStorage синхронно, как раньше — это
   не пришлось переписывать. А эта прослойка в фоне:
     1) слушает Firestore в реальном времени и обновляет localStorage,
        как только что-то меняется на ЛЮБОМ устройстве (onSnapshot);
     2) когда что-то меняется локально, storage.js зовёт smSyncPush /
        smSyncDelete, чтобы отправить изменение в Firestore.

   После каждого обновления из облака кидается событие 'sm:sync' —
   страницы могут на него подписаться и перерисовать список (см. app.js,
   admin.js, author.js), чтобы новые данные появлялись сами, без
   перезагрузки страницы.
   ========================================================================== */

const SM_SYNC_COLLECTIONS = [
  { name: 'listings', localKey: SM_KEYS.listings },
  { name: 'moderation', localKey: SM_KEYS.moderation },
  { name: 'users', localKey: SM_KEYS.users },
  { name: 'promocodes', localKey: SM_KEYS.promocodes },
  { name: 'developers', localKey: SM_KEYS.developers },
  { name: 'applications', localKey: SM_KEYS.applications },
  { name: 'supportMessages', localKey: SM_KEYS.supportMessages },
  { name: 'reports', localKey: SM_KEYS.reports }
];

function smSyncPush(collectionName, docId, data) {
  if (!smFirebaseReady || !smDb || docId === undefined || docId === null) return;
  try {
    smDb.collection(collectionName).doc(String(docId)).set(data, { merge: true })
      .catch(function (e) { console.warn('[sync] не удалось отправить в облако:', collectionName, docId, e); });
  } catch (e) { console.warn('[sync] ошибка отправки:', e); }
}

function smSyncDelete(collectionName, docId) {
  if (!smFirebaseReady || !smDb || docId === undefined || docId === null) return;
  try {
    smDb.collection(collectionName).doc(String(docId)).delete()
      .catch(function (e) { console.warn('[sync] не удалось удалить в облаке:', collectionName, docId, e); });
  } catch (e) { console.warn('[sync] ошибка удаления:', e); }
}

function smSyncSetDoc(path, data) {
  if (!smFirebaseReady || !smDb) return;
  try {
    smDb.doc(path).set(data, { merge: false })
      .catch(function (e) { console.warn('[sync] не удалось сохранить настройки:', path, e); });
  } catch (e) { console.warn('[sync] ошибка сохранения настроек:', e); }
}

function smSyncNotify(collectionName) {
  try {
    window.dispatchEvent(new CustomEvent('sm:sync', { detail: { collection: collectionName } }));
  } catch (e) { /* старые браузеры без CustomEvent — просто игнорируем */ }
}

// Слушать изменения из Firestore в реальном времени и обновлять localStorage
function smStartSync() {
  if (!smFirebaseReady || !smDb) return;

  SM_SYNC_COLLECTIONS.forEach(function (col) {
    smDb.collection(col.name).onSnapshot(function (snapshot) {
      const arr = [];
      snapshot.forEach(function (doc) { arr.push(doc.data()); });
      localStorage.setItem(col.localKey, JSON.stringify(arr));
      smSyncNotify(col.name);
    }, function (err) {
      console.warn('[sync] ошибка подписки на', col.name, err);
    });
  });

  smDb.doc('meta/platformSettings').onSnapshot(function (doc) {
    if (doc.exists) {
      localStorage.setItem(SM_KEYS.platformSettings, JSON.stringify(doc.data()));
      smSyncNotify('platformSettings');
    }
  });
  smDb.doc('meta/appSettings').onSnapshot(function (doc) {
    if (doc.exists) {
      localStorage.setItem(SM_KEYS.appSettings, JSON.stringify(doc.data()));
      smSyncNotify('appSettings');
    }
  });
  smDb.doc('meta/policies').onSnapshot(function (doc) {
    if (doc.exists) {
      localStorage.setItem(SM_KEYS.policies, JSON.stringify(doc.data()));
      smSyncNotify('policies');
    }
  });

  console.log('[sync] Синхронизация с облаком запущена.');
}

// Одноразовый перенос локальных данных в облако — срабатывает только если
// в Firestore ещё вообще ничего нет (например, самый первый запуск после
// подключения Firebase на первом устройстве).
async function smMigrateIfNeeded() {
  if (!smFirebaseReady || !smDb) return;
  if (localStorage.getItem('sm_fb_migrated_v1')) return;

  try {
    const snap = await smDb.collection('listings').limit(1).get();
    const usersSnap = await smDb.collection('users').limit(1).get();

    if (snap.empty && usersSnap.empty) {
      const pushArray = async function (colName, localKey, idField) {
        let items = [];
        try { items = JSON.parse(localStorage.getItem(localKey) || '[]'); } catch (e) { items = []; }
        for (const item of items) {
          const id = item[idField];
          if (id === undefined || id === null || id === '') continue;
          await smDb.collection(colName).doc(String(id)).set(item, { merge: true });
        }
      };

      await pushArray('listings', SM_KEYS.listings, 'id');
      await pushArray('moderation', SM_KEYS.moderation, 'listingId');
      await pushArray('promocodes', SM_KEYS.promocodes, 'code');
      await pushArray('developers', SM_KEYS.developers, 'id');
      await pushArray('applications', SM_KEYS.applications, 'id');
      await pushArray('supportMessages', SM_KEYS.supportMessages, 'id');
      await pushArray('reports', SM_KEYS.reports, 'id');

      let users = [];
      try { users = JSON.parse(localStorage.getItem(SM_KEYS.users) || '[]'); } catch (e) { users = []; }
      for (const u of users) {
        if (!u.email) continue;
        await smDb.collection('users').doc(u.email.toLowerCase()).set(u, { merge: true });
      }

      let platformSettings = { commissionRate: 10 };
      try { platformSettings = JSON.parse(localStorage.getItem(SM_KEYS.platformSettings) || '{"commissionRate":10}'); } catch (e) {}
      await smDb.doc('meta/platformSettings').set(platformSettings);

      let appSettings = { open: true };
      try { appSettings = JSON.parse(localStorage.getItem(SM_KEYS.appSettings) || '{"open":true}'); } catch (e) {}
      await smDb.doc('meta/appSettings').set(appSettings);

      let policies = null;
      try { policies = JSON.parse(localStorage.getItem(SM_KEYS.policies) || 'null'); } catch (e) {}
      if (policies) await smDb.doc('meta/policies').set(policies);

      console.log('[sync] Локальные данные перенесены в облако (первый запуск).');
    }
  } catch (e) {
    console.warn('[sync] Не удалось выполнить перенос данных в облако:', e);
  } finally {
    localStorage.setItem('sm_fb_migrated_v1', '1');
  }
}

(function smBootSync() {
  if (typeof firebase === 'undefined' || !smFirebaseReady) return;
  smMigrateIfNeeded().then(function () {
    smStartSync();
  });
})();
