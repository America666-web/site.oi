/* ==========================================================================
   SiteMarket — app.js (полный)
   ========================================================================== */

function smSupportBadgeHtml(email) {
  if (typeof smGetSupportUnreadForUser !== 'function') return '';
  const count = smGetSupportUnreadForUser(email);
  return count > 0 ? ' <span class="badge-count">' + count + '</span>' : '';
}

function smRenderNav(activePage) {
  const nav = document.getElementById('sm-nav');
  if (!nav) return;
  const s = smGetSession();

  if (!window.sm_navSyncBound) {
    window.sm_navSyncBound = true;
    window.addEventListener('sm:sync', function (e) {
      const col = e && e.detail && e.detail.collection;
      if (col === 'supportMessages') {
        smRenderNav(activePage);
      }
      if (col === 'users') {
        const current = smGetSession();
        if (current) {
          const fresh = smFindUserByEmail(current.email);
          if (fresh && fresh.banned) {
            smClearSession();
            alert('Ваш аккаунт заблокирован.' + (fresh.banReason ? ' Причина: ' + fresh.banReason : '') + ' Если это ошибка — напишите в поддержку.');
            window.location.href = 'login.html';
          }
        }
      }
    });
  }

  let html = '<a href="index.html" class="' + (activePage === 'home' ? 'active' : '') + '">Каталог</a>';
  html += '<a href="developers.html" class="' + (activePage === 'developers' ? 'active' : '') + '">Разработчики</a>';

  if (!s) {
    html += '<a href="login.html">Войти</a>';
    html += '<a href="register.html" class="btn btn-primary">Регистрация</a>';
  } else if (s.role === 'admin' || s.role === 'owner') {
    html += '<a href="admin.html" class="' + (activePage === 'admin' ? 'active' : '') + '">Админ-панель</a>';
    html += '<a href="#" id="sm-logout" class="btn btn-ghost">Выйти</a>';
  } else if (s.role === 'author') {
    html += '<a href="author.html" class="' + (activePage === 'author' ? 'active' : '') + '">Моя панель</a>';
    html += '<a href="profile.html" class="' + (activePage === 'profile' ? 'active' : '') + '">Профиль' + smSupportBadgeHtml(s.email) + '</a>';
    html += '<a href="#" id="sm-logout" class="btn btn-ghost">Выйти</a>';
  } else {
    html += '<a href="profile.html" class="' + (activePage === 'profile' ? 'active' : '') + '">Профиль (' + smEsc(s.name) + ')' + smSupportBadgeHtml(s.email) + '</a>';
    html += '<a href="#" id="sm-logout" class="btn btn-ghost">Выйти</a>';
  }

  nav.innerHTML = html;

  const logoutBtn = document.getElementById('sm-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      smLogout();
    });
  }
}

function smEsc(str) {
  const div = document.createElement('div');
  div.textContent = String(str == null ? '' : str);
  return div.innerHTML;
}

function smPreviewBlock(item) {
  const letter = smEsc(item.title.trim().charAt(0).toUpperCase());
  if (item.image) {
    return '<img src="' + smEsc(item.image) + '" alt="' + smEsc(item.title) + '" loading="lazy">';
  }
  return '<div class="win-fallback"><span>' + letter + '</span></div>';
}

function smCardHtml(item) {
  const hasPreview = !!(item.zipData || item.zipUrl);
  const previewBtn = hasPreview
    ? '<button class="btn sm-preview" data-id="' + item.id + '">Просмотр</button>'
    : '<button class="btn" disabled style="opacity:0.4;">Нет файла</button>';

  let badgeHtml = '';
  if (item.badge) {
    const colors = {
      'Хит': 'var(--orange)',
      'Популярное': '#ffb347',
      'VIP': '#d4af37',
      'Новинка': '#6bcb7a'
    };
    const bg = colors[item.badge] || 'var(--orange)';
    badgeHtml = '<span style="display:inline-block;background:' + bg + ';color:#0c0c0d;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;margin-left:8px;text-transform:uppercase;">' + smEsc(item.badge) + '</span>';
  }
  
  return (
    '<div class="site-card" data-id="' + item.id + '" data-cat="' + smEsc(item.category) + '">' +
      '<div class="win-bar">' +
        '<span class="win-dot active"></span><span class="win-dot"></span><span class="win-dot"></span>' +
      '</div>' +
      '<div class="win-preview">' + smPreviewBlock(item) + '</div>' +
      '<div class="site-card-body">' +
        '<h3>' + smEsc(item.title) + badgeHtml + '</h3>' +
        '<p>' + smEsc(item.desc) + '</p>' +
        '<div class="site-meta">' +
          '<span class="tag">' + smEsc(item.category) + '</span>' +
          '<span class="price">' + Number(item.price).toLocaleString('ru-RU') + ' ₽</span>' +
        '</div>' +
        '<div class="card-actions">' +
          previewBtn +
          '<button class="btn btn-primary sm-buy" data-id="' + item.id + '">Купить</button>' +
          '<button class="btn sm-report" data-id="' + item.id + '" data-title="' + smEsc(item.title) + '" title="Пожаловаться" style="padding:8px 10px;">🚩</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function smRenderCatalog(filterCat) {
  const grid = document.getElementById('sm-grid');
  if (!grid) return;
  const listings = smGetPublicListings();
  const filtered = !filterCat || filterCat === 'Все'
    ? listings
    : listings.filter(function (i) { return i.category === filterCat; });

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty">Пока нет сайтов в этой категории. Загляните позже — каталог пополняется.</div>';
    return;
  }

  grid.innerHTML = filtered.map(smCardHtml).join('');

  grid.querySelectorAll('.sm-buy').forEach(function (btn) {
    btn.addEventListener('click', function () { smShowPurchaseConfirm(btn.getAttribute('data-id')); });
  });
  grid.querySelectorAll('.sm-preview').forEach(function (btn) {
    btn.addEventListener('click', function () { smOpenPreview(btn.getAttribute('data-id')); });
  });
  grid.querySelectorAll('.sm-report').forEach(function (btn) {
    btn.addEventListener('click', function () { smOpenReportModal(btn.getAttribute('data-id'), btn.getAttribute('data-title')); });
  });
}

const SM_REPORT_REASONS = [
  'Не работает / битые ссылки',
  'Обман или мошенничество',
  'Плагиат — чужой контент',
  'Оскорбительное содержимое',
  'Другое'
];

function smOpenReportModal(listingId, title) {
  const backdrop = document.getElementById('sm-report-backdrop');
  if (!backdrop) return;
  document.getElementById('sm-report-title').textContent = 'Пожаловаться: ' + title;
  document.getElementById('sm-report-listing-id').value = listingId;
  const select = document.getElementById('sm-report-reason');
  select.innerHTML = SM_REPORT_REASONS.map(function (r) { return '<option value="' + smEsc(r) + '">' + smEsc(r) + '</option>'; }).join('');
  document.getElementById('sm-report-details').value = '';
  document.getElementById('sm-report-msg').textContent = '';
  backdrop.classList.add('show');
}
function smCloseReportModal() {
  const backdrop = document.getElementById('sm-report-backdrop');
  if (backdrop) backdrop.classList.remove('show');
}
function smSubmitReport(e) {
  e.preventDefault();
  const listingId = document.getElementById('sm-report-listing-id').value;
  const listing = smGetListing(listingId);
  const reason = document.getElementById('sm-report-reason').value;
  const details = document.getElementById('sm-report-details').value.trim();
  const session = smGetSession();
  smAddReport({
    listingId: listingId,
    listingTitle: listing ? listing.title : '',
    reporterEmail: session ? session.email : null,
    reporterName: session ? session.name : 'Гость',
    reason: reason,
    details: details
  });
  document.getElementById('sm-report-msg').textContent = 'Спасибо! Жалоба отправлена на рассмотрение.';
  document.getElementById('sm-report-msg').style.color = 'var(--success)';
  setTimeout(smCloseReportModal, 1400);
}

function smRenderFilters() {
  const wrap = document.getElementById('sm-filters');
  if (!wrap) return;
  const listings = smGetPublicListings();
  const cats = ['Все'].concat(Array.from(new Set(listings.map(function (i) { return i.category; }))));

  wrap.innerHTML = cats.map(function (c, idx) {
    return '<button class="chip' + (idx === 0 ? ' active' : '') + '" data-cat="' + smEsc(c) + '">' + smEsc(c) + '</button>';
  }).join('');

  wrap.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      wrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      smRenderCatalog(chip.getAttribute('data-cat'));
    });
  });
}

let sm_pendingPurchaseId = null;

function smShowPurchaseConfirm(id) {
  const s = smGetSession();
  if (!s) {
    window.location.href = 'login.html';
    return;
  }
  if (s.role === 'admin' || s.role === 'owner') {
    alert('Администратор не может покупать сайты.');
    return;
  }

  const listing = smGetListing(id);
  if (!listing) return;

  const user = smFindUserByEmail(s.email);
  if (!user || user.banned) {
    alert('Ваш аккаунт заблокирован.');
    return;
  }

  const purchases = user.purchases || [];
  if (purchases.some(function (p) { return p.id === id; })) {
    alert('Этот сайт уже есть в вашем профиле.');
    return;
  }

  let price = listing.price;
  const discount = user.discount || 0;
  if (discount > 0) {
    price = Math.round(price * (1 - discount / 100));
  }

  if ((user.balance || 0) < price) {
    alert(
      'Недостаточно средств.\nБаланс: ' + Number(user.balance || 0).toLocaleString('ru-RU') + ' ₽\n' +
      'Цена со скидкой: ' + Number(price).toLocaleString('ru-RU') + ' ₽' +
      (discount > 0 ? ' (скидка ' + discount + '%)' : '')
    );
    return;
  }

  sm_pendingPurchaseId = id;
  document.getElementById('sm-purchase-title').textContent = listing.title;
  document.getElementById('sm-purchase-price').textContent = Number(price).toLocaleString('ru-RU') + ' ₽';
  document.getElementById('sm-purchase-category').textContent = 'Категория: ' + listing.category;
  document.getElementById('sm-purchase-desc').textContent = 
    'Баланс: ' + Number(user.balance || 0).toLocaleString('ru-RU') + ' ₽ · после покупки останется ' + 
    Number((user.balance || 0) - price).toLocaleString('ru-RU') + ' ₽' +
    (discount > 0 ? ' · скидка ' + discount + '%' : '');

  const policyRow = document.getElementById('sm-purchase-policy-row');
  const policyCheckbox = document.getElementById('f-purchase-agree-policy');
  if (!user.acceptedPurchasePolicy) {
    policyRow.style.display = 'flex';
    policyCheckbox.checked = false;
  } else {
    policyRow.style.display = 'none';
  }

  document.getElementById('sm-purchase-backdrop').classList.add('show');
}

function smClosePurchaseConfirm() {
  document.getElementById('sm-purchase-backdrop').classList.remove('show');
  sm_pendingPurchaseId = null;
}

function smConfirmPurchase() {
  const id = sm_pendingPurchaseId;
  if (!id) return;
  
  const s = smGetSession();
  if (!s) return;
  
  const listing = smGetListing(id);
  if (!listing) return;

  const user = smFindUserByEmail(s.email);
  if (!user || user.banned) return;

  const purchases = user.purchases || [];
  if (purchases.some(function (p) { return p.id === id; })) {
    alert('Этот сайт уже есть в вашем профиле.');
    smClosePurchaseConfirm();
    return;
  }

  let price = listing.price;
  const discount = user.discount || 0;
  if (discount > 0) {
    price = Math.round(price * (1 - discount / 100));
  }

  if ((user.balance || 0) < price) {
    alert('Недостаточно средств.');
    smClosePurchaseConfirm();
    return;
  }

  if (!user.acceptedPurchasePolicy && !document.getElementById('f-purchase-agree-policy').checked) {
    alert('Нужно принять политику покупки.');
    return;
  }

  const result = smProcessPurchase(s.email, id, price);
  if (!result.ok) {
    alert(result.error);
    smClosePurchaseConfirm();
    return;
  }

  if (!user.acceptedPurchasePolicy) {
    smUpdateUser(s.email, { acceptedPurchasePolicy: true, acceptedPurchasePolicyAt: Date.now() });
  }

  smUpdateUser(s.email, { discount: 0 });

  smClosePurchaseConfirm();
  smClosePreview();
  alert('✅ Готово! «' + listing.title + '» добавлен в профиль.\nСписано ' + Number(price).toLocaleString('ru-RU') + ' ₽' +
        (discount > 0 ? ' (со скидкой ' + discount + '%)' : '') +
        '\nКомиссия платформы: ' + result.commission + ' ₽\nАвтор получит: ' + result.authorEarn + ' ₽');
}

async function smOpenPreview(id) {
  const item = smGetListing(id);
  if (!item) return;
  
  const backdrop = document.getElementById('sm-preview-backdrop');
  const body = document.getElementById('sm-preview-body');

  body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Загрузка сайта...</div>';
  backdrop.classList.add('show');

  try {
    const source = await smGetPreviewSource(item);
    
    let mediaHtml;
    let fullscreenBtn = '';
    
    if (source && source.mode === 'src') {
      mediaHtml =
        '<div class="preview-frame-wrap" style="position:relative;">' +
          '<iframe class="preview-frame" src="' + smEsc(source.value) + '" sandbox="allow-scripts allow-forms allow-same-origin" loading="lazy"></iframe>' +
          smWatermarkHtml() +
        '</div>';
      
      const fullscreenUrl = await smGetFullscreenUrl(item);
      if (fullscreenUrl) {
        fullscreenBtn = '<button class="btn btn-ghost" onclick="window.open(\'' + smEsc(fullscreenUrl) + '\', \'_blank\')" style="font-size:12.5px;padding:6px 14px;">⛶ Открыть в новой вкладке</button>';
      }
    } else {
      mediaHtml = '<div class="preview-media">' + smPreviewBlock(item) + 
        '<p style="text-align:center;color:var(--text-faint);padding:12px;">Нет файла для предпросмотра</p></div>';
    }

    body.innerHTML =
      mediaHtml +
      '<div class="preview-info">' +
        '<span class="tag">' + smEsc(item.category) + '</span>' +
        '<h3>' + smEsc(item.title) + '</h3>' +
        '<p>' + smEsc(item.desc) + '</p>' +
        (item.details ? '<p class="preview-details">' + smEsc(item.details) + '</p>' : '') +
        '<div class="preview-foot">' +
          '<span class="price">' + Number(item.price).toLocaleString('ru-RU') + ' ₽</span>' +
          '<div style="display:flex;gap:10px;align-items:center;">' +
            fullscreenBtn +
            '<button class="btn btn-primary sm-buy-modal" data-id="' + item.id + '">Купить</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    body.querySelector('.sm-buy-modal').addEventListener('click', function () {
      smShowPurchaseConfirm(item.id);
    });

  } catch (error) {
    body.innerHTML = 
      '<div style="text-align:center;padding:40px;">' +
        '<p style="color:var(--danger);">Ошибка загрузки сайта</p>' +
        '<p style="color:var(--text-faint);font-size:13px;">' + smEsc(error.message) + '</p>' +
        '<button class="btn" onclick="smClosePreview()">Закрыть</button>' +
      '</div>';
  }
}

function smClosePreview() {
  document.getElementById('sm-preview-backdrop').classList.remove('show');
  const body = document.getElementById('sm-preview-body');
  if (body) body.innerHTML = '';
}

function smShowApplicationForm() {
  const s = smGetSession();
  if (!s) {
    alert('Войдите в аккаунт, чтобы подать заявку.');
    return;
  }
  const settings = smGetAppSettings();
  if (!settings.open) {
    alert('Приём заявок временно закрыт.');
    return;
  }
  const user = smFindUserByEmail(s.email);
  if (!user) return;
  const apps = smGetApplications();
  const existing = apps.find(a => a.userEmail === s.email && a.status === 'pending');
  if (existing) {
    alert('Вы уже подали заявку, ожидайте рассмотрения.');
    return;
  }
  if (user.role === 'author') {
    alert('Вы уже являетесь соавтором.');
    return;
  }
  if (user.role === 'admin' || user.role === 'owner') {
    alert('Администраторы не могут подавать заявки.');
    return;
  }
  document.getElementById('sm-application-backdrop').classList.add('show');
}
function smCloseApplicationForm() {
  document.getElementById('sm-application-backdrop').classList.remove('show');
}
function smSubmitApplication(e) {
  e.preventDefault();
  const s = smGetSession();
  if (!s) { alert('Войдите'); return; }
  const github = document.getElementById('f-app-github').value.trim();
  const email = document.getElementById('f-app-email').value.trim();
  const phone = document.getElementById('f-app-phone').value.trim();
  const message = document.getElementById('f-app-message').value.trim();
  if (!github || !email || !phone || !message) {
    alert('Заполните все поля');
    return;
  }
  if (!document.getElementById('f-app-agree-terms').checked) {
    alert('Нужно принять соглашение соавтора.');
    return;
  }
  const user = smFindUserByEmail(s.email);
  if (!user) return;
  const result = smAddApplication({
    userId: user.uid,
    userEmail: s.email,
    userName: s.name,
    github,
    email,
    phone,
    message
  });
  if (result) {
    smUpdateUser(s.email, { acceptedAuthorTerms: true, acceptedAuthorTermsAt: Date.now() });
    alert('Заявка отправлена! Ожидайте решения администратора.');
    smCloseApplicationForm();
    document.getElementById('sm-app-form').reset();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const purchaseBackdrop = document.getElementById('sm-purchase-backdrop');
  if (purchaseBackdrop) {
    document.getElementById('sm-purchase-close').addEventListener('click', smClosePurchaseConfirm);
    document.getElementById('sm-purchase-cancel').addEventListener('click', smClosePurchaseConfirm);
    purchaseBackdrop.addEventListener('click', function (e) {
      if (e.target === purchaseBackdrop) smClosePurchaseConfirm();
    });
    document.getElementById('sm-purchase-confirm').addEventListener('click', smConfirmPurchase);
  }

  const grid = document.getElementById('sm-grid');
  if (grid) {
    smRenderFilters();
    smRenderCatalog('Все');
  }

  const closeBtn = document.getElementById('sm-preview-close');
  if (closeBtn) closeBtn.addEventListener('click', smClosePreview);
  const backdrop = document.getElementById('sm-preview-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) smClosePreview();
    });
  }

  const joinBtn = document.getElementById('sm-join-btn');
  if (joinBtn) {
    joinBtn.addEventListener('click', smShowApplicationForm);
  }

  window.addEventListener('sm:sync', function (e) {
    const col = e && e.detail && e.detail.collection;
    if (col === 'listings' && document.getElementById('sm-grid')) {
      smRenderFilters();
      const activeChip = document.querySelector('#sm-filters .chip.active');
      smRenderCatalog(activeChip ? activeChip.getAttribute('data-cat') : 'Все');
    }
  });
  const appBackdrop = document.getElementById('sm-application-backdrop');
  if (appBackdrop) {
    document.getElementById('sm-app-close').addEventListener('click', smCloseApplicationForm);
    document.getElementById('sm-app-cancel').addEventListener('click', smCloseApplicationForm);
    appBackdrop.addEventListener('click', function(e) {
      if (e.target === this) smCloseApplicationForm();
    });
    document.getElementById('sm-app-form').addEventListener('submit', smSubmitApplication);
  }

  const reportBackdrop = document.getElementById('sm-report-backdrop');
  if (reportBackdrop) {
    document.getElementById('sm-report-close').addEventListener('click', smCloseReportModal);
    reportBackdrop.addEventListener('click', function (e) {
      if (e.target === this) smCloseReportModal();
    });
    document.getElementById('sm-report-form').addEventListener('submit', smSubmitReport);
  }
});