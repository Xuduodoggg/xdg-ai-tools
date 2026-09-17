/* Overtone Service Worker
   目标：装成应用后，即使断网也能打开界面（音乐本来就在本机）。
   策略：应用外壳预缓存；页面导航走「网络优先」，保证重新部署后能拿到新版。 */

const VERSION = 'overtone-v1';
const SCOPE = self.registration.scope;
const ENTRY = new URL('Overtone.html', SCOPE).href;

const SHELL = [
  ENTRY,
  new URL('manifest.json', SCOPE).href,
  new URL('图标/overtone-192.png', SCOPE).href,
  new URL('图标/overtone-512.png', SCOPE).href,
  new URL('图标/overtone-maskable-192.png', SCOPE).href,
  new URL('图标/overtone-maskable-512.png', SCOPE).href,
  new URL('图标/overtone.svg', SCOPE).href,
  new URL('图标/overtone.ico', SCOPE).href
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 单个资源失败不影响整体安装
    await Promise.allSettled(
      SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' })))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
    const list = await self.clients.matchAll({ type: 'window' });
    list.forEach((c) => c.postMessage({ type: 'overtone-activated', version: VERSION }));
  })());
});

async function offlineResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Overtone</title>' +
    '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;' +
    'background:#161618;color:#f5f5f7;font:14px/1.7 -apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif">' +
    '<div style="text-align:center"><p style="font-size:16px;margin:0 0 6px">暂时离线</p>' +
    '<p style="margin:0;color:#a1a1a6">还没有缓存到应用界面，请联网后再打开一次。</p></div></body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 只接管同源资源

  // 页面导航：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(ENTRY, fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(VERSION);
        return (await cache.match(ENTRY)) || (await cache.match(req)) || offlineResponse();
      }
    })());
    return;
  }

  // 其余资源：缓存优先，未命中再走网络并顺手缓存
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
