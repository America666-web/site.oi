/* ==========================================================================
   SiteMarket — upload.js
   Загрузка картинок (фото сайта, аватар) на внешний хостинг imgbb.
   В localStorage и коде НИКОГДА не сохраняется сам файл — только ссылка,
   которую возвращает imgbb после загрузки.
   ========================================================================== */

// Ключ закодирован через base64 — не лежит в коде открытым текстом.
const SM_IMGBB_KEY = atob('OTliZmEwZjc0Y2FiNjEzMDk1ODJlZWM5YzE1NjVlNjQ=');

function smFileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      // reader.result выглядит как "data:image/png;base64,AAAA..."
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Загружает файл на imgbb и возвращает Promise<string> со ссылкой на картинку.
 * Сам файл при этом никуда локально не сохраняется.
 */
async function smUploadImage(file) {
  if (!file) throw new Error('Файл не выбран.');
  if (!file.type.startsWith('image/')) throw new Error('Можно загружать только изображения.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Файл слишком большой (максимум 8 МБ).');

  const base64 = await smFileToBase64(file);

  const form = new FormData();
  form.append('key', SM_IMGBB_KEY);
  form.append('image', base64);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form
  });

  if (!res.ok) throw new Error('Сервис изображений недоступен, попробуйте позже.');

  const data = await res.json();
  if (!data || !data.success) throw new Error('Не удалось загрузить изображение.');

  return data.data.url; // сохраняем только ссылку
}

/**
 * Универсальный помощник: вешает обработчик на <input type="file">,
 * показывает состояние загрузки в элементе statusEl и вызывает onDone(url)
 * после успешной загрузки на imgbb.
 */
function smBindImageInput(inputEl, statusEl, onDone) {
  inputEl.addEventListener('change', function () {
    const file = inputEl.files[0];
    if (!file) return;

    statusEl.textContent = 'Загрузка…';
    statusEl.classList.remove('error');

    smUploadImage(file).then(function (url) {
      statusEl.textContent = 'Загружено ✓';
      onDone(url);
    }).catch(function (err) {
      statusEl.textContent = err.message || 'Ошибка загрузки.';
      statusEl.classList.add('error');
    });
  });
}

// Жёсткий лимит на размер ZIP-архива. Без Firebase Storage (см. смету/Blaze)
// архив хранится прямо в Firestore-документе, а там жёсткий потолок 1 МБ на
// документ — оставляем запас с учётом base64 (+33% к размеру) и метаданных.
const SM_MAX_ZIP_SIZE = 700 * 1024; // 700 КБ

/**
 * Загружает ZIP-архив с сайтом. Если подключён Firebase Storage (Blaze) —
 * грузит туда и возвращает ссылку на скачивание. Если Storage недоступен
 * (например, подключён только бесплатный Firestore, без Blaze) —
 * откатывается на старый способ: base64 прямо в товаре. У этого способа
 * есть жёсткое ограничение — Firestore не принимает документы больше 1 МБ,
 * поэтому архив должен быть небольшим.
 */
async function smUploadZip(file) {
  if (!file) throw new Error('Файл не выбран.');
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Нужен ZIP-файл.');

  if (typeof smStorage !== 'undefined' && smStorage && typeof smFirebaseReady !== 'undefined' && smFirebaseReady) {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('ZIP не более 50 МБ.');
      const path = 'zips/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ref = smStorage.ref().child(path);
      const snapshot = await ref.put(file);
      const url = await snapshot.ref.getDownloadURL();
      return { zipUrl: url, zipData: null };
    } catch (e) {
      console.warn('[upload] Firebase Storage недоступен (нужен план Blaze), используем локальный режим:', e);
      // не бросаем ошибку — просто уходим в фолбэк ниже
    }
  }

  // Без Storage: base64 внутри товара. Firestore режет документы больше 1 МБ,
  // base64 раздувает размер файла примерно на треть — оставляем запас.
  if (file.size > SM_MAX_ZIP_SIZE) {
    throw new Error('Архив слишком большой: ' + (file.size / 1024).toFixed(0) + ' КБ, максимум — ' + (SM_MAX_ZIP_SIZE / 1024).toFixed(0) + ' КБ. Сожмите сайт (уберите видео/тяжёлые картинки) или подключите Firebase Storage.');
  }
  const base64 = await new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function (e) { resolve(e.target.result.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { zipUrl: null, zipData: base64 };
}

/**
 * Единая функция для всех страниц (админка, панель соавтора): вешает
 * обработчик на <input type="file"> с ZIP-архивом, показывает статус
 * загрузки и вызывает onLoad({zipUrl, zipData}) после успешной загрузки.
 */
function smBindZipInput(inputEl, statusEl, filenameEl, onLoad) {
  inputEl.addEventListener('change', function () {
    const file = inputEl.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      statusEl.textContent = 'Ошибка: нужен ZIP-файл';
      statusEl.classList.add('error');
      inputEl.value = '';
      return;
    }
    const usingStorage = typeof smStorage !== 'undefined' && smStorage && typeof smFirebaseReady !== 'undefined' && smFirebaseReady;
    const limit = usingStorage ? 50 * 1024 * 1024 : SM_MAX_ZIP_SIZE;
    if (file.size > limit) {
      const limitLabel = usingStorage ? '50 МБ' : (SM_MAX_ZIP_SIZE / 1024).toFixed(0) + ' КБ';
      statusEl.textContent = 'Слишком большой файл: ' + (file.size / 1024).toFixed(0) + ' КБ (максимум — ' + limitLabel + '). Сожмите сайт (уберите видео/тяжёлые картинки, оптимизируйте изображения).';
      statusEl.classList.add('error');
      filenameEl.textContent = '';
      inputEl.value = '';
      return;
    }
    statusEl.textContent = 'Загрузка ZIP…';
    statusEl.classList.remove('error');
    filenameEl.textContent = file.name;

    smUploadZip(file).then(function (result) {
      statusEl.textContent = 'ZIP загружен ✓ (' + (file.size / 1024).toFixed(1) + ' КБ)';
      statusEl.classList.remove('error');
      if (onLoad) onLoad(result);
    }).catch(function (err) {
      statusEl.textContent = err.message || 'Ошибка загрузки ZIP';
      statusEl.classList.add('error');
      filenameEl.textContent = '';
      inputEl.value = '';
    });
  });
}
