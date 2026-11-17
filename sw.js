// Works without wifi. Every file is saved whole on the device in the background,
// later visits open straight from the saved copy, and the page itself is refreshed quietly for next time.
const PREFIX = 'fairuz-app-', V = PREFIX + 'v2', FONTS = 'fairuz-fonts-v1';
const SMALL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const BIG = [];
for (let n = 0; n < 12; n++) BIG.push('img/' + n + '.jpg', 'img/' + n + '-b.jpg');
BIG.push('song.mp3');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SMALL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// the page asks for this once it has shown: save the pictures and the song in the background
self.addEventListener('message', e => { if (e.data === 'fill') e.waitUntil(fillCache()); });

const abs = u => new URL(u, self.registration.scope).href;
const busy = new Map();
// one whole-file download per file, shared by everyone who asks for it
function whole(url) {
  url = abs(url);
  if (!busy.has(url)) {
    const p = caches.open(V).then(async c => {
      const hit = await c.match(url, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(url);
      if (res.status === 200) await c.put(url, res.clone());
      return res;
    });
    busy.set(url, p);
    p.then(() => busy.delete(url), () => busy.delete(url));
  }
  return busy.get(url).then(r => r.clone());
}
async function fillCache() {
  for (const f of BIG) { try { await whole(f); } catch (err) {} }
}
async function slice(res, range) {
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  if (!m) return res;
  const blob = await res.blob(), size = blob.size;
  const start = m[1] === '' ? Math.max(0, size - (+m[2])) : +m[1];
  const end = m[1] !== '' && m[2] !== '' ? Math.min(+m[2], size - 1) : size - 1;
  if (start >= size) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin && u.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    if (r.mode === 'navigate') {
      // open the saved page at once; fetch a fresh copy for next time
      e.respondWith(caches.open(V).then(async c => {
        const hit = await c.match(abs('./'));
        const net = fetch(r).then(res => { if (res.status === 200) c.put(abs('./'), res.clone()); return res; });
        if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
        return net;
      }));
    } else if (r.headers.has('range')) {
      // song: from the saved copy if it is there, otherwise stream it from the internet
      e.respondWith(caches.match(abs(u.pathname), { ignoreSearch: true })
        .then(hit => hit ? slice(hit, r.headers.get('range')) : fetch(r)));
    } else {
      e.respondWith(whole(r.url).catch(() => fetch(r)));
    }
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(r);
      if (hit) return hit;
      try { const res = await fetch(r); c.put(r, res.clone()); return res; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
  }
});
