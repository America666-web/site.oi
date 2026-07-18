/* ==========================================================================
   SiteMarket — admin.js (полный, с модерацией)
   ========================================================================== */

let sm_pendingImageUrl = null;
let sm_pendingZip = null; // { zipUrl, zipData } — заполняется smBindZipInput из upload.js
let sm_editingId = null;
let sm_currentUserFilter = 'active';

if (typeof smBindImageInput === 'undefined') {
  window.smBindImageInput = function(inputEl, statusEl, onDone) {
    inputEl.addEventListener('change', function () {
      const file = inputEl.files[0];
      if (!file) return;
      statusEl.textContent = 'Загрузка…';
      statusEl.classList.remove('error');
      const reader = new FileReader();
      reader.onload = function(e) {
        const url = e.target.result;
        statusEl.textContent = 'Загружено ✓';
        onDone(url);
      };
      reader.onerror = function() {
        statusEl.textContent = 'Ошибка чтения файла';
        statusEl.classList.add('error');
      };
      reader.readAsDataURL(file);
    });
  };
}

function smAdminStats() {
  const listings = smGetListings();
  const users = smGetUsers();
  const sales = users.reduce(function (sum, u) { return sum + (u.purchases ? u.purchases.length : 0); }, 0);
  document.getElementById('stat-listings').textContent = listings.length;
  document.getElementById('stat-users').textContent = users.length;
  document.getElementById('stat-sales').textContent = sales;
}

function smAdminRenderTable() {
  const tbody = document.getElementById('sm-admin-tbody');
  const listings = smGetListings();
  if (!listings.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:32px;">Каталог пуст.</td></tr>';
    return;
  }
  const canDelete = smCanPerform('delete_listings');
  const canEdit = smCanPerform('edit_listings');
  tbody.innerHTML = listings.map(function (item) {
    const thumb = item.image
      ? '<img src="' + item.image + '" style="width:40px;height:40px;object-fit:cover;border-radius:8px;" loading="lazy" decoding="async">'
      : '<div style="width:40px;height:40px;border-radius:8px;background:var(--bg-alt);display:flex;align-items:center;justify-content:center;color:var(--orange-2);font-family:var(--ff-display);font-weight:700;">' + smEsc(item.title.charAt(0).toUpperCase()) + '</div>';
    const zipStatus = (item.zipData || item.zipUrl) ? 'есть' : 'нет';
    const badgeDisplay = item.badge ? '<span class="badge-tag">' + smEsc(item.badge) + '</span>' : '';
    const modStatus = item.moderationStatus === 'approved' ? '✅' : (item.moderationStatus === 'pending' ? '⏳' : '❌');
    const actions = canEdit ? '<button class="btn sm-edit" data-id="' + item.id + '">✎</button>' : '';
    const deleteBtn = canDelete ? '<button class="btn btn-danger sm-del" data-id="' + item.id + '">×</button>' : '';
    return (
      '<tr>' +
        '<td>' + thumb + '</td>' +
        '<td>' + smEsc(item.title) + '</td>' +
        '<td>' + smEsc(item.category) + '</td>' +
        '<td>' + Number(item.price).toLocaleString('ru-RU') + ' ₽</td>' +
        '<td>' + badgeDisplay + '</td>' +
        '<td>' + zipStatus + ' ' + modStatus + '</td>' +
        '<td class="row-actions">' + actions + deleteBtn + '</td>' +
      '</tr>'
    );
  }).join('');
  if (canDelete) {
    tbody.querySelectorAll('.sm-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (confirm('Удалить этот сайт из каталога?')) {
          smDeleteListing(btn.getAttribute('data-id'));
          smAdminRenderTable();
          smAdminStats();
        }
      });
    });
  }
  if (canEdit) {
    tbody.querySelectorAll('.sm-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        smOpenEditModal(btn.getAttribute('data-id'));
      });
    });
  }
}

function smOpenModal() {
  sm_editingId = null;
  document.getElementById('sm-modal-title').textContent = 'Новый сайт в каталог';
  document.getElementById('sm-add-form').reset();
  document.getElementById('f-edit-id').value = '';
  document.getElementById('sm-upload-preview').innerHTML = '';
  document.getElementById('sm-upload-status').textContent = '';
  document.getElementById('sm-zip-status').textContent = '';
  document.getElementById('sm-zip-filename').textContent = '';
  sm_pendingImageUrl = null;
  sm_pendingZip = null;
  document.getElementById('sm-modal-backdrop').classList.add('show');
}
function smCloseModal() {
  document.getElementById('sm-modal-backdrop').classList.remove('show');
  sm_editingId = null;
}
function smOpenEditModal(id) {
  const item = smGetListing(id);
  if (!item) return;
  sm_editingId = id;
  document.getElementById('sm-modal-title').textContent = 'Редактирование: ' + item.title;
  document.getElementById('f-edit-id').value = id;
  document.getElementById('f-title').value = item.title;
  document.getElementById('f-category').value = item.category || 'Другое';
  document.getElementById('f-price').value = item.price;
  document.getElementById('f-badge').value = item.badge || '';
  document.getElementById('f-desc').value = item.desc || '';
  document.getElementById('f-details').value = item.details || '';
  if (item.image) {
    document.getElementById('sm-upload-preview').innerHTML = '<img src="' + item.image + '">';
    sm_pendingImageUrl = item.image;
  } else {
    document.getElementById('sm-upload-preview').innerHTML = '';
    sm_pendingImageUrl = null;
  }
  if (item.zipData || item.zipUrl) {
    document.getElementById('sm-zip-filename').textContent = 'ZIP уже загружен (замените, загрузив новый)';
  } else {
    document.getElementById('sm-zip-filename').textContent = '';
  }
  sm_pendingZip = null;
  document.getElementById('sm-modal-backdrop').classList.add('show');
}

function smShowBanModal(email) {
  document.getElementById('sm-ban-email').value = email;
  document.getElementById('sm-ban-reason').value = 'spam';
  document.getElementById('sm-ban-custom-reason').value = '';
  document.getElementById('sm-ban-duration').value = '7';
  document.getElementById('sm-ban-custom-block').style.display = 'none';
  document.getElementById('sm-ban-modal-backdrop').classList.add('show');
}
function smCloseBanModal() {
  document.getElementById('sm-ban-modal-backdrop').classList.remove('show');
}
function smConfirmBan() {
  const email = document.getElementById('sm-ban-email').value;
  const reason = document.getElementById('sm-ban-reason').value;
  const duration = document.getElementById('sm-ban-duration').value;
  let customReason = document.getElementById('sm-ban-custom-reason').value.trim();
  let finalReason = reason;
  if (reason === 'other') {
    if (!customReason) {
      alert('Введите причину блокировки');
      return;
    }
    finalReason = customReason;
  } else {
    const reasonMap = {
      'spam': 'Спам',
      'abuse': 'Оскорбления/нарушение правил',
      'fraud': 'Мошенничество',
      'other': 'Другое'
    };
    finalReason = reasonMap[reason] || reason;
  }
  if (!['7','14','30','forever'].includes(duration)) {
    alert('Выберите срок блокировки');
    return;
  }
  smSetBanned(email, true, finalReason, duration);
  smCloseBanModal();
  smAdminRenderUsers();
  smAdminStats();
}

function smAdminRenderUsers() {
  const tbody = document.getElementById('sm-users-tbody');
  const allUsers = smGetUsers();
  const session = smGetSession();
  const isOwner = session && session.role === 'owner';
  const isAdmin = session && session.role === 'admin';

  let filtered = allUsers;
  if (sm_currentUserFilter === 'active') {
    filtered = allUsers.filter(u => !u.banned);
  } else if (sm_currentUserFilter === 'banned') {
    filtered = allUsers.filter(u => u.banned);
  }

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-faint);padding:32px;">Пользователи не найдены.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (u) {
    const statusPill = u.banned
      ? '<span class="pill pill-banned">заблокирован</span>'
      : '<span class="pill pill-ok">активен</span>';
    const rolePill = u.role === 'owner' ? '<span class="pill" style="background:rgba(255,106,26,.25);border-color:var(--orange);color:var(--orange-2);">владелец</span>' :
                     u.role === 'admin' ? '<span class="pill pill-ok" style="background:rgba(255,106,26,.15);border-color:var(--orange);color:var(--orange-2);">админ</span>' :
                     u.role === 'author' ? '<span class="pill" style="background:rgba(255,200,50,.15);border-color:#ffb347;color:#ffb347;">соавтор</span>' :
                     '<span class="pill">пользователь</span>';
    let permsDisplay = '';
    if (u.role === 'admin') {
      const perms = u.permissions || [];
      const labels = perms.map(function(p) { return SM_PERMISSION_LABELS[p] || p; });
      permsDisplay = labels.join(', ') || 'нет прав';
    } else if (u.role === 'owner') {
      permsDisplay = 'все права';
    } else {
      permsDisplay = '—';
    }

    let banInfo = '';
    if (u.banned) {
      let info = 'Причина: ' + (u.banReason || 'Не указана');
      if (u.banExpires) {
        const remaining = Math.ceil((u.banExpires - Date.now()) / (1000 * 60 * 60 * 24));
        if (remaining > 0) {
          info += ' | Осталось: ' + remaining + ' дн.';
        } else {
          info += ' | Срок истёк (авторазбан)';
        }
      } else {
        info += ' | Бессрочно';
      }
      banInfo = '<div style="font-size:11px;color:var(--text-faint);max-width:200px;word-break:break-word;">' + info + '</div>';
    }

    let actionsHtml = '';
    if (isOwner) {
      actionsHtml += '<button class="btn sm-topup" data-email="' + smEsc(u.email) + '">+ Баланс</button>';
      if (u.role === 'admin') {
        actionsHtml += '<button class="btn sm-edit-user" data-email="' + smEsc(u.email) + '">✎ Права</button>';
      }
      if (u.role !== 'owner') {
        const nextRole = u.role === 'admin' ? 'user' : 'admin';
        actionsHtml += '<button class="btn sm-role" data-email="' + smEsc(u.email) + '" data-role="' + u.role + '">Сделать ' + nextRole + '</button>';
        const banText = u.banned ? 'Разбанить' : 'Забанить';
        const banClass = u.banned ? '' : 'btn-danger';
        actionsHtml += '<button class="btn ' + banClass + ' sm-ban" data-email="' + smEsc(u.email) + '" data-banned="' + u.banned + '">' + banText + '</button>';
      }
    } else if (isAdmin) {
      if (smCanPerform('manage_users')) {
        actionsHtml += '<button class="btn sm-topup" data-email="' + smEsc(u.email) + '">+ Баланс</button>';
      }
    }

    return (
      '<tr>' +
        '<td class="uid-badge">#' + u.uid + '</td>' +
        '<td>' + smEsc(u.name) + '</td>' +
        '<td>' + smEsc(u.email) + '</td>' +
        '<td>' + Number(u.balance || 0).toLocaleString('ru-RU') + ' ₽</td>' +
        '<td><button class="btn sm-history-btn" data-email="' + smEsc(u.email) + '" style="padding:4px 10px;font-size:12px;">' + (u.purchases ? u.purchases.length : 0) + ' 🛍</button></td>' +
        '<td>' + rolePill + '</td>' +
        '<td style="font-size:12px;max-width:180px;word-break:break-word;">' + smEsc(permsDisplay) + '</td>' +
        '<td>' + statusPill + banInfo + '</td>' +
        '<td class="row-actions">' + actionsHtml + '</td>' +
      '</tr>'
    );
  }).join('');

  tbody.querySelectorAll('.sm-history-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      smShowPurchaseHistory(btn.getAttribute('data-email'));
    });
  });

  tbody.querySelectorAll('.sm-topup').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const email = btn.getAttribute('data-email');
      const amount = prompt('На сколько рублей пополнить баланс?', '1000');
      if (amount === null) return;
      const num = parseFloat(amount);
      if (isNaN(num) || num === 0) return;
      smAddBalance(email, num);
      smAdminRenderUsers();
    });
  });

  if (isOwner) {
    tbody.querySelectorAll('.sm-ban').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const email = btn.getAttribute('data-email');
        const isBanned = btn.getAttribute('data-banned') === 'true';
        if (!isBanned) {
          smShowBanModal(email);
        } else {
          if (!confirm('Разблокировать пользователя ' + email + '?')) return;
          smSetBanned(email, false);
          smAdminRenderUsers();
          smAdminStats();
        }
      });
    });
    tbody.querySelectorAll('.sm-role').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const email = btn.getAttribute('data-email');
        const currentRole = btn.getAttribute('data-role');
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        if (!confirm('Изменить роль пользователя ' + email + ' на "' + newRole + '"?')) return;
        smSetRole(email, newRole);
        smAdminRenderUsers();
      });
    });
    tbody.querySelectorAll('.sm-edit-user').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const email = btn.getAttribute('data-email');
        smOpenEditUserModal(email);
      });
    });
  }
}

function smSearchUserByUid() {
  const input = document.getElementById('sm-uid-search');
  if (!input) return;
  const uid = parseInt(input.value.trim());
  if (isNaN(uid) || uid <= 0) {
    alert('Введите корректный ID');
    return;
  }
  const user = smFindUserByUid(uid);
  if (!user) {
    alert('Пользователь с ID ' + uid + ' не найден.');
    return;
  }
  const info = 'ID: #' + user.uid + '\nИмя: ' + user.name + '\nEmail: ' + user.email + '\nБаланс: ' + user.balance + '\nЗабанен: ' + (user.banned ? 'Да' : 'Нет') + '\nРоль: ' + user.role;
  alert(info);
}
function smSwitchUserFilter(filter) {
  sm_currentUserFilter = filter;
  document.querySelectorAll('.user-filter-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  smAdminRenderUsers();
}

function smShowPurchaseHistory(email) {
  const user = smFindUserByEmail(email);
  if (!user) return;
  document.getElementById('sm-history-title').textContent = 'История покупок: ' + user.name + ' (' + user.email + ')';
  const body = document.getElementById('sm-history-body');
  const purchases = (user.purchases || []).slice().sort(function (a, b) { return b.boughtAt - a.boughtAt; });
  if (!purchases.length) {
    body.innerHTML = '<p style="color:var(--text-faint);padding:24px;text-align:center;">Покупок пока нет.</p>';
  } else {
    body.innerHTML = '<table style="width:100%;"><thead><tr><th>Товар</th><th>Оплачено</th><th>Дата</th><th>Автор</th><th>Комиссия</th></tr></thead><tbody>' +
      purchases.map(function (p) {
        return '<tr>' +
          '<td>' + smEsc(p.title || '—') + '</td>' +
          '<td>' + Number(p.paidPrice != null ? p.paidPrice : p.price || 0).toLocaleString('ru-RU') + ' ₽</td>' +
          '<td>' + new Date(p.boughtAt).toLocaleString('ru-RU') + '</td>' +
          '<td>' + smEsc(p.authorName || '—') + '</td>' +
          '<td>' + (p.commission != null ? Number(p.commission).toLocaleString('ru-RU') + ' ₽' : '—') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table>';
  }
  document.getElementById('sm-history-backdrop').classList.add('show');
}
function smCloseHistoryModal() {
  document.getElementById('sm-history-backdrop').classList.remove('show');
}

// ---------- Чат поддержки (админ) ----------
let sm_supportActiveEmail = null;
let sm_supportAdminPendingImage = null;

function smUpdateSupportBadge() {
  const badge = document.getElementById('sm-support-badge');
  if (!badge) return;
  const count = smGetSupportUnreadForAdmin();
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function smOpenSupportModal() {
  document.getElementById('sm-support-backdrop').classList.add('show');
  smRenderSupportThreads();
  if (sm_supportActiveEmail) smOpenSupportThread(sm_supportActiveEmail);
}
function smCloseSupportModal() {
  document.getElementById('sm-support-backdrop').classList.remove('show');
}

function smRenderSupportThreads() {
  const container = document.getElementById('sm-support-threads');
  const threads = smGetSupportThreads();
  if (!threads.length) {
    container.innerHTML = '<p style="color:var(--text-faint);font-size:13px;padding:8px;">Обращений пока нет.</p>';
    return;
  }
  container.innerHTML = threads.map(function (t) {
    const active = t.userEmail === sm_supportActiveEmail ? ' active' : '';
    const user = smFindUserByEmail(t.userEmail);
    const uidLabel = user ? ' · #' + user.uid : '';
    const preview = t.lastMessage ? (t.lastMessage.imageUrl && !t.lastMessage.text ? '📷 Фото' : smEsc(t.lastMessage.text.slice(0, 40)) + (t.lastMessage.text.length > 40 ? '…' : '')) : '';
    const unread = t.unreadCount > 0 ? '<span class="badge-count">' + t.unreadCount + '</span>' : '';
    return '<div class="support-thread-item' + active + '" data-email="' + smEsc(t.userEmail) + '">' +
      '<div style="font-weight:600;font-size:13px;">' + smEsc(t.userName || t.userEmail) + uidLabel + ' ' + unread + '</div>' +
      '<div style="font-size:12px;color:var(--text-faint);">' + preview + '</div>' +
      '</div>';
  }).join('');
  container.querySelectorAll('.support-thread-item').forEach(function (el) {
    el.addEventListener('click', function () {
      smOpenSupportThread(el.getAttribute('data-email'));
    });
  });
}

function smOpenSupportThread(email) {
  sm_supportActiveEmail = email;
  const user = smFindUserByEmail(email);
  const uidLabel = user ? ' · ID #' + user.uid : '';
  document.getElementById('sm-support-chat-title').textContent = (user ? user.name + ' (' + user.email + ')' : email) + uidLabel;
  document.getElementById('sm-support-reply-form').style.display = 'flex';
  smMarkSupportReadByAdmin(email);
  smRenderSupportMessages(email);
  smRenderSupportThreads();
  smUpdateSupportBadge();
}

function smRenderSupportMessages(email) {
  const box = document.getElementById('sm-support-messages');
  const thread = smGetSupportThread(email);
  if (!thread.length) {
    box.innerHTML = '<p style="color:var(--text-faint);text-align:center;padding:20px;">Сообщений пока нет.</p>';
    return;
  }
  box.innerHTML = thread.map(function (m) {
    const cls = m.sender === 'admin' ? 'support-msg support-msg-admin' : 'support-msg support-msg-user';
    const img = m.imageUrl ? '<a href="' + m.imageUrl + '" target="_blank" rel="noopener"><img src="' + m.imageUrl + '" style="max-width:180px;border-radius:8px;display:block;margin-top:4px;" loading="lazy" decoding="async"></a>' : '';
    const textHtml = m.text ? smEsc(m.text) : '';
    return '<div class="' + cls + '">' + textHtml + img +
      '<div class="support-msg-time">' + new Date(m.createdAt).toLocaleString('ru-RU') + '</div></div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function smAdminReplySupport(e) {
  e.preventDefault();
  if (!sm_supportActiveEmail) return;
  const input = document.getElementById('sm-support-reply-input');
  const text = input.value.trim();
  if (!text && !sm_supportAdminPendingImage) return;
  smSendSupportMessage(sm_supportActiveEmail, null, 'admin', text, sm_supportAdminPendingImage);
  input.value = '';
  sm_supportAdminPendingImage = null;
  const imgInput = document.getElementById('f-support-admin-image');
  if (imgInput) imgInput.value = '';
  document.getElementById('sm-support-admin-image-status').textContent = '';
  smRenderSupportMessages(sm_supportActiveEmail);
  smRenderSupportThreads();
}

// ---------- Проверка: подозрительные аккаунты + жалобы ----------
function smUpdateReviewBadge() {
  const badge = document.getElementById('sm-review-badge');
  if (!badge) return;
  const count = smGetFlaggedUsers().length + smGetPendingReports().length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function smOpenReviewModal() {
  document.getElementById('sm-review-backdrop').classList.add('show');
  smRenderFlaggedAccounts();
  smRenderReports();
}
function smCloseReviewModal() {
  document.getElementById('sm-review-backdrop').classList.remove('show');
}
function smSwitchReviewTab(tab) {
  document.querySelectorAll('.review-tab-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  document.getElementById('sm-review-accounts').style.display = tab === 'accounts' ? 'block' : 'none';
  document.getElementById('sm-review-reports').style.display = tab === 'reports' ? 'block' : 'none';
}

function smRenderFlaggedAccounts() {
  const container = document.getElementById('sm-review-accounts');
  const flagged = smGetFlaggedUsers();
  if (!flagged.length) {
    container.innerHTML = '<p style="color:var(--text-faint);padding:20px;text-align:center;">Подозрительных аккаунтов нет.</p>';
    return;
  }
  container.innerHTML = flagged.map(function (u) {
    const sourceLabel = u.flagSource === 'auto' ? '🤖 Автоблокировка' : '👤 По жалобе';
    return '<div class="report-reason-card">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
        '<div><b>' + smEsc(u.name) + '</b> (' + smEsc(u.email) + ') · #' + u.uid + '</div>' +
        '<div style="font-size:12px;color:var(--text-faint);">' + sourceLabel + ' · ' + new Date(u.flaggedAt).toLocaleString('ru-RU') + '</div>' +
      '</div>' +
      '<div style="margin:8px 0;font-size:14px;">' + smEsc(u.flagReason || '—') + '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn sm-flag-clear" data-email="' + smEsc(u.email) + '">✅ Разбанить (ложная тревога)</button>' +
        '<button class="btn btn-danger sm-flag-keep" data-email="' + smEsc(u.email) + '">🚫 Оставить бан</button>' +
        '<button class="btn sm-flag-history" data-email="' + smEsc(u.email) + '">🛍 История покупок</button>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.sm-flag-clear').forEach(function (btn) {
    btn.addEventListener('click', function () {
      smResolveUserFlag(btn.getAttribute('data-email'), false);
      smRenderFlaggedAccounts();
      smUpdateReviewBadge();
      smAdminRenderUsers();
    });
  });
  container.querySelectorAll('.sm-flag-keep').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Оставить аккаунт заблокированным?')) return;
      smResolveUserFlag(btn.getAttribute('data-email'), true);
      smRenderFlaggedAccounts();
      smUpdateReviewBadge();
      smAdminRenderUsers();
    });
  });
  container.querySelectorAll('.sm-flag-history').forEach(function (btn) {
    btn.addEventListener('click', function () {
      smShowPurchaseHistory(btn.getAttribute('data-email'));
    });
  });
}

function smRenderReports() {
  const container = document.getElementById('sm-review-reports');
  const reports = smGetReports().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  if (!reports.length) {
    container.innerHTML = '<p style="color:var(--text-faint);padding:20px;text-align:center;">Жалоб нет.</p>';
    return;
  }
  container.innerHTML = reports.map(function (r) {
    const statusLabel = r.status === 'pending' ? '<span class="pill">на рассмотрении</span>' :
                         r.status === 'resolved' ? '<span class="pill pill-banned">товар снят</span>' :
                         '<span class="pill pill-ok">отклонена</span>';
    const actions = r.status === 'pending'
      ? '<button class="btn btn-danger sm-report-resolve" data-id="' + r.id + '" data-listing="' + smEsc(r.listingId) + '">🚫 Снять товар с публикации</button>' +
        '<button class="btn sm-report-dismiss" data-id="' + r.id + '">Отклонить жалобу</button>'
      : '';
    return '<div class="report-reason-card">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
        '<div><b>' + smEsc(r.listingTitle) + '</b></div>' +
        '<div style="font-size:12px;color:var(--text-faint);">' + new Date(r.createdAt).toLocaleString('ru-RU') + '</div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-faint);margin:4px 0;">От: ' + smEsc(r.reporterName) + (r.reporterEmail ? ' (' + smEsc(r.reporterEmail) + ')' : '') + '</div>' +
      '<div style="margin:6px 0;font-size:14px;"><b>Причина:</b> ' + smEsc(r.reason) + (r.details ? '<br>' + smEsc(r.details) : '') + '</div>' +
      '<div style="margin-top:8px;">' + statusLabel + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' + actions + '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.sm-report-resolve').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Снять товар с публикации? Он вернётся на модерацию.')) return;
      smUpdateListing(btn.getAttribute('data-listing'), { moderationStatus: 'rejected' });
      smUpdateReportStatus(btn.getAttribute('data-id'), 'resolved');
      smRenderReports();
      smUpdateReviewBadge();
      smAdminRenderTable();
    });
  });
  container.querySelectorAll('.sm-report-dismiss').forEach(function (btn) {
    btn.addEventListener('click', function () {
      smUpdateReportStatus(btn.getAttribute('data-id'), 'dismissed');
      smRenderReports();
      smUpdateReviewBadge();
    });
  });
}

function smOpenPoliciesModal() {
  const policies = smGetPolicies();
  document.getElementById('sm-policy-userTerms').value = policies.userTerms || '';
  document.getElementById('sm-policy-authorTerms').value = policies.authorTerms || '';
  document.getElementById('sm-policy-purchase').value = policies.purchase || '';
  document.getElementById('sm-policies-msg').textContent = '';
  document.getElementById('sm-policies-backdrop').classList.add('show');
}
function smClosePoliciesModal() {
  document.getElementById('sm-policies-backdrop').classList.remove('show');
}
function smSavePolicies() {
  const policies = {
    userTerms: document.getElementById('sm-policy-userTerms').value,
    authorTerms: document.getElementById('sm-policy-authorTerms').value,
    purchase: document.getElementById('sm-policy-purchase').value
  };
  smSetPolicies(policies);
  const msg = document.getElementById('sm-policies-msg');
  msg.textContent = 'Сохранено ✓';
  setTimeout(function () { msg.textContent = ''; }, 2000);
}

function smOpenUserModal() {
  document.getElementById('sm-user-modal-title').textContent = 'Создать пользователя';
  document.getElementById('sm-user-form').reset();
  document.getElementById('fu-edit-email').value = '';
  document.getElementById('fu-email').disabled = false;
  document.getElementById('fu-pass-field').style.display = 'block';
  document.getElementById('fu-role').disabled = false;
  document.getElementById('fu-permissions-block').style.display = 'none';
  document.querySelectorAll('.fu-perm').forEach(function (cb) { cb.checked = false; });
  document.getElementById('sm-user-modal-backdrop').classList.add('show');
}
function smCloseUserModal() {
  document.getElementById('sm-user-modal-backdrop').classList.remove('show');
}
function smOpenEditUserModal(email) {
  const user = smFindUserByEmail(email);
  if (!user || user.role !== 'admin') return;
  document.getElementById('sm-user-modal-title').textContent = 'Редактирование прав администратора';
  document.getElementById('fu-edit-email').value = email;
  document.getElementById('fu-name').value = user.name;
  document.getElementById('fu-email').value = user.email;
  document.getElementById('fu-email').disabled = true;
  document.getElementById('fu-pass-field').style.display = 'none';
  document.getElementById('fu-role').value = 'admin';
  document.getElementById('fu-role').disabled = true;
  const perms = user.permissions || [];
  document.querySelectorAll('.fu-perm').forEach(function (cb) {
    cb.checked = perms.includes(cb.value);
  });
  document.getElementById('fu-permissions-block').style.display = 'block';
  document.getElementById('sm-user-modal-backdrop').classList.add('show');
}

function smRenderPromocodes() {
  const list = smGetPromocodes();
  const container = document.getElementById('sm-promocodes-list');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<p style="color:var(--text-faint);">Промокодов пока нет.</p>';
    return;
  }
  container.innerHTML = list.map(function(p) {
    const expires = p.expires ? new Date(p.expires).toLocaleDateString() : '∞';
    const used = p.used + '/' + p.uses;
    const typeLabel = p.type === 'percent' ? 'Скидка ' + p.value + '%' : 'Баланс ' + p.value + ' ₽';
    return '<div><span><b>' + smEsc(p.code) + '</b> — ' + typeLabel + '</span><span>Использован: ' + used + ' | Срок: ' + expires + '</span></div>';
  }).join('');
}
function smCreatePromocodeForm() {
  const code = document.getElementById('f-promo-code').value.trim();
  const type = document.getElementById('f-promo-type').value;
  const value = parseFloat(document.getElementById('f-promo-value').value);
  const uses = parseInt(document.getElementById('f-promo-uses').value) || 1;
  const expires = document.getElementById('f-promo-expires').value;
  if (!code) { alert('Введите код промокода'); return; }
  if (!value || value <= 0) { alert('Введите корректное значение'); return; }
  if (type === 'percent' && (value < 5 || value > 90)) { alert('Скидка должна быть от 5% до 90%'); return; }
  if (type === 'balance' && (value < 600 || value > 8000)) { alert('Сумма должна быть от 600 до 8000 ₽'); return; }
  const result = smCreatePromocode(code, type, value, uses, expires, 'owner');
  if (!result.ok) { alert(result.error); return; }
  alert('Промокод создан!');
  document.getElementById('sm-promo-form').reset();
  smRenderPromocodes();
}

function smRenderDevList() {
  const container = document.getElementById('sm-dev-list');
  const devs = smGetDevelopers();
  if (!container) return;
  if (!devs.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Нет разработчиков.</p>';
    return;
  }
  container.innerHTML = devs.map(function(d) {
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--bg-secondary);flex-shrink:0;">
          ${d.photo ? '<img src="'+d.photo+'" style="width:100%;height:100%;object-fit:cover;" loading="lazy" decoding="async">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--accent);">'+d.name.charAt(0).toUpperCase()+'</div>'}
        </div>
        <div style="flex:1;">
          <b>${smEsc(d.name)}</b>
          <div style="font-size:12px;color:var(--text-secondary);">${smEsc(d.description)}</div>
          <div style="font-size:12px;color:var(--accent-hover);">${d.sitesCount || 0}+ сайтов</div>
        </div>
        <button class="btn btn-danger sm-dev-del" data-id="${d.id}">×</button>
      </div>
    `;
  }).join('');
  container.querySelectorAll('.sm-dev-del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (confirm('Удалить разработчика?')) {
        smDeleteDeveloper(btn.getAttribute('data-id'));
        smRenderDevList();
      }
    });
  });
}
function smOpenDevModal() {
  document.getElementById('sm-dev-modal-backdrop').classList.add('show');
  smRenderDevList();
}
function smCloseDevModal() {
  document.getElementById('sm-dev-modal-backdrop').classList.remove('show');
}

function smRenderApplications() {
  const container = document.getElementById('sm-applications-list');
  if (!container) return;
  const apps = smGetApplications().filter(a => a.status === 'pending');
  if (!apps.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Нет новых заявок.</p>';
    return;
  }
  container.innerHTML = apps.map(function(app) {
    return `
      <div style="border-bottom:1px solid var(--border);padding:12px 0;">
        <div><b>${smEsc(app.userName)}</b> (${smEsc(app.userEmail)})</div>
        <div style="font-size:13px;color:var(--text-secondary);">GitHub: ${smEsc(app.github)}</div>
        <div style="font-size:13px;color:var(--text-secondary);">Email: ${smEsc(app.email)} | Телефон: ${smEsc(app.phone)}</div>
        <div style="font-size:13px;color:var(--text-secondary);">Сообщение: ${smEsc(app.message)}</div>
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button class="btn btn-primary sm-app-approve" data-id="${app.id}" data-email="${app.userEmail}">Принять</button>
          <button class="btn btn-danger sm-app-reject" data-id="${app.id}">Отклонить</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.sm-app-approve').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const id = btn.getAttribute('data-id');
      const email = btn.getAttribute('data-email');
      if (confirm('Принять заявку и назначить пользователя соавтором?')) {
        smUpdateUser(email, { role: 'author', authorStatus: 'active', warnCount: 0 });
        smUpdateApplication(id, 'approved');
        smRenderApplications();
        smAdminRenderUsers();
      }
    });
  });
  container.querySelectorAll('.sm-app-reject').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const id = btn.getAttribute('data-id');
      if (confirm('Отклонить заявку?')) {
        smUpdateApplication(id, 'rejected');
        smRenderApplications();
      }
    });
  });
}
function smOpenApplications() {
  document.getElementById('sm-applications-backdrop').classList.add('show');
  smRenderApplications();
}
function smCloseApplications() {
  document.getElementById('sm-applications-backdrop').classList.remove('show');
}

function smRenderModeration() {
  const container = document.getElementById('sm-moderation-list');
  if (!container) return;
  const moderation = smGetModerationList().filter(m => m.status === 'pending');
  console.log('[admin.js] smRenderModeration -> найдено записей:', moderation.length);
  if (!moderation.length) {
    container.innerHTML = '<p style="color:var(--text-muted);">Нет сайтов на модерации.</p>';
    return;
  }
  container.innerHTML = moderation.map(function(m) {
    return `
      <div style="border-bottom:1px solid var(--border);padding:12px 0;">
        <div><b>${smEsc(m.title)}</b></div>
        <div style="font-size:13px;color:var(--text-secondary);">Автор: ${smEsc(m.authorName)} (${smEsc(m.authorEmail)})</div>
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button class="btn btn-primary sm-mod-approve" data-id="${m.listingId}" data-email="${m.authorEmail}">Одобрить</button>
          <button class="btn btn-danger sm-mod-reject" data-id="${m.listingId}" data-email="${m.authorEmail}">Отклонить</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.sm-mod-approve').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const id = btn.getAttribute('data-id');
      if (confirm('Одобрить сайт для публикации?')) {
        smApproveListing(id);
        smRenderModeration();
        smAdminRenderTable();
      }
    });
  });
  container.querySelectorAll('.sm-mod-reject').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const id = btn.getAttribute('data-id');
      const email = btn.getAttribute('data-email');
      if (confirm('Отклонить сайт? Автор получит предупреждение.')) {
        const user = smFindUserByEmail(email);
        if (user && user.role === 'author') {
          let warns = (user.warnCount || 0) + 1;
          if (warns >= 3) {
            smUpdateUser(email, { role: 'user', warnCount: 0, authorStatus: null });
            alert('Пользователь ' + email + ' получил 3 варна и понижен до обычного пользователя.');
          } else {
            smUpdateUser(email, { warnCount: warns });
            alert('Пользователь ' + email + ' получил предупреждение (' + warns + '/3).');
          }
        }
        smRejectListing(id);
        smRenderModeration();
        smAdminRenderTable();
      }
    });
  });
}
function smOpenModeration() {
  document.getElementById('sm-moderation-backdrop').classList.add('show');
  smRenderModeration();
}
function smCloseModeration() {
  document.getElementById('sm-moderation-backdrop').classList.remove('show');
}

function smToggleApplications() {
  const settings = smGetAppSettings();
  const newState = !settings.open;
  smSetAppSettings(newState);
  alert('Приём заявок ' + (newState ? 'открыт' : 'закрыт') + '.');
  const toggleBtn = document.getElementById('sm-toggle-applications');
  if (toggleBtn) {
    toggleBtn.textContent = newState ? '🔒 Закрыть заявки' : '🔓 Открыть заявки';
  }
}

function smRenderSettings() {
  const settings = smGetPlatformSettings();
  document.getElementById('sm-commission-rate').value = settings.commissionRate || 10;
}
function smSaveSettings() {
  const rate = parseFloat(document.getElementById('sm-commission-rate').value);
  if (isNaN(rate) || rate < 0 || rate > 100) {
    alert('Введите комиссию от 0 до 100%');
    return;
  }
  smSetPlatformSettings({ commissionRate: rate });
  alert('Настройки сохранены!');
}

function smAdminSwitchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.admin-panel').forEach(function (p) {
    p.classList.toggle('active', p.id === 'panel-' + tab);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  try {
    const session = smRequireRole('admin');
    if (!session) return;

    smRenderNav('admin');
    smAdminStats();
    smAdminRenderTable();
    smAdminRenderUsers();
    smRenderPromocodes();

    document.querySelectorAll('.admin-tab').forEach(function (t) {
      t.addEventListener('click', function () { smAdminSwitchTab(t.getAttribute('data-tab')); });
    });

    document.querySelectorAll('.user-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        smSwitchUserFilter(btn.getAttribute('data-filter'));
      });
    });
    const searchBtn = document.getElementById('sm-uid-search-btn');
    if (searchBtn) searchBtn.addEventListener('click', smSearchUserByUid);

    const passBtn = document.getElementById('sm-open-pass-section');
    if (passBtn) {
      passBtn.addEventListener('click', function() {
        const section = document.getElementById('sm-pass-section');
        if (section) {
          section.style.display = section.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    const promoBtn = document.getElementById('sm-open-promo-section');
    if (promoBtn) {
      if (session.role === 'owner') {
        promoBtn.style.display = 'block';
        promoBtn.addEventListener('click', function() {
          const section = document.getElementById('sm-promo-section');
          if (section) {
            section.style.display = section.style.display === 'none' ? 'block' : 'none';
          }
        });
      } else {
        promoBtn.style.display = 'none';
      }
    }
    if (session.role === 'owner') {
      const promoSection = document.getElementById('sm-promo-section');
      if (promoSection) promoSection.style.display = 'block';
    }

    const devBtn = document.getElementById('sm-open-dev-modal');
    if (devBtn) devBtn.addEventListener('click', smOpenDevModal);
    const devClose = document.getElementById('sm-dev-modal-close');
    if (devClose) devClose.addEventListener('click', smCloseDevModal);
    const devBackdrop = document.getElementById('sm-dev-modal-backdrop');
    if (devBackdrop) {
      devBackdrop.addEventListener('click', function(e) {
        if (e.target === this) smCloseDevModal();
      });
    }
    const devPhoto = document.getElementById('f-dev-photo');
    if (devPhoto) {
      smBindImageInput(
        devPhoto,
        document.getElementById('sm-dev-upload-status'),
        function(url) {
          const preview = document.getElementById('sm-dev-upload-preview');
          if (preview) preview.innerHTML = '<img src="'+url+'">';
          window._pendingDevPhoto = url;
        }
      );
    }
    const devForm = document.getElementById('sm-dev-form');
    if (devForm) {
      devForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const name = document.getElementById('f-dev-name').value.trim();
        const description = document.getElementById('f-dev-desc').value.trim();
        const sitesCount = parseInt(document.getElementById('f-dev-sites').value) || 0;
        const photo = window._pendingDevPhoto || null;
        if (!name) { alert('Введите имя'); return; }
        smAddDeveloper({ name, description, sitesCount, photo });
        devForm.reset();
        const preview = document.getElementById('sm-dev-upload-preview');
        if (preview) preview.innerHTML = '';
        window._pendingDevPhoto = null;
        smRenderDevList();
      });
    }

    const appBtn = document.getElementById('sm-open-applications');
    if (appBtn) appBtn.addEventListener('click', smOpenApplications);
    const appClose = document.getElementById('sm-applications-close');
    if (appClose) appClose.addEventListener('click', smCloseApplications);
    const appBackdrop = document.getElementById('sm-applications-backdrop');
    if (appBackdrop) {
      appBackdrop.addEventListener('click', function(e) {
        if (e.target === this) smCloseApplications();
      });
    }

    const modBtn = document.getElementById('sm-open-moderation');
    if (modBtn) modBtn.addEventListener('click', smOpenModeration);
    const modClose = document.getElementById('sm-moderation-close');
    if (modClose) modClose.addEventListener('click', smCloseModeration);
    const modBackdrop = document.getElementById('sm-moderation-backdrop');
    if (modBackdrop) {
      modBackdrop.addEventListener('click', function(e) {
        if (e.target === this) smCloseModeration();
      });
    }

    const supportBtn = document.getElementById('sm-open-support');
    if (supportBtn) supportBtn.addEventListener('click', smOpenSupportModal);
    const supportClose = document.getElementById('sm-support-close');
    if (supportClose) supportClose.addEventListener('click', smCloseSupportModal);
    const supportBackdrop = document.getElementById('sm-support-backdrop');
    if (supportBackdrop) {
      supportBackdrop.addEventListener('click', function (e) {
        if (e.target === this) smCloseSupportModal();
      });
    }
    const supportForm = document.getElementById('sm-support-reply-form');
    if (supportForm) supportForm.addEventListener('submit', smAdminReplySupport);
    const supportAdminImageInput = document.getElementById('f-support-admin-image');
    if (supportAdminImageInput) {
      supportAdminImageInput.addEventListener('change', function () {
        const file = supportAdminImageInput.files[0];
        if (!file) return;
        const status = document.getElementById('sm-support-admin-image-status');
        status.textContent = 'Загрузка фото…';
        smUploadImage(file).then(function (url) {
          sm_supportAdminPendingImage = url;
          status.textContent = 'Фото прикреплено ✓';
        }).catch(function (err) {
          status.textContent = err.message || 'Не удалось загрузить фото.';
        });
      });
    }
    smUpdateSupportBadge();

    const reviewBtn = document.getElementById('sm-open-review');
    if (reviewBtn) reviewBtn.addEventListener('click', smOpenReviewModal);
    const reviewClose = document.getElementById('sm-review-close');
    if (reviewClose) reviewClose.addEventListener('click', smCloseReviewModal);
    const reviewBackdrop = document.getElementById('sm-review-backdrop');
    if (reviewBackdrop) {
      reviewBackdrop.addEventListener('click', function (e) {
        if (e.target === this) smCloseReviewModal();
      });
    }
    document.querySelectorAll('.review-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { smSwitchReviewTab(btn.getAttribute('data-tab')); });
    });
    smUpdateReviewBadge();

    const policiesBtn = document.getElementById('sm-open-policies');
    if (policiesBtn) policiesBtn.addEventListener('click', smOpenPoliciesModal);
    const policiesClose = document.getElementById('sm-policies-close');
    if (policiesClose) policiesClose.addEventListener('click', smClosePoliciesModal);
    const policiesBackdrop = document.getElementById('sm-policies-backdrop');
    if (policiesBackdrop) {
      policiesBackdrop.addEventListener('click', function (e) {
        if (e.target === this) smClosePoliciesModal();
      });
    }
    const policiesSave = document.getElementById('sm-policies-save');
    if (policiesSave) policiesSave.addEventListener('click', smSavePolicies);

    const historyClose = document.getElementById('sm-history-close');
    if (historyClose) historyClose.addEventListener('click', smCloseHistoryModal);
    const historyBackdrop = document.getElementById('sm-history-backdrop');
    if (historyBackdrop) {
      historyBackdrop.addEventListener('click', function (e) {
        if (e.target === this) smCloseHistoryModal();
      });
    }

    const toggleBtn = document.getElementById('sm-toggle-applications');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', smToggleApplications);
      const settings = smGetAppSettings();
      toggleBtn.textContent = settings.open ? '🔒 Закрыть заявки' : '🔓 Открыть заявки';
    }

    const settingsBtn = document.getElementById('sm-open-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function() {
        const section = document.getElementById('sm-settings-section');
        if (section) {
          section.style.display = section.style.display === 'none' ? 'block' : 'none';
          smRenderSettings();
        }
      });
    }
    const saveSettingsBtn = document.getElementById('sm-save-settings');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', smSaveSettings);

    const imageInput = document.getElementById('f-image');
    if (imageInput) {
      smBindImageInput(
        imageInput,
        document.getElementById('sm-upload-status'),
        function (url) {
          sm_pendingImageUrl = url;
          const preview = document.getElementById('sm-upload-preview');
          if (preview) preview.innerHTML = '<img src="' + url + '">';
        }
      );
    }
    const zipInput = document.getElementById('f-zip');
    if (zipInput) {
      smBindZipInput(
        zipInput,
        document.getElementById('sm-zip-status'),
        document.getElementById('sm-zip-filename'),
        function (result) { sm_pendingZip = result; }
      );
    }

    const openModal = document.getElementById('sm-open-modal');
    if (openModal) openModal.addEventListener('click', smOpenModal);
    const closeModal = document.getElementById('sm-close-modal');
    if (closeModal) closeModal.addEventListener('click', smCloseModal);
    const modalBackdrop = document.getElementById('sm-modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', function (e) {
        if (e.target === this) smCloseModal();
      });
    }

    const openUser = document.getElementById('sm-open-user-modal');
    if (openUser) openUser.addEventListener('click', smOpenUserModal);
    const closeUser = document.getElementById('sm-user-modal-close');
    if (closeUser) closeUser.addEventListener('click', smCloseUserModal);
    const userBackdrop = document.getElementById('sm-user-modal-backdrop');
    if (userBackdrop) {
      userBackdrop.addEventListener('click', function (e) {
        if (e.target === this) smCloseUserModal();
      });
    }

    const banCancel = document.getElementById('sm-ban-cancel');
    if (banCancel) banCancel.addEventListener('click', smCloseBanModal);
    const banConfirm = document.getElementById('sm-ban-confirm');
    if (banConfirm) banConfirm.addEventListener('click', smConfirmBan);
    const banClose = document.getElementById('sm-ban-modal-close');
    if (banClose) banClose.addEventListener('click', smCloseBanModal);
    const banBackdrop = document.getElementById('sm-ban-modal-backdrop');
    if (banBackdrop) {
      banBackdrop.addEventListener('click', function(e) {
        if (e.target === this) smCloseBanModal();
      });
    }
    const banReason = document.getElementById('sm-ban-reason');
    if (banReason) {
      banReason.addEventListener('change', function() {
        const block = document.getElementById('sm-ban-custom-block');
        if (block) block.style.display = this.value === 'other' ? 'block' : 'none';
      });
    }

    const userForm = document.getElementById('sm-user-form');
    if (userForm) {
      userForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const editEmail = document.getElementById('fu-edit-email').value;
        const name = document.getElementById('fu-name').value.trim();
        const email = document.getElementById('fu-email').value.trim();
        const password = document.getElementById('fu-pass').value;
        const role = document.getElementById('fu-role').value;
        const permissions = [];
        document.querySelectorAll('.fu-perm:checked').forEach(function (cb) {
          permissions.push(cb.value);
        });

        if (editEmail) {
          const user = smFindUserByEmail(editEmail);
          if (!user) return alert('Пользователь не найден');
          smSetPermissions(editEmail, permissions);
          alert('Права обновлены');
          smCloseUserModal();
          smAdminRenderUsers();
          return;
        }

        if (!password) { alert('Введите пароль'); return; }
        const result = smAdminCreateUser(name, email, password, role, permissions);
        if (!result.ok) { alert(result.error); return; }
        alert('Пользователь создан! UID: ' + result.uid);
        smCloseUserModal();
        smAdminRenderUsers();
        smAdminStats();
      });
    }

    const addForm = document.getElementById('sm-add-form');
    if (addForm) {
      addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const id = document.getElementById('f-edit-id').value;
        const title = document.getElementById('f-title').value.trim();
        const category = document.getElementById('f-category').value;
        const price = parseFloat(document.getElementById('f-price').value);
        const badge = document.getElementById('f-badge').value || null;
        const desc = document.getElementById('f-desc').value.trim();
        const details = document.getElementById('f-details').value.trim();

        if (!title || !price) { alert('Заполните название и цену.'); return; }
        if (!id && !sm_pendingZip) { alert('Для нового товара загрузите ZIP-архив с сайтом.'); return; }

        const data = { title, category, price, badge, desc, details, image: sm_pendingImageUrl || null };
        if (sm_pendingZip) {
          data.zipUrl = sm_pendingZip.zipUrl || null;
          data.zipData = sm_pendingZip.zipData || null;
        }

        const currentSession = smGetSession();
        if (currentSession && currentSession.role === 'author') {
          data.authorEmail = currentSession.email;
          data.authorName = currentSession.name;
          data.moderationStatus = 'pending';
        } else {
          data.moderationStatus = 'approved';
        }

        if (id) {
          smUpdateListing(id, data);
        } else {
          smAddListing(data);
        }

        smAdminRenderTable();
        smAdminStats();
        smCloseModal();
      });
    }

    const passForm = document.getElementById('sm-admin-pass-form');
    if (passForm) {
      passForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const oldPass = document.getElementById('f-admin-old-pass').value;
        const newPass = document.getElementById('f-admin-new-pass').value;
        const msg = document.getElementById('sm-admin-pass-msg');
        const session = smGetSession();
        if (!session) return;
        const result = smChangePasswordAny(session.email, oldPass, newPass);
        if (!result.ok) {
          if (msg) {
            msg.textContent = result.error;
            msg.className = 'form-msg error show';
          }
          return;
        }
        if (msg) {
          msg.textContent = 'Пароль изменён!';
          msg.className = 'form-msg ok show';
        }
        passForm.reset();
      });
    }

    const promoForm = document.getElementById('sm-promo-form');
    if (promoForm) {
      promoForm.addEventListener('submit', function(e) {
        e.preventDefault();
        smCreatePromocodeForm();
      });
    }

    const roleSelect = document.getElementById('fu-role');
    if (roleSelect) {
      roleSelect.addEventListener('change', function () {
        const block = document.getElementById('fu-permissions-block');
        if (block) block.style.display = this.value === 'admin' ? 'block' : 'none';
      });
    }

    window.addEventListener('sm:sync', function (e) {
      const col = e && e.detail && e.detail.collection;
      if (col === 'listings') { smAdminRenderTable(); smAdminStats(); }
      if (col === 'moderation') { smRenderModeration(); }
      if (col === 'users') { smAdminRenderUsers(); smAdminStats(); smUpdateReviewBadge(); if (document.getElementById('sm-review-backdrop').classList.contains('show')) smRenderFlaggedAccounts(); }
      if (col === 'promocodes') { smRenderPromocodes(); }
      if (col === 'developers') { smRenderDevList(); }
      if (col === 'applications') { smRenderApplications(); }
      if (col === 'reports') {
        smUpdateReviewBadge();
        if (document.getElementById('sm-review-backdrop').classList.contains('show')) smRenderReports();
      }
      if (col === 'supportMessages') {
        smUpdateSupportBadge();
        if (document.getElementById('sm-support-backdrop').classList.contains('show')) {
          smRenderSupportThreads();
          if (sm_supportActiveEmail) smRenderSupportMessages(sm_supportActiveEmail);
        }
      }
    });

  } catch (err) {
    console.error('Ошибка в админ-панели:', err);
    alert('Ошибка загрузки админ-панели. Проверьте консоль.');
  }
});