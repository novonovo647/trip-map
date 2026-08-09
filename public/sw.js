// Service Worker: network-first（オンライン時は常に最新、オフライン時のみキャッシュ）
const CACHE = 'trip-v7'

self.addEventListener('install', e => {
  // no-store でキャッシュをバイパスして最新 HTML を取得
  e.waitUntil(caches.open(CACHE).then(c => c.add(new Request('./', { cache: 'no-store' }))))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // ナビゲーションリクエスト（HTMLページ）のみ処理
  if (e.request.mode !== 'navigate') return

  e.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      // オンライン時は常に最新の HTML を取得し、キャッシュも更新
      const fresh = await fetch(e.request, { cache: 'no-store' })
      if (fresh.ok) {
        await cache.put('./', fresh.clone())
        return fresh
      }
    } catch { /* オフライン時はキャッシュへフォールバック */ }
    return (await cache.match('./')) || fetch(e.request)
  })())
})
