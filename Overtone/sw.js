/* Overtone Service Worker
   目标：装成应用后即使断网也能打开界面（音乐本来就在本机），并且每次打开都尽量"秒开"。

   策略：应用外壳预缓存；页面导航走「缓存优先 + 后台静默更新」。

   为什么不用「网络优先」：那样每次浏览器 HTTP 缓存过期，打开时都要真的去远端取一次页面，
   而远端首字节时间实测能在 0.5~1.7 秒之间波动，于是表现为"有时还行、有时卡好几秒"。
   改成缓存优先后，页面立刻从本地 Cache Storage 返回（页内只需几十毫秒），
   新版在后台悄悄取回来写进缓存，下次打开生效 —— 代价是更新晚一次启动，
   换来的是打开耗时稳定、不再被网络拖着走。 */

const VERSION = 'overtone-v2';
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

/* 后台取最新版并写回缓存。
   用 cache:'no-cache' 强制做条件请求：内容没变服务端回 304（很便宜），
   变了就拿到新版 —— 这样更新能在一次启动内完成，而不用等 HTTP 缓存自然过期。
   任何失败都吞掉：绝不能影响已经返回给页面的缓存副本。 */
function refresh(request, cacheKey) {
  return fetch(request, { cache: 'no-cache' })
    .then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(VERSION);
        await cache.put(cacheKey, res.clone());
      }
      return res;
    })
    .catch(() => null);
}

function keepAlive(event, promise) {
  try { event.waitUntil(promise); } catch (e) { /* 保活失败不影响返回 */ }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 只接管同源资源

  // 页面导航：缓存优先 + 后台静默更新
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = (await cache.match(ENTRY)) || (await cache.match(req));
      if (hit) {
        keepAlive(event, refresh(req, ENTRY));   // 后台更新，不阻塞这次返回
        return hit;
      }
      // 首次访问（本地还没有外壳）：只能等网络
      const fresh = await refresh(req, ENTRY);
      return fresh || offlineResponse();
    })());
    return;
  }

  // 其余同源资源：同样缓存优先 + 后台静默更新
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      keepAlive(event, refresh(req, req));
      return hit;
    }
    const fresh = await refresh(req, req);
    return fresh || new Response('', { status: 504, statusText: 'offline' });
  })());
});
