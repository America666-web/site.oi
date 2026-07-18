/* ==========================================================================
   SiteMarket — profile.js (полный)
   ========================================================================== */

let sm_pendingAvatarUrl = null;

function smRenderProfileHeader(user) {
  const avatarBox = document.getElementById('sm-avatar');
  avatarBox.innerHTML = user.avatarUrl
    ? '<img src="' + user.avatarUrl + '" alt="" loading="lazy" decoding="async">'
    : smEsc(user.name.charAt(0).toUpperCase());

  document.getElementById('sm-name').textContent = user.name;
  document.getElementById('sm-email').textContent = user.email;
  document.getElementById('sm-uid').textContent = '#' + user.uid;
  document.getElementById('sm-balance').textContent = Number(user.balance || 0).toLocaleString('ru-RU') + ' ₽';

  const discountEl = document.getElementById('sm-discount');
  if (discountEl) {
    const discount = user.discount || 0;
    discountEl.textContent = discount > 0 ? 'Активная скидка: ' + discount + '%' : '';
  }

  const authorInfo = document.getElementById('sm-author-info');
  if (authorInfo) {
    if (user.role === 'author') {
      const warns = user.warnCount || 0;
      authorInfo.textContent = 'Соавтор · Предупреждений: ' + warns + '/3' + (warns >= 3 ? ' (доступ ограничен)' : '');
      authorInfo.style.color = warns >= 3 ? 'var(--danger)' : 'var(--orange-2)';
    } else {
      authorInfo.textContent = '';
    }
  }

  const uploadPreview = document.getElementById('sm-avatar-upload-preview');
  if (uploadPreview && user.avatarUrl) {
    uploadPreview.innerHTML = '<img src="' + user.avatarUrl + '">';
  }
}

function smRenderPurchases(user) {
  const wrap = document.getElementById('sm-purchases');
  const purchases = user.purchases || [];

  if (!purchases.length) {
    wrap.innerHTML = '<div class="empty">Вы ещё ничего не купили. <a href="index.html" style="color:var(--orange-2);font-weight:600;">Перейти в каталог →</a></div>';
    return;
  }

  wrap.innerHTML = purchases.map(function (p) {
    const date = new Date(p.boughtAt).toLocaleString('ru-RU');
    const listing = smGetListing(p.id);
    const hasZip = listing && (listing.zipData || listing.zipUrl);
    const downloadBtn = (hasZip && !p.refunded)
      ? '<button class="btn btn-primary sm-download-zip" data-id="' + p.id + '" data-title="' + smEsc(p.title) + '">Забрать сайт (ZIP)</button>'
      : '';
    let statusHtml = '';
    if (p.refunded) {
      statusHtml = '<span class="pill pill-banned">Возвращено</span>';
    } else if (p.purchaseId && smCanRefundPurchase(p)) {
      const msLeft = SM_REFUND_WINDOW_MS - (Date.now() - p.boughtAt);
      const minLeft = Math.max(1, Math.ceil(msLeft / 60000));
      statusHtml = '<button class="btn sm-refund" data-id="' + smEsc(p.purchaseId) + '" title="Можно вернуть ещё ' + minLeft + ' мин">↩ Вернуть</button>';
    }

    return (
      '<div class="purchase-row" style="flex-direction:column;align-items:stretch;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
          '<div class="pinfo"><h4>' + smEsc(p.title) + '</h4><span>Куплено ' + date + '</span></div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<div class="price">' + Number(p.price).toLocaleString('ru-RU') + ' ₽</div>' +
            downloadBtn +
            statusHtml +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  wrap.querySelectorAll('.sm-refund').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('Вернуть эту покупку? Деньги вернутся на баланс, доступ к архиву сайта пропадёт.')) return;
      const res = smRefundPurchase(user.email, btn.getAttribute('data-id'));
      if (!res.ok) {
        alert(res.error);
        return;
      }
      const freshUser = smFindUserByEmail(user.email);
      smRenderProfileHeader(freshUser);
      smRenderPurchases(freshUser);
    });
  });

  wrap.querySelectorAll('.sm-download-zip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      const title = btn.getAttribute('data-title');
      smDownloadZip(id, title);
    });
  });
}

function smDownloadZip(listingId, title) {
  const listing = smGetListing(listingId);
  if (!listing || (!listing.zipData && !listing.zipUrl)) {
    alert('Архив с сайтом недоступен.');
    return;
  }
  if (listing.zipUrl) {
    const a = document.createElement('a');
    a.href = listing.zipUrl;
    a.download = title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '.zip';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  try {
    const binaryString = atob(listing.zipData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  } catch (e) {
    alert('Ошибка при скачивании архива: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const session = smRequireRole('user');
  if (!session) return;

  smRenderNav('profile');

  function refresh() {
    const user = smFindUserByEmail(session.email);
    smRenderProfileHeader(user);
    smRenderPurchases(user);
  }
  refresh();

  function renderSupportChat() {
    const box = document.getElementById('sm-support-messages');
    if (!box) return;
    const thread = smGetSupportThread(session.email);
    if (!thread.length) {
      box.innerHTML = '<p style="color:var(--text-faint);text-align:center;padding:16px;">Напишите нам, если есть вопрос — мы ответим здесь.</p>';
    } else {
      box.innerHTML = thread.map(function (m) {
        const cls = m.sender === 'admin' ? 'support-msg support-msg-admin' : 'support-msg support-msg-user';
        const author = m.sender === 'admin' ? 'Поддержка' : 'Вы';
        const img = m.imageUrl ? '<a href="' + m.imageUrl + '" target="_blank" rel="noopener"><img src="' + m.imageUrl + '" style="max-width:180px;border-radius:8px;display:block;margin-top:4px;" loading="lazy" decoding="async"></a>' : '';
        const textHtml = m.text ? smEsc(m.text) : '';
        return '<div class="' + cls + '"><b style="opacity:.75;font-size:11px;">' + author + '</b><br>' + textHtml + img +
          '<div class="support-msg-time">' + new Date(m.createdAt).toLocaleString('ru-RU') + '</div></div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
    }
    smMarkSupportReadByUser(session.email);
  }
  renderSupportChat();

  let sm_supportPendingImage = null;
  const supportImageInput = document.getElementById('f-support-image');
  const supportImageStatus = document.getElementById('sm-support-image-status');
  if (supportImageInput) {
    supportImageInput.addEventListener('change', function () {
      const file = supportImageInput.files[0];
      if (!file) return;
      supportImageStatus.textContent = 'Загрузка фото…';
      smUploadImage(file).then(function (url) {
        sm_supportPendingImage = url;
        supportImageStatus.textContent = 'Фото прикреплено ✓ (отправится вместе с сообщением)';
      }).catch(function (err) {
        supportImageStatus.textContent = err.message || 'Не удалось загрузить фото.';
      });
    });
  }

  const supportForm = document.getElementById('sm-support-form');
  if (supportForm) {
    supportForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const input = document.getElementById('f-support-text');
      const text = input.value.trim();
      if (!text && !sm_supportPendingImage) return;
      smSendSupportMessage(session.email, session.name, 'user', text, sm_supportPendingImage);
      input.value = '';
      sm_supportPendingImage = null;
      supportImageInput.value = '';
      supportImageStatus.textContent = '';
      renderSupportChat();
    });
  }

  window.addEventListener('sm:sync', function (e) {
    const col = e && e.detail && e.detail.collection;
    if (col === 'users') refresh();
    if (col === 'supportMessages') renderSupportChat();
  });

  const topupBtn = document.getElementById('sm-open-topup');
  const topupBackdrop = document.getElementById('sm-topup-backdrop');
  let sm_qrRendered = false;
  if (topupBtn && topupBackdrop) {
    topupBtn.addEventListener('click', function () {
      const user = smFindUserByEmail(session.email);
      document.getElementById('sm-topup-uid').textContent = '#' + (user ? user.uid : '');
      if (!sm_qrRendered && typeof QRCode !== 'undefined') {
        new QRCode(document.getElementById('sm-topup-qrcode'), {
          text: 'https://www.tinkoff.ru/rm/r_zVLUvlPzVS.YkovfTzrwS/3tml960172',
          width: 190,
          height: 190,
          colorDark: '#000000',
          colorLight: '#ffffff'
        });
        sm_qrRendered = true;
      }
      topupBackdrop.classList.add('show');
    });
    document.getElementById('sm-topup-close').addEventListener('click', function () {
      topupBackdrop.classList.remove('show');
    });
    topupBackdrop.addEventListener('click', function (e) {
      if (e.target === this) topupBackdrop.classList.remove('show');
    });
  }

  smBindImageInput(
    document.getElementById('f-avatar-file'),
    document.getElementById('sm-avatar-status'),
    function (url) {
      sm_pendingAvatarUrl = url;
      smUpdateProfileInfo(session.email, null, url);
      document.getElementById('sm-avatar-upload-preview').innerHTML = '<img src="' + url + '">';
      refresh();
    }
  );

  document.getElementById('sm-name-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const name = document.getElementById('f-new-name').value.trim();
    if (!name) return;
    smUpdateProfileInfo(session.email, name);
    document.getElementById('f-new-name').value = '';
    const msg = document.getElementById('sm-name-msg');
    msg.textContent = 'Имя обновлено.';
    msg.className = 'form-msg ok show';
    refresh();
  });

  document.getElementById('sm-pass-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const oldPass = document.getElementById('f-old-pass').value;
    const newPass = document.getElementById('f-new-pass').value;
    const msg = document.getElementById('sm-pass-msg');
    const res = smChangePassword(session.email, oldPass, newPass);
    if (!res.ok) {
      msg.textContent = res.error;
      msg.className = 'form-msg error show';
      return;
    }
    msg.textContent = 'Пароль изменён.';
    msg.className = 'form-msg ok show';
    document.getElementById('sm-pass-form').reset();
  });

  const promoForm = document.getElementById('sm-promo-apply-form');
  if (promoForm) {
    promoForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const code = document.getElementById('f-promo-apply').value.trim();
      const msg = document.getElementById('sm-promo-apply-msg');
      if (!code) {
        msg.textContent = 'Введите код';
        msg.className = 'form-msg error show';
        return;
      }
      const result = smApplyPromocode(code, session.email);
      if (!result.ok) {
        msg.textContent = result.error;
        msg.className = 'form-msg error show';
        return;
      }
      msg.textContent = result.message;
      msg.className = 'form-msg ok show';
      document.getElementById('f-promo-apply').value = '';
      refresh();
    });
  }
});