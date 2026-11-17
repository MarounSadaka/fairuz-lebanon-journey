// Offline app shell: the page (photos + song are inside it), icons and the Arabic fonts.
const C = 'fairuz-app-v1', F = 'fairuz-fonts-v1';
const CORE = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith('fairuz-app-') || k.startsWith('fairuz-fonts-')) && k !== C && k !== F).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    // show the saved copy at once, refresh it in the background for next time
    const key = r.mode === 'navigate' ? './' : r;
    e.respondWith(caches.open(C).then(async c => {
      const hit = await c.match(key, { ignoreSearch: true });
      const net = fetch(r).then(res => { if (res && res.ok) c.put(key, res.clone()); return res; }).catch(() => hit);
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(F).then(async c => {
      const hit = await c.match(r);
      if (hit) return hit;
      try { const res = await fetch(r); c.put(r, res.clone()); return res; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
  }
});
