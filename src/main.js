import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

// Service Worker 登録 & 更新通知
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})

  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'UPDATE_AVAILABLE') {
      window.dispatchEvent(new Event('app-update-available'))
    }
    if (e.data?.type === 'SW_UPDATED') {
      // SW 自体が更新されたときは即座にリロードして新バージョンを適用
      window.location.reload()
    }
  })
}

// SW に依存しない自前バージョンチェック
// ビルド時刻が変わっていれば新バージョンが配信されているので自動リロード
;(function startVersionWatch() {
  const myBuild = __APP_BUILD__
  async function check() {
    try {
      const r = await fetch('./version.json', { cache: 'no-store' })
      if (!r.ok) return
      const { v } = await r.json()
      if (v !== myBuild) window.location.reload()
    } catch { /* ネットワーク不可時は無視 */ }
  }
  setTimeout(check, 8000)
  setInterval(check, 60000)
})()
