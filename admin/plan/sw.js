/* pilotarbuza.com/admin/plan — service worker: уведомления и работа без сети.
   Страницы и скрипты берутся из сети, при обрыве — из кэша. Данные (/api/) не кэшируются. */
const CACHE = 'pa-plan-v1';
const SHELL = [
  '/admin/plan/', '/assets/style.css', '/assets/plan/plan.css', '/assets/plan/core.js', '/assets/plan/gantt.js',
  '/assets/plan/views.js', '/assets/plan/mobile.js', '/assets/plan/app.js', '/assets/plan/icons/icon-192.png', '/assets/favicon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (url.pathname.startsWith('/admin/plan/') || url.pathname.startsWith('/assets/'))) {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('/admin/plan/'))));
});

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'План', {
    body: m.body || '', tag: m.tag || 'plan', data: { url: m.url || '/admin/plan/#today' },
    icon: '/assets/plan/icons/icon-192.png', badge: '/assets/plan/icons/badge-96.png', lang: 'ru',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/admin/plan/#today', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(location.origin + '/admin/plan/'));
    if (w) return w.navigate(url).then(c => (c || w).focus()).catch(() => w.focus());
    return self.clients.openWindow(url);
  }));
});

// Служба push сменила адрес подписки — переподписаться и сообщить серверу (cookie входа живёт 30 дней).
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(fetch('/api/admin/push', { credentials: 'same-origin' }).then(r => r.json()).then(d => {
    const key = Uint8Array.from(atob(d.public_key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - d.public_key.length % 4) % 4)), c => c.charCodeAt(0));
    return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }).then(sub => fetch('/api/admin/push/subscribe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sub.toJSON(), ua: 'renewed' }) })).catch(() => {}));
});
