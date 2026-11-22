// DiceLanes offline: precache the game, serve from the cache at once and refresh the copy in the background.
// Bump VERSION whenever FILES changes; old caches are deleted on activate.
const VERSION = 'dicelanes-v5';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'ui/app.js', 'ui/dice.js',
  'engine/lanes.js', 'engine/moves.js', 'engine/reducer.js', 'engine/history.js',
  '../style.css', '../platform.js', '../config.js',
  '/icons/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('dicelanes-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : req;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    // Only a real file goes in the cache: the Worker answers 401 with its sign-in page when the cookie is gone.
    const fresh = fetch(req).then(res => {
      if (res.ok && !res.redirected) cache.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  }));
});
