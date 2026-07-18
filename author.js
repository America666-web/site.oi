/* ==========================================================================
   SiteMarket — author.js (усиленная отладка)
   ========================================================================== */

let sm_authorPendingImage = null;
let sm_authorPendingZip = null;

function smAuthorRenderStats() {
  const session = smGetSession();
  if (!session) return;
  const user = smFindUserByEmail(session.email);
  if (!user) return;
  const listings = smGetAuthorListings(session.email);
  const sales = user.totalSales || 0;
  const earnings = user.authorEarnings || 0;

  document.getElementById('author-total-sites').textContent = listings.length;
  document.getElementById('author-sales').textContent = sales;
  document.getElementById('author-earnings').textContent = Number(earnings).toLocaleString('ru-RU') + ' ₽';
}

function smAuthorRenderTable() {
  const tbody = document.getElementById('sm-author-tbody');
  const session = smGetSession();
  if (!session) return;
  const listings = smGetAuthorListings(session.email);

  if (!listings.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:32px;">Вы ещё не добавили ни одного сайта.</td></tr>';
    return;
  }

  tbody.innerHTML = listings.map(function(item) {
    const statusMap = {
      'pending': '⏳ На модерации',
      'approved': '✅ Опубликован',
      'rejected': '❌ Отклонён'
    };
    const status = statusMap[item.moderationStatus] || 'Неизвестно';
    const salesCount = item.salesCount || 0;
    return `
      <tr>
        <td>${smEsc(item.title)}</td>
        <td>${Number(item.price).toLocaleString('ru-RU')} ₽</td>
        <td>${status}</td>
        <td>${salesCount}</td>
        <td class="row-actions">
          <button class="btn btn-danger sm-author-del" data-id="${item.id}">Удалить</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.sm-author-del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (confirm('Удалить этот сайт?')) {
        smDeleteListing(btn.getAttribute('data-id'));
        smAuthorRenderTable();
        smAuthorRenderStats();
      }
    });
  });
}

function smAuthorOpenAddModal() {
  document.getElementById('sm-author-modal-backdrop').classList.add('show');
}
function smAuthorCloseAddModal() {
  document.getElementById('sm-author-modal-backdrop').classList.remove('show');
  document.getElementById('sm-author-add-form').reset();
  sm_authorPendingImage = null;
  sm_authorPendingZip = null;
  document.getElementById('sm-author-upload-preview').innerHTML = '';
  document.getElementById('sm-author-zip-filename').textContent = '';
}

document.addEventListener('DOMContentLoaded', function() {
  const session = smRequireRole('author');
  if (!session) return;

  smRenderNav('author');
  smAuthorRenderStats();
  smAuthorRenderTable();

  document.getElementById('sm-author-add-site').addEventListener('click', smAuthorOpenAddModal);
  document.getElementById('sm-author-modal-close').addEventListener('click', smAuthorCloseAddModal);
  document.getElementById('sm-author-modal-backdrop').addEventListener('click', function(e) {
    if (e.target === this) smAuthorCloseAddModal();
  });

  smBindImageInput(
    document.getElementById('f-author-image'),
    document.getElementById('sm-author-upload-status'),
    function(url) {
      sm_authorPendingImage = url;
      document.getElementById('sm-author-upload-preview').innerHTML = '<img src="' + url + '">';
    }
  );

  smBindZipInput(
    document.getElementById('f-author-zip'),
    document.getElementById('sm-author-zip-status'),
    document.getElementById('sm-author-zip-filename'),
    function(result) {
      sm_authorPendingZip = result;
    }
  );

  document.getElementById('sm-author-add-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const title = document.getElementById('f-author-title').value.trim();
    const category = document.getElementById('f-author-category').value;
    const price = parseFloat(document.getElementById('f-author-price').value);
    const badge = document.getElementById('f-author-badge').value || null;
    const desc = document.getElementById('f-author-desc').value.trim();
    const details = document.getElementById('f-author-details').value.trim();

    if (!title || !price) {
      alert('Заполните название и цену.');
      return;
    }
    if (!sm_authorPendingZip) {
      alert('Загрузите ZIP-архив с сайтом.');
      return;
    }

    const data = {
      title: title,
      category: category,
      price: price,
      badge: badge,
      desc: desc,
      details: details,
      image: sm_authorPendingImage || null,
      zipUrl: sm_authorPendingZip.zipUrl || null,
      zipData: sm_authorPendingZip.zipData || null,
      authorEmail: session.email,
      authorName: session.name,
      moderationStatus: 'pending'
    };

    const added = smAddListing(data);

    alert('✅ Сайт отправлен на модерацию!');
    smAuthorCloseAddModal();
    smAuthorRenderTable();
    smAuthorRenderStats();
  });

  window.addEventListener('sm:sync', function (e) {
    const col = e && e.detail && e.detail.collection;
    if (col === 'listings') { smAuthorRenderTable(); smAuthorRenderStats(); }
  });
});