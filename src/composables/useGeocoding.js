import { reactive } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { isTransport } from '../utils/plan.js'

const CACHE_KEY = 'trip-geo-cache'

// Nominatim 利用規約（最大 1req/秒）を守るための待機
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 都市名 → 座標のジオコーディングを扱う Composable。
 * - 座標は reactive な cityData に蓄積（localStorage + Firestore geodata + Nominatim）
 * - 未取得の都市のみ Nominatim で取得し、localStorage と Firestore にキャッシュ
 */
export function useGeocoding() {
  const _localCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  const cityData = reactive({ ..._localCache })

  // Nominatim で 1 都市の座標を取得
  async function geocodeCity(name) {
    try {
      const url = 'https://nominatim.openstreetmap.org/search'
        + `?q=${encodeURIComponent(name)}&format=json&limit=1&addressdetails=1`
      const res  = await fetch(url, { headers: { 'User-Agent': 'trip-map/1.0', 'Accept-Language': 'en' } })
      const data = await res.json()
      if (!data.length) return null
      const item = data[0]
      return { coords: [parseFloat(item.lon), parseFloat(item.lat)] }
    } catch {
      return null
    }
  }

  // 取得した座標を Firestore の geodata に保存
  async function saveGeoToFirestore(updates) {
    try {
      const ref = doc(db, 'tripdata', 'geodata')
      const snap = await getDoc(ref)
      const existing = snap.exists() ? (snap.data().cities ?? {}) : {}
      await setDoc(ref, { cities: { ...existing, ...updates } }, { merge: true })
    } catch { /* Firestore 保存失敗は無視 */ }
  }

  // localStorage キャッシュへ反映
  function _persistLocal(updates) {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    Object.assign(cache, updates)
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  }

  // 都市名の配列のうち未取得のものをジオコードし、cityData/localStorage/Firestore に反映
  async function geocodeCityNames(names) {
    const updates = {}
    let first = true
    for (const name of names) {
      if (!name || cityData[name]) continue
      // 2件目以降は 1req/秒 を守るため待機（Nominatim にブロックされないように）
      if (!first) await sleep(1100)
      first = false
      const result = await geocodeCity(name)
      if (result) {
        cityData[name] = result   // reactive → 依存する computed が自動再計算
        updates[name] = result
      }
    }
    if (Object.keys(updates).length > 0) {
      _persistLocal(updates)
      saveGeoToFirestore(updates)
    }
  }

  // プランセット配列全体の未取得都市をジオコード
  async function geocodeSets(sets) {
    const names = []
    for (const ps of sets) {
      for (const plan of ps.plans) {
        for (const c of plan.cities) {
          if (!isTransport(c)) names.push(c.name)
        }
      }
    }
    await geocodeCityNames(names)
  }

  // プラン配列の未取得都市をジオコード
  async function geocodePlans(plans) {
    const names = []
    for (const plan of plans) {
      for (const c of plan.cities) {
        if (!isTransport(c)) names.push(c.name)
      }
    }
    await geocodeCityNames(names)
  }

  // Firestore geodata から座標をマージ
  function mergeGeoData(cities) {
    for (const [name, val] of Object.entries(cities || {})) {
      cityData[name] = val
    }
  }

  return { cityData, geocodeCity, geocodeCityNames, geocodeSets, geocodePlans, mergeGeoData }
}
