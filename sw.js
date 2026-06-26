const CACHE_NAME = 'training-app-v10';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/util.js',
  './js/db.js',
  './js/hikes.js',
  './js/home.js',
  './js/import.js',
  './js/history.js',
  './js/videos.js',
  './js/settings.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll は1ファイルでも失敗するとインストール全体が失敗するため
      // 個別に add して失敗しても継続する
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] cache miss:', url, err);
          })
        )
      )
    )
  );
  // 古い SW を待たずに即座に有効化
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  // 既存のクライアントをすぐ掌握する
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 同一オリジンのナビゲーション（HTMLページ）はネットワーク優先
  // → 常に最新の index.html が取得され、JSの更新が即反映される
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // JS / CSS はネットワーク優先（失敗時はキャッシュ）
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // その他（アイコン・manifest等）はキャッシュ優先
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
