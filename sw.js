// Scope all URLs and caches to this GitHub Pages project, including /repo/ paths.
const VERSION = '1.2.1';
const BASE = new URL('./', self.location.href);
const PREFIX = 'better-life-github:' + BASE.pathname + ':';
const CACHE = PREFIX + VERSION;
const FILES = ['./', 'index.html', 'app.js', 'core.js', 'analysis.js', 'analysis-view.js', 'ai.js', 'style.css', 'icon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
const URLS = new Set(FILES.map(file => new URL(file, BASE).href));

function usable(response, url) {
  if (!response.ok || response.redirected) return false;
  const html = url === BASE.href || url === new URL('index.html', BASE).href;
  const type = response.headers.get('content-type') || '';
  return html ? type.includes('text/html') : !type.includes('text/html');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch everything before altering the cache, so a failed install stays retryable.
    const entries = await Promise.all([...URLS].map(async url => {
      const response = await fetch(url, {cache: 'reload'});
      if (!usable(response, url)) throw Error('離線資源載入未完成');
      return [url, response];
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(entries.map(([url, response]) => cache.put(url, response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin) return; // Gemini, calendar and other origins are never cached.
  const canonical = new URL(url.href);
  canonical.search = '';
  canonical.hash = '';
  if (!URLS.has(canonical.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (usable(response, canonical.href)) {
        event.waitUntil(cache.put(canonical.href, response.clone()));
        return response;
      }
      return await cache.match(canonical.href) || response;
    } catch {
      return await cache.match(canonical.href) || new Response('請先連網開啟 Better life，以完成離線安裝。', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
      });
    }
  })());
});
