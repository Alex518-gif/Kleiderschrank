// Offline-Fähigkeit: App-Dateien und das Freistell-Modell werden zwischengespeichert.
const VERSION = 'ks-v11';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'img.js', 'meta.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png', 'retro-leopard.svg', 'retro.css', 'leo.css', 'leopard-dunkel.svg'];
const RUNTIME_HOSTS = ['cdn.jsdelivr.net', 'staticimgly.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'ks-runtime').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bibliothek + Modell: einmal laden, danach aus dem Speicher
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open('ks-runtime').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Eigene Dateien: zuerst aus dem Netz (Updates kommen sofort an), offline aus dem Speicher
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        const hit = await c.match(req, { ignoreSearch: true });
        return hit || Response.error();
      }
    }));
  }
});
