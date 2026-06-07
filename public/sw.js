// Service Worker: stale-while-revalidate + 更新バナー通知
const CACHE = 'trip-v5'

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
      .then(async () => {
        // 旧 SW から新 SW へ更新されたとき、すべての開いているページを強制リロード
        // client.navigate() は SW 側から直接実行するため、古いページ JS に依存しない
        const all = await self.clients.matchAll({ type: 'window' })
        await Promise.all(all.map(c =>
          c.navigate(c.url).catch(() => c.postMessage({ type: 'SW_UPDATED' }))
        ))
      })
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

        const freshText  = await fresh.clone().text()
        const cachedText = cached ? await cached.clone().text() : ''

        if (freshText !== cachedText) {
          await cache.put('./', fresh)
          if (cachedText) {
            // HTML が変わった → キャッシュ更新後に全クライアントをリロード
            const clients = await self.clients.matchAll({ type: 'window' })
            await Promise.all(clients.map(c =>
              c.navigate(c.url).catch(() => c.postMessage({ type: 'UPDATE_AVAILABLE' }))
            ))
          }
        }
      } catch { /* ネットワーク不可時は無視 */ }
    })()

    return cached || fetch(e.request)
  })())
})
