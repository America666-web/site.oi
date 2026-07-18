/* ==========================================================================
   SiteMarket — author-dashboard.js
   Панель управления для соавторов
   ========================================================================== */

let sm_pendingImageUrl = null;
let sm_pendingZipData = null;
let sm_editingId = null;
let sm_currentFilter = 'all';

function smAuthorDashboard() {
  const session = smRequireRole('author');
  if (!session) return;

  smRenderNav('author-dashboard');
  smRenderAuthorSites();
  smRenderStats();

  // Фильтры
  document.querySelectorAll('#sm-author-filters .chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('#sm-author-filters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      sm_currentFilter = chip.getAttribute('data-filter');
      smRenderAuthorSites();
    });
  });

  // Кнопки
  document.getElementById('sm-show-my-sites').addEventListener('click', function() {
    document.getElementById('sm-dashboard-title').textContent = 'Мои сайты';
    document.getElementById('sm-author-stats').style.display = 'none';
    document.getElementById('sm-author-sites').style.display = 'grid';
  });
  document.getElementById('sm-show-stats').addEventListener('click', function() {
    document.getElementById('sm-dashboard-title').textContent = 'Статистика';
    document.getElementById('sm-author-sites').style.display = 'none';
    document.getElementById('sm-author-stats').style.display = 'block';
    smRenderStats();
  });

  // Модалка добавления сайта
  document.getElementById('sm-open-modal').addEventListener('click', smOpenAuthorModal);
  document.getElementById('sm-close-modal').addEventListener('click', smCloseAuthorModal);
  document.getElementById('sm-modal-backdrop').addEventListener('click', function(e) {
    if (e.target === this) smCloseAuthorModal();
  });

  // Загрузка фото и ZIP
  smBindImageInput(
    document.getElementById('f-image'),
    document.getElementById('sm-upload-status'),
    function(url) {
      sm_pendingImageUrl = url;
      document.getElementById('sm-upload-preview').innerHTML = '<img src="' + url + '">';
    }
  );
  smBindZipInput(
    document.getElementById('f-zip'),
    document.getElementById('sm-zip-status'),
    document.getElementById('sm-zip-filename'),
    function (result) { sm_pendingZipData = result; }
  );

  // Форма добавления сайта
  document.getElementById('sm-add-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('f-title').value.trim();
    const category = document.getElementById('f-category').value;
    const price = parseFloat(document.getElementById('f-price').value);
    const badge = document.getElementById('f-badge').value || null;
    const desc = document.getElementById('f-desc').value.trim();
    const details = document.getElementById('f-details').value.trim();

    if (!title || !price) { alert('Заполните название и цену.'); return; }
    if (!sm_pendingZipData) { alert('Загрузите ZIP-архив с сайтом.'); return; }

    const session = smGetSession();
    const data = {
      title,
      category,
      price,
      badge,
      desc,
      details,
      image: sm_pendingImageUrl || null,
      zipUrl: sm_pendingZipData.zipUrl || null,
      zipData: sm_pendingZipData.zipData || null,
      authorEmail: session.email,
      authorName: session.name,
      moderationStatus: 'pending'
    };
    smAddListing(data);
    alert('Сайт отправлен на модерацию!');
    smCloseAuthorModal();
    smRenderAuthorSites();
    smRenderStats();
  });
}

function smOpenAuthorModal() {
  document.getElementById('sm-modal-title').textContent = 'Новый сайт';
  document.getElementById('sm-add-form').reset();
  document.getElementById('sm-upload-preview').innerHTML = '';
  document.getElementById('sm-upload-status').textContent = '';
  document.getElementById('sm-zip-status').textContent = '';
  document.getElementById('sm-zip-filename').textContent = '';
  sm_pendingImageUrl = null;
  sm_pendingZipData = null;
  document.getElementById('sm-modal-backdrop').classList.add('show');
}
function smCloseAuthorModal() {
  document.getElementById('sm-modal-backdrop').classList.remove('show');
}

function smRenderAuthorSites() {
  const container = document.getElementById('sm-author-sites');
  const session = smGetSession();
  if (!session) return;
  const listings = smGetListings().filter(function(item) {
    return item.authorEmail === session.email;
  });

  let filtered = listings;
  if (sm_currentFilter !== 'all') {
    if (sm_currentFilter === 'sold') {
      // 'sold' — сайты, которые были куплены хотя бы раз (можно добавить поле soldCount или проверять purchases)
      // Пока просто показываем все, где есть покупки
      filtered = listings.filter(function(item) {
        // Проверяем, есть ли покупки этого товара
        const users = smGetUsers();
        for (let u of users) {
          if (u.purchases && u.purchases.some(p => p.id === item.id)) {
            return true;
          }
        }
        return false;
      });
    } else {
      filtered = listings.filter(function(item) {
        return item.moderationStatus === sm_currentFilter;
      });
    }
  }

  if (!filtered.length) {
    container.innerHTML = '<div class="empty">У вас пока нет сайтов в этой категории.</div>';
    return;
  }

  container.innerHTML = filtered.map(function(item) {
    const statusMap = {
      'pending': '⏳ На модерации',
      'approved': '✅ Опубликован',
      'rejected': '❌ Отклонён'
    };
    const statusText = statusMap[item.moderationStatus] || item.moderationStatus;
    // Проверка продаж
    let soldCount = 0;
    const users = smGetUsers();
    for (let u of users) {
      if (u.purchases && u.purchases.some(p => p.id === item.id)) {
        soldCount += 1;
      }
    }
    const soldInfo = soldCount > 0 ? `Продано: ${soldCount} раз` : '';

    return `
      <div class="site-card">
        <div class="win-bar">
          <span class="win-dot active"></span><span class="win-dot"></span><span class="win-dot"></span>
        </div>
        <div class="win-preview">${smPreviewBlock(item)}</div>
        <div class="site-card-body">
          <h3>${smEsc(item.title)}</h3>
          <p>${smEsc(item.desc)}</p>
          <div class="site-meta">
            <span class="tag">${smEsc(item.category)}</span>
            <span class="price">${Number(item.price).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
            Статус: ${statusText}
            ${soldInfo ? '<br>' + soldInfo : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function smRenderStats() {
  const session = smGetSession();
  if (!session) return;
  const listings = smGetListings().filter(function(item) {
    return item.authorEmail === session.email;
  });

  const total = listings.length;
  const pending = listings.filter(i => i.moderationStatus === 'pending').length;
  const sold = listings.filter(function(i) {
    const users = smGetUsers();
    for (let u of users) {
      if (u.purchases && u.purchases.some(p => p.id === i.id)) {
        return true;
      }
    }
    return false;
  }).length;

  // Подсчёт заработка (сумма продаж с комиссией)
  let earnings = 0;
  const users = smGetUsers();
  for (let u of users) {
    if (u.purchases) {
      for (let p of u.purchases) {
        const listing = smGetListing(p.id);
        if (listing && listing.authorEmail === session.email) {
          const settings = smGetPlatformSettings();
          const commission = settings.commissionRate || 10;
          const authorEarn = Math.round(p.price * (1 - commission / 100));
          earnings += authorEarn;
        }
      }
    }
  }

  document.getElementById('stat-total-sites').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-sold').textContent = sold;
  document.getElementById('stat-earnings').textContent = earnings.toLocaleString('ru-RU') + ' ₽';
}

document.addEventListener('DOMContentLoaded', function() {
  smAuthorDashboard();
  window.addEventListener('sm:sync', function (e) {
    const col = e && e.detail && e.detail.collection;
    if (col === 'listings') { smRenderAuthorSites(); smRenderStats(); }
  });
});