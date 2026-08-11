import { reactive } from 'vue'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { isTransport } from '../utils/plan.js'
import { NOMINATIM_COUNTRY_FIX } from '../utils/countries.js'

const CACHE_KEY = 'trip-geo-cache'
const MIN_INTERVAL_MS   = 1100             // 全体で 1req/秒 を厳守
const BLOCK_COOLDOWN_MS = 5 * 60 * 1000    // ブロック検知時はこの間新規送信を止める

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ── モジュール全体で共有する送信制御（複数コンポーネント間でレートを共有）──
let _lastReqAt   = 0                  // 直近の送信時刻
let _pausedUntil = 0                  // これ以降まで新規送信を止める（ブロック時のバックオフ）
let _chain       = Promise.resolve() // 送信を直列化するチェーン
const _inflight  = new Map()          // name → Promise（同名の同時取得をまとめる）

// バックオフ中か（新規送信を控えるべきか）
function _isPaused() { return Date.now() < _pausedUntil }

// Nominatim へ 1 件問い合わせ（座標＋国名）。全体で直列化・1req/秒スロットル・ブロック時バックオフ。
function _geocodeOnce(name) {
  if (_inflight.has(name)) return _inflight.get(name)
  const prev = _chain
  let release
  _chain = new Promise(r => (release = r))
  const p = (async () => {
    try {
      await prev                              // 前の送信が終わるまで待つ（直列化）
      if (_isPaused()) return null            // バックオフ中は撃たない
      const wait = MIN_INTERVAL_MS - (Date.now() - _lastReqAt)
      if (wait > 0) await sleep(wait)
      _lastReqAt = Date.now()
      const url = 'https://nominatim.openstreetmap.org/search'
        + `?q=${encodeURIComponent(name)}&format=json&limit=1&addressdetails=1`
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      if (!res.ok) { _pausedUntil = Date.now() + BLOCK_COOLDOWN_MS; return null }
      const data = await res.json()
      if (!Array.isArray(data) || !data.length) return null
      const item = data[0]
      const rawCountry = item.address?.country ?? ''
      const country = NOMINATIM_COUNTRY_FIX[rawCountry] ?? rawCountry
      return { coords: [parseFloat(item.lon), parseFloat(item.lat)], country: country || undefined }
    } catch {
      // CORS/ネットワーク失敗＝ブロックの可能性 → バックオフして撃ちすぎを止める
      _pausedUntil = Date.now() + BLOCK_COOLDOWN_MS
      return null
    } finally {
      release()
      _inflight.delete(name)
    }
  })()
  _inflight.set(name, p)
  return p
}

/**
 * 都市名 → 座標のジオコーディングを扱う Composable。
 * - 座標は reactive な cityData に蓄積（localStorage + Firestore geodata + Nominatim）
 * - 未取得の都市のみ Nominatim で取得し、localStorage と Firestore にキャッシュ
 */
export function useGeocoding() {
  const _localCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  const cityData = reactive({ ..._localCache })

  // Nominatim で 1 都市の座標と国名を取得（送信制御は _geocodeOnce に集約）
  async function geocodeCity(name) {
    return _geocodeOnce(name)
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
    if (_isPaused()) return                    // バックオフ中は何もしない（撃ちすぎ防止）
    const updates = {}
    for (const name of names) {
      if (!name || cityData[name]) continue
      if (_isPaused()) break                   // 途中でブロック検知したら中断
      const result = await _geocodeOnce(name)
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

  // 1 都市の国名を確実に得る（座標のみキャッシュ済みでも国名を補完してキャッシュ更新）
  async function ensureCityCountry(name) {
    if (!name) return null
    if (cityData[name]?.country) return cityData[name].country
    if (_isPaused()) return null
    const result = await _geocodeOnce(name)
    if (!result) return null
    const merged = { ...(cityData[name] || {}), ...result }
    cityData[name] = merged
    _persistLocal({ [name]: merged })
    saveGeoToFirestore({ [name]: merged })
    return merged.country ?? null
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

  return { cityData, geocodeCity, ensureCityCountry, geocodeCityNames, geocodeSets, geocodePlans, mergeGeoData }
}
