/**
 * prerender.js
 * ---------------------------------------------------------------
 * Решает проблему "робот видит пустой каталог" (CSR-невидимость),
 * НЕ трогая остальной стек (без Vite/Tailwind).
 *
 * Что делает:
 *   1. Стучится в Firestore твоего проекта (REST API, без ключей —
 *      это открытое чтение, как и обычная работа сайта в браузере).
 *   2. Забирает все одобренные товары (moderationStatus === 'approved').
 *   3. Генерирует простой HTML-список карточек (заголовок, цена,
 *      категория) — без картинок и JS, только текст для поисковика.
 *   4. Вставляет этот HTML в index.html между метками
 *      <!-- SM-PRERENDER-START --> и <!-- SM-PRERENDER-END -->.
 *
 * Как только страница открывается в браузере, твой обычный app.js
 * всё равно перезаписывает #sm-grid живыми данными из Firestore —
 * так что для живых посетителей ничего не меняется, они как и
 * раньше видят актуальный каталог с реальным временем обновления.
 * А вот для робота Google/Яндекса, который НЕ выполняет JS (или
 * делает это ограниченно), в исходном HTML уже есть текст — то,
 * ради чего всё это затевалось.
 *
 * КАК ЗАПУСТИТЬ:
 *   node prerender.js
 *
 * Никакой установки npm-пакетов не требуется — скрипт использует
 * только встроенные модули Node.js (https, fs).
 *
 * КОГДА ЗАПУСКАТЬ:
 *   Перед каждым деплоем (или по расписанию, например раз в час
 *   через cron / GitHub Actions), чтобы статический снимок каталога
 *   не устаревал слишком сильно. Живым посетителям это не важно
 *   (у них всё равно всегда актуальные данные из Firestore) — это
 *   нужно только для того, что видит поисковый робот при заходе.
 * ---------------------------------------------------------------
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FIREBASE_PROJECT_ID = 'site-ee45a';
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');
const START_MARKER = '<!-- SM-PRERENDER-START -->';
const END_MARKER = '<!-- SM-PRERENDER-END -->';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Не удалось разобрать ответ Firestore: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

// Firestore REST возвращает поля в типизированном виде:
// { stringValue: "..." } / { integerValue: "10" } / { booleanValue: true } и т.д.
// Эта функция превращает документ Firestore в обычный плоский JS-объект.
function parseFirestoreDoc(doc) {
  const out = {};
  const fields = doc.fields || {};
  for (const key in fields) {
    const val = fields[key];
    if ('stringValue' in val) out[key] = val.stringValue;
    else if ('integerValue' in val) out[key] = parseInt(val.integerValue, 10);
    else if ('doubleValue' in val) out[key] = val.doubleValue;
    else if ('booleanValue' in val) out[key] = val.booleanValue;
    else if ('nullValue' in val) out[key] = null;
    else out[key] = null; // массивы/объекты нам тут не нужны
  }
  return out;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCardHtml(item) {
  const price = Number(item.price || 0).toLocaleString('ru-RU');
  return (
    '<div class="site-card" data-id="' + escapeHtml(item.id) + '" data-cat="' + escapeHtml(item.category) + '">' +
      '<div class="win-bar"><span class="win-dot active"></span><span class="win-dot"></span><span class="win-dot"></span></div>' +
      '<div class="win-preview"><div class="win-fallback"><span>' + escapeHtml((item.title || '?').trim().charAt(0).toUpperCase()) + '</span></div></div>' +
      '<div class="site-card-body">' +
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        '<p>' + escapeHtml(item.desc || '') + '</p>' +
        '<div class="site-meta">' +
          '<span class="tag">' + escapeHtml(item.category) + '</span>' +
          '<span class="price">' + price + ' ₽</span>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

async function main() {
  console.log('[prerender] Забираю список товаров из Firestore…');

  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/listings?pageSize=300';
  let result;
  try {
    result = await fetchJson(url);
  } catch (e) {
    console.error('[prerender] Не удалось получить данные из Firestore:', e.message);
    console.error('[prerender] Проверь, что Firestore включён и правила чтения открыты (test mode).');
    process.exit(1);
  }

  if (result.error) {
    console.error('[prerender] Firestore вернул ошибку:', result.error.message || result.error);
    process.exit(1);
  }

  const docs = result.documents || [];
  const listings = docs.map(parseFirestoreDoc).filter((item) => {
    const hasFile = (item.zipData && item.zipData.length > 0) || (item.zipUrl && item.zipUrl.length > 0);
    return hasFile && item.moderationStatus === 'approved';
  });

  console.log('[prerender] Найдено одобренных товаров:', listings.length);

  const cardsHtml = listings.length
    ? listings.map(buildCardHtml).join('\n')
    : '';

  let html;
  try {
    html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  } catch (e) {
    console.error('[prerender] Не удалось прочитать index.html:', e.message);
    process.exit(1);
  }

  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.error('[prerender] Метки ' + START_MARKER + ' / ' + END_MARKER + ' не найдены в index.html.');
    process.exit(1);
  }

  const before = html.slice(0, startIdx + START_MARKER.length);
  const after = html.slice(endIdx);
  const newHtml = before + '\n' + cardsHtml + '\n' + after;

  fs.writeFileSync(INDEX_HTML_PATH, newHtml, 'utf8');
  console.log('[prerender] Готово! index.html обновлён статическим снимком каталога.');
}

main();
