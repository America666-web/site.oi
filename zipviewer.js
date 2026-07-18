/* ==========================================================================
   SiteMarket — zipviewer.js
   Распаковка ZIP-архивов и показ сайта в iframe для предпросмотра
   ========================================================================== */

async function smExtractZipToBlobUrl(zipBase64) {
    const binaryString = atob(zipBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return smExtractZipBytesToBlobUrl(bytes);
}

// Тот же процесс, но принимает уже готовые байты (например, скачанные
// напрямую с Firebase Storage через zipUrl — без лишнего base64-круга)
async function smExtractZipBytesToBlobUrl(bytes) {
    try {
        const zip = await JSZip.loadAsync(bytes);
        
        let htmlFile = null;
        let htmlFileName = null;
        const files = Object.keys(zip.files);
        
        for (const name of files) {
            const lower = name.toLowerCase();
            if (lower === 'index.html' || lower.endsWith('/index.html')) {
                htmlFile = zip.files[name];
                htmlFileName = name;
                break;
            }
        }
        
        if (!htmlFile) {
            for (const name of files) {
                if (name.toLowerCase().endsWith('.html') && !zip.files[name].dir) {
                    htmlFile = zip.files[name];
                    htmlFileName = name;
                    break;
                }
            }
        }
        
        if (!htmlFile) {
            throw new Error('В ZIP-архиве не найден HTML-файл (index.html или другой .html)');
        }
        
        const htmlContent = await htmlFile.async('string');
        
        const resources = {};
        for (const name of files) {
            const file = zip.files[name];
            if (file.dir) continue;
            if (name === htmlFileName) continue;
            
            const ext = name.split('.').pop().toLowerCase();
            const isText = ['css', 'js', 'json', 'xml', 'svg', 'txt', 'map'].includes(ext);
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(ext);
            
            if (isText) {
                try {
                    resources[name] = await file.async('string');
                } catch (e) {
                    resources[name] = await file.async('base64');
                }
            } else if (isImage) {
                resources[name] = await file.async('base64');
            } else {
                try {
                    resources[name] = await file.async('base64');
                } catch (e) {}
            }
        }
        
        const processedHtml = smInjectResourcesToHtml(htmlContent, resources, htmlFileName);
        const blob = new Blob([processedHtml], { type: 'text/html; charset=utf-8' });
        return URL.createObjectURL(blob);
        
    } catch (error) {
        console.error('Ошибка распаковки ZIP:', error);
        throw error;
    }
}

function smInjectResourcesToHtml(html, resources, htmlPath) {
    let result = html;
    const baseDir = htmlPath.includes('/') ? htmlPath.substring(0, htmlPath.lastIndexOf('/') + 1) : '';
    
    function getResourceContent(path) {
        let normalized = path;
        if (normalized.startsWith('./')) normalized = normalized.substring(2);
        if (normalized.startsWith('../')) {
            const parts = normalized.split('/');
            const newParts = [];
            for (const part of parts) {
                if (part === '..') {
                    newParts.pop();
                } else if (part !== '.') {
                    newParts.push(part);
                }
            }
            normalized = newParts.join('/');
        }
        let fullPath = normalized;
        if (resources[fullPath]) return resources[fullPath];
        if (baseDir) {
            fullPath = baseDir + normalized;
            if (resources[fullPath]) return resources[fullPath];
        }
        for (const key of Object.keys(resources)) {
            if (key.toLowerCase() === normalized.toLowerCase() || 
                key.toLowerCase() === (baseDir + normalized).toLowerCase()) {
                return resources[key];
            }
        }
        return null;
    }
    
    // CSS
    result = result.replace(
        /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
        function(match, href) {
            const content = getResourceContent(href);
            if (content) return '<style>' + content + '</style>';
            return match;
        }
    );
    
    // JS
    result = result.replace(
        /<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
        function(match, src) {
            const content = getResourceContent(src);
            if (content) return '<script>' + content + '<\/script>';
            return match;
        }
    );
    
    // Изображения в <img>
    result = result.replace(
        /<img[^>]*src=["']([^"']+)["'][^>]*>/gi,
        function(match, src) {
            if (src.match(/^https?:\/\//) || src.match(/^\/\//)) return match;
            const content = getResourceContent(src);
            if (content) {
                const ext = src.split('.').pop().toLowerCase();
                const mimeTypes = {
                    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
                    'bmp': 'image/bmp', 'ico': 'image/x-icon'
                };
                const mime = mimeTypes[ext] || 'image/png';
                return match.replace(/src=["'][^"']+["']/, 'src="data:' + mime + ';base64,' + content + '"');
            }
            return match;
        }
    );
    
    // background-image в стилях
    result = result.replace(
        /<style>([\s\S]*?)<\/style>/gi,
        function(match, styles) {
            const newStyles = styles.replace(
                /url\(["']?([^"')]+)["']?\)/gi,
                function(urlMatch, url) {
                    if (url.match(/^https?:\/\//) || url.match(/^\/\//) || url.match(/^data:/)) return urlMatch;
                    const content = getResourceContent(url);
                    if (content) {
                        const ext = url.split('.').pop().toLowerCase();
                        const mimeTypes = {
                            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                            'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
                            'bmp': 'image/bmp', 'ico': 'image/x-icon'
                        };
                        const mime = mimeTypes[ext] || 'image/png';
                        return 'url(data:' + mime + ';base64,' + content + ')';
                    }
                    return urlMatch;
                }
            );
            return '<style>' + newStyles + '</style>';
        }
    );
    
    return result;
}

function smCanPreviewZip(listing) {
    if (!listing) return false;
    const hasBase64 = typeof listing.zipData === 'string' && listing.zipData.length > 0;
    const hasUrl = typeof listing.zipUrl === 'string' && listing.zipUrl.length > 0;
    return hasBase64 || hasUrl;
}

// Получает blob URL для предпросмотра, откуда бы ни хранился архив
async function smGetZipBlobUrl(listing) {
    if (listing.zipUrl) {
        const res = await fetch(listing.zipUrl);
        if (!res.ok) throw new Error('Не удалось скачать ZIP с хранилища.');
        const buf = await res.arrayBuffer();
        return smExtractZipBytesToBlobUrl(new Uint8Array(buf));
    }
    return smExtractZipToBlobUrl(listing.zipData);
}

async function smGetPreviewSource(listing) {
    if (!listing) return null;
    if (smCanPreviewZip(listing)) {
        try {
            const blobUrl = await smGetZipBlobUrl(listing);
            return { mode: 'src', value: blobUrl };
        } catch (e) {
            console.warn('Не удалось распаковать ZIP:', e);
            return null;
        }
    }
    return null;
}

/**
 * Возвращает URL для полноэкранного просмотра (открытие в новой вкладке)
 * Если это ZIP — создаёт blob URL, если ссылка — возвращает её.
 */
async function smGetFullscreenUrl(listing) {
    if (!listing) return null;
    if (smCanPreviewZip(listing)) {
        try {
            const blobUrl = await smGetZipBlobUrl(listing);
            return blobUrl;
        } catch (e) {
            console.warn('Не удалось создать URL для полноэкранного просмотра:', e);
            return null;
        }
    }
    return null;
}

// Водяной знак — менее заметный
function smWatermarkHtml() {
    let spans = '';
    for (let i = 0; i < 16; i++) {
        spans += '<span>SITEMARKET</span>';
    }
    return '<div class="watermark-overlay" style="opacity:0.12;transform:rotate(-18deg) scale(0.8);pointer-events:none;position:absolute;inset:0;display:flex;flex-wrap:wrap;gap:28px 48px;align-content:center;justify-content:center;overflow:hidden;font-family:var(--ff-display);font-weight:700;font-size:11px;letter-spacing:.06em;color:#fff;text-shadow:0 0 2px rgba(0,0,0,0.3);">' + spans + '</div>';
}