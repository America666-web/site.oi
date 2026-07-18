/* ==========================================================================
   SiteMarket — storage.js
   Локальный кэш (localStorage) + зеркалирование в Firestore (см. firebase-sync.js)
   для синхронизации между устройствами. Если Firebase недоступен — всё
   продолжает работать локально, как в исходной версии сайта.
   ========================================================================== */

const SM_KEYS = {
  users: 'sm_users',
  listings: 'sm_listings',
  session: 'sm_session',
  uidSeq: 'sm_uid_seq',
  locks: 'sm_login_locks',
  promocodes: 'sm_promocodes',
  developers: 'sm_developers',
  applications: 'sm_applications',
  moderation: 'sm_moderation',
  supportMessages: 'sm_support_messages',
  reports: 'sm_reports',
  policies: 'sm_policies',
  appSettings: 'sm_app_settings',
  platformSettings: 'sm_platform_settings'
};

const SM_ALL_PERMISSIONS = [
  'add_listings', 'edit_listings', 'delete_listings',
  'manage_users', 'ban_users', 'manage_roles'
];

const SM_PERMISSION_LABELS = {
  'add_listings': 'Добавление сайтов',
  'edit_listings': 'Редактирование сайтов',
  'delete_listings': 'Удаление сайтов',
  'manage_users': 'Управление пользователями (баланс)',
  'ban_users': 'Блокировка пользователей',
  'manage_roles': 'Назначение администраторов'
};

const SM_CATEGORIES = ['Лендинг', 'Магазин', 'Портфолио', 'Бизнес', 'Блог', 'Другое'];
const SM_BADGES = ['Нет', 'Хит', 'Популярное', 'VIP', 'Новинка'];

const SM_DEFAULT_LISTINGS = [
  // ... ваши товары по умолчанию, или оставьте пустым
];

// Безопасная запись в localStorage: не роняет сайт, если хранилище переполнено
function smSafeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error('[storage] Не удалось сохранить "' + key + '" в localStorage (возможно, переполнено):', e);
    return false;
  }
}

function smSyncPushSafe(col, id, data) {
  if (typeof smSyncPush === 'function') smSyncPush(col, id, data);
}
function smSyncDeleteSafe(col, id) {
  if (typeof smSyncDelete === 'function') smSyncDelete(col, id);
}
function smSyncSetDocSafe(path, data) {
  if (typeof smSyncSetDoc === 'function') smSyncSetDoc(path, data);
}

function smInit() {
  if (!localStorage.getItem(SM_KEYS.listings)) {
    smSafeSet(SM_KEYS.listings, JSON.stringify(SM_DEFAULT_LISTINGS));
  }
  if (!localStorage.getItem(SM_KEYS.users)) {
    smSafeSet(SM_KEYS.users, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.uidSeq)) {
    smSafeSet(SM_KEYS.uidSeq, '1000');
  }
  if (!localStorage.getItem(SM_KEYS.promocodes)) {
    smSafeSet(SM_KEYS.promocodes, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.developers)) {
    smSafeSet(SM_KEYS.developers, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.applications)) {
    smSafeSet(SM_KEYS.applications, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.moderation)) {
    smSafeSet(SM_KEYS.moderation, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.supportMessages)) {
    smSafeSet(SM_KEYS.supportMessages, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.reports)) {
    smSafeSet(SM_KEYS.reports, JSON.stringify([]));
  }
  if (!localStorage.getItem(SM_KEYS.policies)) {
    smSafeSet(SM_KEYS.policies, JSON.stringify({
      userTerms: '<h2>Пользовательское соглашение</h2><p>Здесь будет текст пользовательского соглашения. Администратор может отредактировать этот текст в панели администратора (раздел «Политики»).</p>',
      authorTerms: '<h2>Соглашение соавтора</h2><p>Здесь будет текст соглашения для соавторов (авторов, публикующих сайты на платформе). Администратор может отредактировать этот текст в панели администратора (раздел «Политики»).</p>',
      purchase: '<h2>Политика покупки</h2><p>Здесь будет текст политики покупки (условия возврата, доступа к архиву сайта и т.д.). Администратор может отредактировать этот текст в панели администратора (раздел «Политики»).</p>'
    }));
  }
  if (!localStorage.getItem(SM_KEYS.appSettings)) {
    smSafeSet(SM_KEYS.appSettings, JSON.stringify({ open: true }));
  }
  if (!localStorage.getItem(SM_KEYS.platformSettings)) {
    smSafeSet(SM_KEYS.platformSettings, JSON.stringify({ commissionRate: 10 }));
  }
}

// ---------- Listings ----------
function smGetListings() {
  const data = localStorage.getItem(SM_KEYS.listings);
  return data ? JSON.parse(data) : [];
}
function smSaveListings(list) {
  smSafeSet(SM_KEYS.listings, JSON.stringify(list));
}
function smAddListing(item) {
  const list = smGetListings();
  item.id = 'lp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  if (item.zipData === undefined) item.zipData = null;
  if (item.zipUrl === undefined) item.zipUrl = null;
  if (item.badge === undefined) item.badge = null;
  item.moderationStatus = item.moderationStatus || 'pending';
  item.authorEmail = item.authorEmail || null;
  item.authorName = item.authorName || null;
  list.unshift(item);
  smSaveListings(list);
  smSyncPushSafe('listings', item.id, item);
  // Если есть автор, добавляем в модерацию
  if (item.authorEmail) {
    smAddToModeration(item);
  }
  return item;
}
function smUpdateListing(id, updates) {
  let updatedItem = null;
  const list = smGetListings().map(function (i) {
    if (i.id === id) {
      updatedItem = Object.assign({}, i, updates);
      return updatedItem;
    }
    return i;
  });
  smSaveListings(list);
  if (updatedItem) smSyncPushSafe('listings', id, updatedItem);
}
function smDeleteListing(id) {
  const list = smGetListings().filter(function (i) { return i.id !== id; });
  smSaveListings(list);
  smSyncDeleteSafe('listings', id);
  smDeleteFromModeration(id);
}
function smGetListing(id) {
  return smGetListings().find(function (i) { return i.id === id; });
}
function smGetPublicListings() {
  return smGetListings().filter(function (item) {
    const hasFile = (item.zipData && item.zipData.length > 0) || (item.zipUrl && item.zipUrl.length > 0);
    return hasFile && item.moderationStatus === 'approved';
  });
}
function smApproveListing(id) {
  let updatedItem = null;
  const list = smGetListings().map(i => {
    if (i.id === id) { updatedItem = { ...i, moderationStatus: 'approved' }; return updatedItem; }
    return i;
  });
  smSaveListings(list);
  if (updatedItem) smSyncPushSafe('listings', id, updatedItem);
  smUpdateModeration(id, 'approved');
  smDeleteFromModeration(id);
}
function smRejectListing(id) {
  let updatedItem = null;
  const list = smGetListings().map(i => {
    if (i.id === id) { updatedItem = { ...i, moderationStatus: 'rejected' }; return updatedItem; }
    return i;
  });
  smSaveListings(list);
  if (updatedItem) smSyncPushSafe('listings', id, updatedItem);
  smUpdateModeration(id, 'rejected');
  smDeleteFromModeration(id);
}
function smGetAuthorListings(authorEmail) {
  return smGetListings().filter(function(item) {
    return item.authorEmail && item.authorEmail.toLowerCase() === authorEmail.toLowerCase();
  });
}

// ---------- Users ----------
function smNextUid() {
  const n = parseInt(localStorage.getItem(SM_KEYS.uidSeq) || '1000', 10) + 1;
  smSafeSet(SM_KEYS.uidSeq, String(n));
  return n;
}
function smGetUsers() {
  return JSON.parse(localStorage.getItem(SM_KEYS.users) || '[]');
}
function smSaveUsers(users) {
  smSafeSet(SM_KEYS.users, JSON.stringify(users));
}
function smFindUserByEmail(email) {
  return smGetUsers().find(function (u) {
    return u.email.toLowerCase() === String(email).toLowerCase();
  });
}
function smFindUserByUid(uid) {
  return smGetUsers().find(function (u) { return u.uid === uid; });
}
function smAddUser(user) {
  const users = smGetUsers();
  user.uid = smNextUid();
  user.balance = user.balance || 0;
  user.banned = user.banned || false;
  user.banReason = user.banReason || null;
  user.banExpires = user.banExpires || null;
  user.bannedAt = user.bannedAt || null;
  user.avatarUrl = user.avatarUrl || null;
  user.role = user.role || 'user';
  if (user.role === 'admin' && !user.permissions) {
    user.permissions = [];
  }
  if (user.role === 'owner') {
    user.permissions = SM_ALL_PERMISSIONS.slice();
  }
  if (user.role === 'author') {
    user.authorStatus = user.authorStatus || 'active';
    user.warnCount = user.warnCount || 0;
    user.authorEarnings = user.authorEarnings || 0;
    user.totalSales = user.totalSales || 0;
  }
  user.usedPromocodes = user.usedPromocodes || [];
  user.discount = user.discount || 0;
  users.push(user);
  smSaveUsers(users);
  smSyncPushSafe('users', user.email.toLowerCase(), user);
  return user;
}
function smUpdateUser(email, patch) {
  let updatedUser = null;
  const users = smGetUsers().map(function (u) {
    if (u.email.toLowerCase() === String(email).toLowerCase()) {
      updatedUser = Object.assign({}, u, patch);
      return updatedUser;
    }
    return u;
  });
  smSaveUsers(users);
  if (updatedUser) smSyncPushSafe('users', updatedUser.email.toLowerCase(), updatedUser);
}
function smSetBanned(email, banned, reason, duration) {
  const user = smFindUserByEmail(email);
  if (!user) return;
  const patch = { banned: !!banned };
  if (banned) {
    patch.bannedAt = Date.now();
    patch.banReason = reason || 'Не указана';
    let expires = null;
    if (duration === '7') expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    else if (duration === '14') expires = Date.now() + 14 * 24 * 60 * 60 * 1000;
    else if (duration === '30') expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    else if (duration === 'forever') expires = null;
    patch.banExpires = expires;
  } else {
    patch.banReason = null;
    patch.banExpires = null;
    patch.bannedAt = null;
  }
  smUpdateUser(email, patch);
}
function smAddBalance(email, amount) {
  const user = smFindUserByEmail(email);
  if (!user) return;
  const next = Math.max(0, (user.balance || 0) + Number(amount));
  smUpdateUser(email, { balance: next });
  return next;
}
function smSetRole(email, role) {
  if (!['user', 'author', 'admin', 'owner'].includes(role)) return;
  const user = smFindUserByEmail(email);
  if (!user) return;
  const patch = { role: role };
  if (role === 'author') {
    patch.authorStatus = 'active';
    patch.warnCount = 0;
    patch.authorEarnings = patch.authorEarnings || 0;
    patch.totalSales = patch.totalSales || 0;
  } else {
    patch.authorStatus = null;
    patch.warnCount = 0;
    patch.authorEarnings = 0;
    patch.totalSales = 0;
  }
  smUpdateUser(email, patch);
}
function smSetPermissions(email, permissions) {
  smUpdateUser(email, { permissions: permissions });
}
function smGetUserPermissions(email) {
  const user = smFindUserByEmail(email);
  if (!user) return [];
  if (user.role === 'owner') return SM_ALL_PERMISSIONS.slice();
  return user.permissions || [];
}
function smHasPermission(email, permission) {
  const perms = smGetUserPermissions(email);
  return perms.includes(permission);
}

// ---------- Покупка с комиссией ----------
function smProcessPurchase(userEmail, listingId, price) {
  const user = smFindUserByEmail(userEmail);
  const listing = smGetListing(listingId);
  if (!user || !listing) return { ok: false, error: 'Пользователь или товар не найден' };
  if (user.banned) return { ok: false, error: 'Аккаунт заблокирован' };
  if ((user.balance || 0) < price) return { ok: false, error: 'Недостаточно средств' };

  const settings = smGetPlatformSettings();
  const commissionRate = settings.commissionRate || 10;
  const commission = Math.round(price * (commissionRate / 100));
  const authorEarn = price - commission;

  const newBalance = user.balance - price;
  smUpdateUser(userEmail, { balance: newBalance });

  if (listing.authorEmail) {
    const author = smFindUserByEmail(listing.authorEmail);
    if (author) {
      const newEarnings = (author.authorEarnings || 0) + authorEarn;
      const newTotalSales = (author.totalSales || 0) + 1;
      smUpdateUser(listing.authorEmail, {
        authorEarnings: newEarnings,
        totalSales: newTotalSales
      });
    }
  }

  const purchases = user.purchases || [];
  purchases.push({
    purchaseId: 'pur-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    id: listing.id,
    title: listing.title,
    price: listing.price,
    paidPrice: price,
    image: listing.image,
    boughtAt: Date.now(),
    authorEmail: listing.authorEmail || null,
    authorName: listing.authorName || null,
    commission: commission,
    authorEarn: authorEarn,
    refunded: false,
    refundedAt: null
  });
  smUpdateUser(userEmail, { purchases: purchases });
  // Обновляем количество продаж у товара
  const salesCount = listing.salesCount || 0;
  smUpdateListing(listingId, { salesCount: salesCount + 1 });

  // Антифрод: 2 покупки дороже 20 000 ₽ с разницей меньше 2 минут — похоже
  // на дубль/эксплойт. Замораживаем аккаунт немедленно и кидаем на проверку.
  const FRAUD_MIN_PRICE = 20000;
  const FRAUD_WINDOW_MS = 2 * 60 * 1000;
  const bigPurchases = purchases
    .filter(function (p) { return (p.paidPrice || 0) > FRAUD_MIN_PRICE; })
    .sort(function (a, b) { return b.boughtAt - a.boughtAt; });
  if (bigPurchases.length >= 2) {
    const gapMs = bigPurchases[0].boughtAt - bigPurchases[1].boughtAt;
    if (gapMs < FRAUD_WINDOW_MS) {
      smFlagUserForReview(
        userEmail,
        'Автоблокировка: 2 покупки свыше ' + FRAUD_MIN_PRICE.toLocaleString('ru-RU') + ' ₽ с разницей ' + Math.round(gapMs / 1000) + ' сек — подозрение на дубль/эксплойт.',
        'auto'
      );
    }
  }

  return { ok: true, commission, authorEarn };
}

// ---------- Возврат покупки ----------
const SM_REFUND_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 часа

function smCanRefundPurchase(purchase) {
  if (!purchase || purchase.refunded) return false;
  return (Date.now() - purchase.boughtAt) <= SM_REFUND_WINDOW_MS;
}

function smRefundPurchase(userEmail, purchaseId) {
  const user = smFindUserByEmail(userEmail);
  if (!user) return { ok: false, error: 'Пользователь не найден.' };
  const purchases = user.purchases || [];
  const idx = purchases.findIndex(function (p) { return p.purchaseId === purchaseId; });
  if (idx === -1) return { ok: false, error: 'Покупка не найдена.' };
  const purchase = purchases[idx];
  if (purchase.refunded) return { ok: false, error: 'Уже возвращено.' };
  if (!smCanRefundPurchase(purchase)) return { ok: false, error: 'Время на возврат (2 часа) истекло.' };

  const updatedPurchases = purchases.map(function (p, i) {
    return i === idx ? Object.assign({}, p, { refunded: true, refundedAt: Date.now() }) : p;
  });
  const newBalance = (user.balance || 0) + (purchase.paidPrice || 0);
  smUpdateUser(userEmail, { balance: newBalance, purchases: updatedPurchases });

  if (purchase.authorEmail) {
    const author = smFindUserByEmail(purchase.authorEmail);
    if (author) {
      smUpdateUser(purchase.authorEmail, {
        authorEarnings: Math.max(0, (author.authorEarnings || 0) - (purchase.authorEarn || 0)),
        totalSales: Math.max(0, (author.totalSales || 0) - 1)
      });
    }
  }
  const listing = smGetListing(purchase.id);
  if (listing) {
    smUpdateListing(purchase.id, { salesCount: Math.max(0, (listing.salesCount || 0) - 1) });
  }

  return { ok: true, refunded: purchase.paidPrice };
}

// ---------- Антифрод / подозрительные аккаунты ----------
function smFlagUserForReview(email, reason, source) {
  smUpdateUser(email, {
    banned: true,
    banReason: reason,
    banExpires: null,
    bannedAt: Date.now(),
    flaggedForReview: true,
    flagReason: reason,
    flagSource: source || 'auto',
    flaggedAt: Date.now()
  });
}
function smGetFlaggedUsers() {
  return smGetUsers().filter(function (u) { return u.flaggedForReview; });
}
function smResolveUserFlag(email, keepBanned) {
  if (keepBanned) {
    // Оставляем бан как есть, просто убираем из очереди "на проверке"
    smUpdateUser(email, { flaggedForReview: false });
  } else {
    smUpdateUser(email, {
      flaggedForReview: false,
      banned: false,
      banReason: null,
      banExpires: null,
      bannedAt: null
    });
  }
}

// ---------- Платформенные настройки ----------
function smGetPlatformSettings() {
  return JSON.parse(localStorage.getItem(SM_KEYS.platformSettings) || '{"commissionRate":10}');
}
function smSetPlatformSettings(settings) {
  smSafeSet(SM_KEYS.platformSettings, JSON.stringify(settings));
  smSyncSetDocSafe('meta/platformSettings', settings);
}

// ---------- Promocodes ----------
function smGetPromocodes() {
  return JSON.parse(localStorage.getItem(SM_KEYS.promocodes) || '[]');
}
function smSavePromocodes(list) {
  smSafeSet(SM_KEYS.promocodes, JSON.stringify(list));
}
function smCreatePromocode(code, type, value, uses, expires, createdBy) {
  const list = smGetPromocodes();
  if (list.some(p => p.code === code)) {
    return { ok: false, error: 'Промокод с таким кодом уже существует.' };
  }
  const promo = {
    id: 'pc-' + Date.now(),
    code: code,
    type: type,
    value: Number(value),
    uses: Number(uses) || 1,
    used: 0,
    expires: expires ? new Date(expires).getTime() : null,
    createdBy: createdBy || 'owner',
    createdAt: Date.now()
  };
  list.push(promo);
  smSavePromocodes(list);
  smSyncPushSafe('promocodes', promo.code, promo);
  return { ok: true, promo: promo };
}
function smApplyPromocode(code, userEmail) {
  const list = smGetPromocodes();
  const promoIndex = list.findIndex(p => p.code === code);
  if (promoIndex === -1) {
    return { ok: false, error: 'Промокод не найден.' };
  }
  const promo = list[promoIndex];
  if (promo.expires && promo.expires < Date.now()) {
    return { ok: false, error: 'Промокод истёк.' };
  }
  if (promo.used >= promo.uses) {
    return { ok: false, error: 'Промокод уже использован максимальное число раз.' };
  }
  const user = smFindUserByEmail(userEmail);
  if (!user) {
    return { ok: false, error: 'Пользователь не найден.' };
  }
  const usedPromocodes = user.usedPromocodes || [];
  if (usedPromocodes.includes(code)) {
    return { ok: false, error: 'Вы уже использовали этот промокод.' };
  }
  if (promo.type === 'balance') {
    smAddBalance(userEmail, promo.value);
    promo.used += 1;
    usedPromocodes.push(code);
    smUpdateUser(userEmail, { usedPromocodes: usedPromocodes });
    smSavePromocodes(list);
    smSyncPushSafe('promocodes', promo.code, promo);
    return { ok: true, message: 'На баланс начислено ' + promo.value + ' ₽' };
  } else if (promo.type === 'percent') {
    const currentDiscount = user.discount || 0;
    if (promo.value > currentDiscount) {
      smUpdateUser(userEmail, { discount: promo.value, usedPromocodes: usedPromocodes.concat(code) });
    } else {
      usedPromocodes.push(code);
      smUpdateUser(userEmail, { usedPromocodes: usedPromocodes });
    }
    promo.used += 1;
    smSavePromocodes(list);
    smSyncPushSafe('promocodes', promo.code, promo);
    return { ok: true, message: 'Активирована скидка ' + promo.value + '% на следующую покупку' };
  }
  return { ok: false, error: 'Неизвестный тип промокода.' };
}

// ---------- Developers ----------
function smGetDevelopers() {
  return JSON.parse(localStorage.getItem(SM_KEYS.developers) || '[]');
}
function smSaveDevelopers(list) {
  smSafeSet(SM_KEYS.developers, JSON.stringify(list));
}
function smAddDeveloper(dev) {
  const list = smGetDevelopers();
  dev.id = 'dev-' + Date.now();
  list.push(dev);
  smSaveDevelopers(list);
  smSyncPushSafe('developers', dev.id, dev);
  return dev;
}
function smUpdateDeveloper(id, updates) {
  let updatedDev = null;
  const list = smGetDevelopers().map(function(d) {
    if (d.id === id) { updatedDev = Object.assign({}, d, updates); return updatedDev; }
    return d;
  });
  smSaveDevelopers(list);
  if (updatedDev) smSyncPushSafe('developers', id, updatedDev);
}
function smDeleteDeveloper(id) {
  const list = smGetDevelopers().filter(function(d) { return d.id !== id; });
  smSaveDevelopers(list);
  smSyncDeleteSafe('developers', id);
}
function smGetDeveloper(id) {
  return smGetDevelopers().find(function(d) { return d.id === id; });
}

// ---------- Заявки ----------
function smGetApplications() {
  return JSON.parse(localStorage.getItem(SM_KEYS.applications) || '[]');
}
function smSaveApplications(list) {
  smSafeSet(SM_KEYS.applications, JSON.stringify(list));
}
function smAddApplication(data) {
  const list = smGetApplications();
  const app = {
    id: 'app-' + Date.now(),
    userId: data.userId,
    userEmail: data.userEmail,
    userName: data.userName,
    github: data.github || '',
    email: data.email || '',
    phone: data.phone || '',
    message: data.message || '',
    status: 'pending',
    createdAt: Date.now()
  };
  list.push(app);
  smSaveApplications(list);
  smSyncPushSafe('applications', app.id, app);
  return app;
}
function smUpdateApplication(id, status) {
  let updatedApp = null;
  const list = smGetApplications().map(a => {
    if (a.id === id) { updatedApp = { ...a, status }; return updatedApp; }
    return a;
  });
  smSaveApplications(list);
  if (updatedApp) smSyncPushSafe('applications', id, updatedApp);
}
function smDeleteApplication(id) {
  const list = smGetApplications().filter(a => a.id !== id);
  smSaveApplications(list);
  smSyncDeleteSafe('applications', id);
}
function smGetAppSettings() {
  return JSON.parse(localStorage.getItem(SM_KEYS.appSettings) || '{"open":true}');
}
function smSetAppSettings(open) {
  const data = { open: !!open };
  smSafeSet(SM_KEYS.appSettings, JSON.stringify(data));
  smSyncSetDocSafe('meta/appSettings', data);
}

// ---------- Политики (пользовательское соглашение, соглашение соавтора, политика покупки) ----------
function smGetPolicies() {
  return JSON.parse(localStorage.getItem(SM_KEYS.policies) || '{"userTerms":"","authorTerms":"","purchase":""}');
}
function smSetPolicies(policies) {
  smSafeSet(SM_KEYS.policies, JSON.stringify(policies));
  smSyncSetDocSafe('meta/policies', policies);
}

// ---------- Модерация ----------
function smGetModerationList() {
  return JSON.parse(localStorage.getItem(SM_KEYS.moderation) || '[]');
}
function smSaveModerationList(list) {
  smSafeSet(SM_KEYS.moderation, JSON.stringify(list));
}
function smAddToModeration(item) {
  const list = smGetModerationList();
  // Проверяем, нет ли уже такой записи
  if (list.some(m => m.listingId === item.id)) {
    return;
  }
  const newEntry = {
    listingId: item.id,
    title: item.title,
    authorEmail: item.authorEmail || '',
    authorName: item.authorName || '',
    submittedAt: Date.now(),
    status: 'pending'
  };
  list.push(newEntry);
  smSaveModerationList(list);
  smSyncPushSafe('moderation', newEntry.listingId, newEntry);
}
function smUpdateModeration(listingId, status) {
  let updatedEntry = null;
  const list = smGetModerationList().map(m => {
    if (m.listingId === listingId) { updatedEntry = { ...m, status }; return updatedEntry; }
    return m;
  });
  smSaveModerationList(list);
  if (updatedEntry) smSyncPushSafe('moderation', listingId, updatedEntry);
}
function smDeleteFromModeration(listingId) {
  const list = smGetModerationList().filter(m => m.listingId !== listingId);
  smSaveModerationList(list);
  smSyncDeleteSafe('moderation', listingId);
}
function smGetModerationItem(listingId) {
  return smGetModerationList().find(m => m.listingId === listingId);
}

// ---------- Чат поддержки ----------
function smGetSupportMessages() {
  return JSON.parse(localStorage.getItem(SM_KEYS.supportMessages) || '[]');
}
function smSaveSupportMessages(list) {
  smSafeSet(SM_KEYS.supportMessages, JSON.stringify(list));
}
function smSendSupportMessage(userEmail, userName, sender, text, imageUrl) {
  const list = smGetSupportMessages();
  const msg = {
    id: 'sup-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    userEmail: String(userEmail).toLowerCase(),
    userName: userName || '',
    sender: sender, // 'user' | 'admin'
    text: text ? String(text).slice(0, 2000) : '',
    imageUrl: imageUrl || null,
    createdAt: Date.now(),
    readByAdmin: sender === 'admin',
    readByUser: sender === 'user'
  };
  list.push(msg);
  smSaveSupportMessages(list);
  smSyncPushSafe('supportMessages', msg.id, msg);
  return msg;
}
function smGetSupportThread(userEmail) {
  const email = String(userEmail).toLowerCase();
  return smGetSupportMessages()
    .filter(function (m) { return m.userEmail === email; })
    .sort(function (a, b) { return a.createdAt - b.createdAt; });
}
function smGetSupportThreads() {
  const all = smGetSupportMessages();
  const map = {};
  all.forEach(function (m) {
    if (!map[m.userEmail]) map[m.userEmail] = { userEmail: m.userEmail, userName: m.userName, messages: [] };
    if (m.userName) map[m.userEmail].userName = m.userName;
    map[m.userEmail].messages.push(m);
  });
  return Object.keys(map).map(function (email) {
    const t = map[email];
    t.messages.sort(function (a, b) { return a.createdAt - b.createdAt; });
    const last = t.messages[t.messages.length - 1];
    const unreadCount = t.messages.filter(function (m) { return m.sender === 'user' && !m.readByAdmin; }).length;
    return { userEmail: email, userName: t.userName, messages: t.messages, lastMessage: last, unreadCount: unreadCount };
  }).sort(function (a, b) { return (b.lastMessage ? b.lastMessage.createdAt : 0) - (a.lastMessage ? a.lastMessage.createdAt : 0); });
}
function smGetSupportUnreadForAdmin() {
  return smGetSupportMessages().filter(function (m) { return m.sender === 'user' && !m.readByAdmin; }).length;
}
function smGetSupportUnreadForUser(userEmail) {
  const email = String(userEmail).toLowerCase();
  return smGetSupportMessages().filter(function (m) { return m.userEmail === email && m.sender === 'admin' && !m.readByUser; }).length;
}
function smMarkSupportReadByAdmin(userEmail) {
  const email = String(userEmail).toLowerCase();
  const changed = [];
  const list = smGetSupportMessages().map(function (m) {
    if (m.userEmail === email && m.sender === 'user' && !m.readByAdmin) {
      const upd = Object.assign({}, m, { readByAdmin: true });
      changed.push(upd);
      return upd;
    }
    return m;
  });
  smSaveSupportMessages(list);
  changed.forEach(function (m) { smSyncPushSafe('supportMessages', m.id, m); });
}
function smMarkSupportReadByUser(userEmail) {
  const email = String(userEmail).toLowerCase();
  const changed = [];
  const list = smGetSupportMessages().map(function (m) {
    if (m.userEmail === email && m.sender === 'admin' && !m.readByUser) {
      const upd = Object.assign({}, m, { readByUser: true });
      changed.push(upd);
      return upd;
    }
    return m;
  });
  smSaveSupportMessages(list);
  changed.forEach(function (m) { smSyncPushSafe('supportMessages', m.id, m); });
}

// ---------- Жалобы на товары ----------
function smGetReports() {
  return JSON.parse(localStorage.getItem(SM_KEYS.reports) || '[]');
}
function smSaveReports(list) {
  smSafeSet(SM_KEYS.reports, JSON.stringify(list));
}
function smAddReport(data) {
  const list = smGetReports();
  const report = {
    id: 'rep-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    listingId: data.listingId,
    listingTitle: data.listingTitle || '',
    reporterEmail: data.reporterEmail || null,
    reporterName: data.reporterName || 'Гость',
    reason: data.reason,
    details: (data.details || '').slice(0, 1000),
    status: 'pending',
    createdAt: Date.now()
  };
  list.push(report);
  smSaveReports(list);
  smSyncPushSafe('reports', report.id, report);
  return report;
}
function smUpdateReportStatus(id, status) {
  let updated = null;
  const list = smGetReports().map(function (r) {
    if (r.id === id) { updated = Object.assign({}, r, { status: status }); return updated; }
    return r;
  });
  smSaveReports(list);
  if (updated) smSyncPushSafe('reports', id, updated);
}
function smGetPendingReports() {
  return smGetReports().filter(function (r) { return r.status === 'pending'; });
}

// ---------- Session ----------
// Сессия (кто сейчас залогинен на ЭТОМ устройстве) сознательно хранится
// только локально — это не должно "расползаться" на другие браузеры.
function smGetSession() {
  try {
    return JSON.parse(localStorage.getItem(SM_KEYS.session) || 'null');
  } catch (e) {
    return null;
  }
}
function smSetSession(session) {
  smSafeSet(SM_KEYS.session, JSON.stringify(session));
}
function smClearSession() {
  localStorage.removeItem(SM_KEYS.session);
}

// ---------- Анти-брутфорс ----------
function smGetLocks() {
  return JSON.parse(localStorage.getItem(SM_KEYS.locks) || '{}');
}
function smRegisterFailedAttempt(login) {
  const locks = smGetLocks();
  const key = String(login).toLowerCase();
  const rec = locks[key] || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.until = Date.now() + 30000;
    rec.count = 0;
  }
  locks[key] = rec;
  smSafeSet(SM_KEYS.locks, JSON.stringify(locks));
}
function smClearFailedAttempts(login) {
  const locks = smGetLocks();
  delete locks[String(login).toLowerCase()];
  smSafeSet(SM_KEYS.locks, JSON.stringify(locks));
}
function smIsLocked(login) {
  const locks = smGetLocks();
  const rec = locks[String(login).toLowerCase()];
  if (!rec || !rec.until) return 0;
  const left = rec.until - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

smInit();
