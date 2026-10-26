/* pilotarbuza.com/me — service worker: уведомления и работа без сети.
   Страницы и скрипты берутся из сети, при обрыве — из кэша. Данные (/api/) не кэшируются. */
const CACHE = 'pa-me-v3';
const SHELL = [
  '/me/', '/assets/me/me.css', '/assets/me/world.js', '/assets/me/exif.js', '/assets/me/core.js', '/assets/me/notes.js',
  '/assets/me/countries.js', '/assets/me/docs.js', '/assets/me/money.js', '/assets/me/home.js', '/assets/me/app.js', '/assets/me/icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pa-me-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (url.pathname.startsWith('/me/') || url.pathname.startsWith('/assets/me/'))) {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('/me/'))));
});

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Личное', {
    body: m.body || '', tag: m.tag || 'me', data: { url: m.url || '/me/#home' },
    icon: '/assets/me/icons/icon-192.png', badge: '/assets/plan/icons/badge-96.png', lang: 'ru',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/me/#home', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(location.origin + '/me/')) || list[0];
    if (w) return w.navigate(url).then(c => (c || w).focus()).catch(() => w.focus());
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(fetch('/api/admin/push', { credentials: 'same-origin' }).then(r => r.json()).then(d => {
    const key = Uint8Array.from(atob(d.public_key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - d.public_key.length % 4) % 4)), c => c.charCodeAt(0));
    return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }).then(sub => fetch('/api/admin/push/subscribe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sub.toJSON(), ua: 'renewed · личное' }) })).catch(() => {}));
});
