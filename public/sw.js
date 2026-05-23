// Service Worker: stale-while-revalidate + 更新バナー通知
const CACHE = 'trip-v1'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add('./')))
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
    const cache  = await caches.open(CACHE)
    const cached = await cache.match('./')

    // バックグラウンドで最新版を確認し、差異があればキャッシュ更新＋クライアントへ通知
    ;(async () => {
      try {
        const fresh = await fetch(e.request, { cache: 'no-cache' })
        if (!fresh.ok) return

        const oldTag = cached?.headers.get('etag') || cached?.headers.get('last-modified')
        const newTag = fresh.headers.get('etag')   || fresh.headers.get('last-modified')

        if (!oldTag || (newTag && oldTag !== newTag)) {
          await cache.put('./', fresh)
          if (oldTag) {
            // 既存キャッシュと異なる → 更新通知
            const clients = await self.clients.matchAll({ type: 'window' })
            clients.forEach(c => c.postMessage({ type: 'UPDATE_AVAILABLE' }))
          }
        }
      } catch { /* ネットワーク不可時は無視 */ }
    })()

    return cached || fetch(e.request)
  })())
})
