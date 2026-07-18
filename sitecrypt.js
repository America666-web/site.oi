

const SM_SITE_KEY = atob('U2l0ZU1hcmtldC1TZWNyZXQtMjAyNiE=');

function smXor(str, key) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

/** Сжимает и "шифрует" сырой HTML в компактную строку для хранения. */
function smEncodeSite(rawHtml) {
  const compressed = LZString.compressToBase64(rawHtml);
  const xored = smXor(compressed, SM_SITE_KEY);
  return btoa(xored);
}

/** Обратная операция — возвращает исходный HTML. */
function smDecodeSite(payload) {
  const xored = atob(payload);
  const compressed = smXor(xored, SM_SITE_KEY);
  return LZString.decompressFromBase64(compressed);
}

/** Оценка итогового размера в килобайтах — показываем админу перед сохранением. */
function smEstimateEncodedKb(rawHtml) {
  return Math.ceil(smEncodeSite(rawHtml).length / 1024);
}

/**
 * Возвращает, откуда брать содержимое сайта для показа в iframe.
 * link       -> { mode: 'src', value: url }         — реальная ссылка на хостинг
 * inline-enc -> { mode: 'doc', value: html }         — расшифрованный HTML (сжатое хранение)
 * inline-raw -> { mode: 'doc', value: html }         — HTML демо-сайтов "из коробки"
 */
function smResolveSiteSource(item) {
  const src = item.siteSource;
  if (!src) return null;
  if (src.type === 'link') return { mode: 'src', value: src.url };
  if (src.type === 'inline-enc') return { mode: 'doc', value: smDecodeSite(src.payload) };
  if (src.type === 'inline-raw') return { mode: 'doc', value: src.payload };
  return null;
}
