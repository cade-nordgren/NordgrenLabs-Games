// Dots and Boxes offline: precache the game, serve from the cache at once and refresh the copy in the background.
// Bump VERSION whenever FILES changes; old caches are deleted on activate.
const VERSION = 'dots-v7';
const FILES = [
  './', 'manifest.webmanifest',
  'ui/app.js', 'ui/board.js', 'ui/colors.js', 'ui/dice.js',
  'engine/boards.js', 'engine/reducer.js',
  '../style.css', '../platform.js', '../config.js',
  '/icons/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/apple-touch-icon.png',
];

// Cloudflare redirects /dots/index.html to /dots/, and Safari refuses to show a page from a service worker
// whose response is marked redirected. So the page is cached under the folder URL, and anything stored is a clean copy.
const clean = res => res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(async f => {
    const res = await fetch(f, { cache: 'reload' });
    if (!res.ok) throw new Error(`${f}: ${res.status}`);
    await c.put(f, clean(res));
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('dots-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const key = req.mode === 'navigate' ? self.registration.scope : req;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    // Only a real file goes in the cache: the Worker answers 401 with its sign-in page when the cookie is gone.
    const fresh = fetch(req).then(res => {
      if (res.ok) cache.put(key, clean(res.clone()));
      return res;
    });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return clean(hit); }
    return fresh;
  }));
});
