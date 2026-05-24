<template>
  <div class="map-container">
    <!-- 更新バナー -->
    <div v-if="showUpdateBanner" class="update-banner">
      <span>🔄 新しいバージョンが利用可能です</span>
      <button class="update-btn" @click="reloadApp">再読み込み</button>
      <button class="update-dismiss" @click="showUpdateBanner = false">✕</button>
    </div>
    <!-- トップバー: タイトル（リセット） + バーガーメニュー -->
    <div class="top-bar">
      <h1 class="title-reset" @click="resetZoom" title="クリックでリセット">🌍 海外渡航マップ</h1>
      <div class="burger-wrap">
        <button class="burger-btn" @click.stop="burgerOpen = !burgerOpen">☰</button>
        <div v-if="burgerOpen" class="burger-menu">
          <p class="burger-hint">スクロール: 拡大・縮小　ドラッグ: 移動</p>
          <template v-if="currentUser">
            <span class="burger-user">👤 {{ currentUser.displayName }}</span>
            <button class="burger-gh-btn" @click="handleSignOut(); burgerOpen = false">ログアウト</button>
          </template>
          <button v-else class="burger-gh-btn" @click="signIn(); burgerOpen = false">🔐 Googleでログイン</button>
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">地図データ: Natural Earth</a>
          <a href="https://ja.wikipedia.org/wiki/ISO_3166-1" target="_blank" rel="noopener">国・地域コード: ISO 3166-1</a>
        </div>
      </div>
    </div>
    <!-- 統計: 渡航済み / 未渡航（クリックで一覧） -->
    <div class="stats">
      <span class="stat-visited" @click="listMode = 'visited'">渡航済み: <strong>{{ totalCount }}</strong></span>
      <span class="stat-sep">&nbsp;/&nbsp;</span>
      <span class="stat-unvisited" @click="listMode = 'unvisited'">未渡航: <strong class="total-features">{{ totalFeatures }}</strong></span>
      <span class="stat-unit">&nbsp;か国・地域</span>
    </div>
    <!-- プランDDリスト + コース表示 -->
    <div class="plan-bar">
      <div class="plan-select-row">
        <span class="plan-bar-label">コース:</span>
        <div class="plan-selector-wrap">
          <button class="plan-selector" @click.stop="dropdownOpen = !dropdownOpen">
            <span>{{ selectedSet !== null ? PLAN_SETS[selectedSet].setName : '選択' }}</span>
            <span class="selector-arrow">▾</span>
          </button>
          <div v-if="dropdownOpen" class="plan-dropdown">
            <div class="dropdown-item item-clear" @click="clearPlan">— 選択しない —</div>
            <div
              v-for="(s, si) in PLAN_SETS" :key="si"
              class="dropdown-item"
              :class="{ active: selectedSet === si }"
              @click="selectSetFromDD(si)"
            >{{ s.setName }}</div>
          </div>
        </div>
        <button v-if="selectedSet !== null" class="detail-btn" @click="modalSetIndex = selectedSet">詳細</button>
      </div>
      <!-- コース一覧（常時描画・高さ予約でマップが動かない） -->
      <div class="course-list">
        <template v-if="selectedSet !== null">
          <button
            v-for="(plan, j) in PLAN_SETS[selectedSet].plans" :key="j"
            class="plan-tab"
            :class="{ active: selectedPlan.has(j) }"
            :style="selectedPlan.has(j) ? { borderColor: plan.color, color: plan.color } : {}"
            @click="togglePlanTab(j)"
          >{{ plan.label }}{{ plan.nights ? `（${plan.nights}泊）` : '' }}</button>
        </template>
      </div>
    </div>
    <div ref="mapRef" class="svg-wrapper"></div>
    <div v-if="tooltip.visible" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      {{ tooltip.text }}
    </div>
    <!-- 都市ポップアップ (プラン選択中にマーカークリック) -->
    <Teleport to="body">
      <div v-if="cityPopup.visible" class="city-popup" :style="{ left: cityPopup.x + 'px', top: cityPopup.y + 'px' }" @click.stop>
        <div class="city-popup-header">
          <span class="city-popup-name">{{ cityPopup.name }}</span>
          <span v-if="cityPopup.nights" class="city-popup-nights">{{ cityPopup.nights }}泊</span>
          <button class="city-popup-close" @click="cityPopup.visible = false">✕</button>
        </div>
        <div v-if="cityPopup.memo" class="city-popup-memo" v-html="memoHtml(cityPopup.memo)"></div>
        <ul v-if="cityPopup.spots && cityPopup.spots.length" class="city-popup-spots">
          <li v-for="(spot, si) in cityPopup.spots" :key="si">
            <a v-if="spot.url" :href="spot.url" target="_blank" rel="noopener">{{ spot.name }}</a>
            <span v-else>{{ spot.name }}</span>
            <span v-if="spot.memo" class="city-popup-spot-memo" v-html="memoHtml(spot.memo)"></span>
          </li>
        </ul>
        <p v-if="!cityPopup.memo && (!cityPopup.spots || !cityPopup.spots.length)" class="city-popup-empty">詳細情報なし</p>
      </div>
    </Teleport>
    <!-- 移動ポップアップ (アーククリック) -->
    <Teleport to="body">
      <div v-if="legPopup.visible" class="city-popup leg-popup" :style="{ left: legPopup.x + 'px', top: legPopup.y + 'px' }" @click.stop>
        <div class="city-popup-header">
          <span class="city-popup-name leg-popup-route">{{ legPopup.from }} → {{ legPopup.to }}</span>
          <button class="city-popup-close" @click="legPopup.visible = false">✕</button>
        </div>
        <div v-if="legPopup.transport" class="leg-popup-transport">
          <a v-if="legPopup.url" :href="legPopup.url" target="_blank" rel="noopener" class="leg-popup-link">{{ legPopup.transport }}</a>
          <span v-else>{{ legPopup.transport }}</span>
        </div>
        <div v-if="legPopup.memo" class="city-popup-memo" v-html="memoHtml(legPopup.memo)"></div>
        <p v-if="!legPopup.transport && !legPopup.memo" class="city-popup-empty">移動情報なし</p>
      </div>
    </Teleport>
    <!-- 国一覧モーダル -->
    <Teleport to="body">
      <div v-if="listMode" class="list-overlay" @click.self="listMode = null; countryEditMode = false">
        <div class="list-panel">
          <div class="list-header">
            <h2>
              {{ listMode === 'visited' ? '渡航済み国・地域一覧' : '未渡航国・地域一覧' }}
              <span v-if="countryEditMode" class="edit-diff-count">
                <template v-if="countryEditAdded > 0">+{{ countryEditAdded }}</template>
                <template v-if="countryEditRemoved > 0"> −{{ countryEditRemoved }}</template>
              </span>
            </h2>
            <div class="list-header-actions">
              <button v-if="currentUser && !countryEditMode" class="edit-mode-btn" @click="enterCountryEditMode">✏ 編集</button>
              <button v-if="countryEditMode" class="gh-save-btn" :disabled="countryEditSaving" @click="saveCountryList">{{ countryEditSaving ? '保存中…' : '💾 保存' }}</button>
              <button v-if="countryEditMode" class="cancel-edit-btn" @click="countryEditMode = false">キャンセル</button>
              <button class="close-btn" @click="listMode = null; countryEditMode = false">✕</button>
            </div>
          </div>
          <div v-if="countryEditMode && countryEditError" class="edit-error">{{ countryEditError }}</div>
          <div class="list-body">
            <template v-for="region in REGION_ORDER" :key="region">
              <div v-if="groupedList[region]" class="region-section">
                <h3>{{ region }} <span class="region-count">({{ groupedList[region].length }})</span></h3>
                <ul>
                  <li v-for="c in groupedList[region]" :key="c.en"
                    :class="{ 'strikethrough-item': c.strikethrough, 'edit-item-new': countryEditMode && listMode === 'unvisited' && countryEditSet.has(c.en) }">
                    <span>{{ c.ja }}</span>
                    <button v-if="countryEditMode && listMode === 'visited'" class="toggle-remove-btn" @click.stop="toggleCountryEdit(c.en, c.ja)" title="渡航済みから削除">✕</button>
                    <button v-if="countryEditMode && listMode === 'unvisited'" class="toggle-add-btn" :class="{ active: countryEditSet.has(c.en) }" @click.stop="toggleCountryEdit(c.en, c.ja)" :title="countryEditSet.has(c.en) ? '追加を取り消す' : '渡航済みに追加'">{{ countryEditSet.has(c.en) ? '✓' : '+' }}</button>
                  </li>
                </ul>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- プラン UI エディタ -->
    <Teleport to="body">
      <PlanEditor
        v-if="showPlanEditor"
        :initialData="PLAN_SETS"
        :saving="planUISaving"
        :error="planUIError"
        @save="handlePlanEditorSave"
        @cancel="showPlanEditor = false"
      />
    </Teleport>

    <!-- セット詳細モーダル -->
    <Teleport to="body">
      <div v-if="modalSetIndex !== null" class="list-overlay" @click.self="modalSetIndex = null">
        <div class="list-panel set-detail-panel">
          <div class="list-header">
            <h2>{{ PLAN_SETS[modalSetIndex].setName }}</h2>
            <div class="list-header-actions">
              <button v-if="currentUser" class="edit-mode-btn" @click="openPlanEditor">✏ 編集</button>
              <button class="close-btn" @click="modalSetIndex = null">✕</button>
            </div>
          </div>
          <div class="set-detail-body">
            <div v-for="(plan, j) in PLAN_SETS[modalSetIndex].plans.map(p => resolvePlan(p))" :key="j" class="plan-detail" :style="{ borderLeftColor: plan.color }">
              <h3 class="plan-detail-toggle" :style="{ color: plan.color }" @click="togglePlan(j)">
                <span class="plan-toggle-icon">{{ openPlans[j] ? '▾' : '▸' }}</span>
                {{ plan.label }}{{ plan.nights ? `（${plan.nights}泊）` : '' }}
              </h3>
              <div v-show="openPlans[j]">
                <!-- タイムライン: 都市 / 移動エントリー混在 -->
                <div class="city-stops">
                  <template v-for="(item, k) in plan.cities" :key="k">
                    <!-- 移動エントリー -->
                    <div v-if="item._type === 'transport'" class="stop-leg">
                      <span class="stop-leg-arrow">↓</span>
                      <a v-if="item.url" :href="item.url" target="_blank" rel="noopener" class="stop-leg-link">{{ item.transport }}</a>
                      <span v-else-if="item.transport" class="stop-leg-text">{{ item.transport }}</span>
                      <span v-if="item.memo" class="stop-memo" v-html="memoHtml(item.memo)"></span>
                    </div>
                    <!-- 都市エントリー（直前が都市なら矢印を補完） -->
                    <template v-else>
                      <div v-if="k > 0 && plan.cities[k-1]._type === 'city'" class="stop-leg">
                        <span class="stop-leg-arrow">↓</span>
                      </div>
                      <div class="city-stop">
                        <div class="stop-header">
                          <span class="stop-name">{{ item.name }}</span>
                          <span v-if="item.nights" class="stop-nights">{{ item.nights }}泊</span>
                          <span v-if="item.memo" class="stop-memo" v-html="memoHtml(item.memo)"></span>
                        </div>
                        <ul v-if="item.spots && item.spots.length" class="stop-spots">
                          <li v-for="(spot, si) in item.spots" :key="si">
                            <a v-if="spot.url" :href="spot.url" target="_blank" rel="noopener">{{ spot.name }}</a>
                            <span v-else>{{ spot.name }}</span>
                            <span v-if="spot.memo" class="spot-memo spot-memo-block" v-html="memoHtml(spot.memo)"></span>
                          </li>
                        </ul>
                      </div>
                    </template>
                  </template>
                </div>
                <div class="plan-countries">{{ plan.countries.map(c => getJaName(c)).join('・') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ドロップダウン外クリックで閉じる -->
    <Teleport to="body">
      <div v-if="dropdownOpen || burgerOpen" class="click-outside" @click="dropdownOpen = false; burgerOpen = false"></div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../firebase.js'
import PlanEditor from './PlanEditor.vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as topojson from 'topojson-client'
import rewind from 'geojson-rewind'
import Papa from 'papaparse'
import csvRaw from '../data/country_list.csv?raw'
import worldData from '../assets/countries-10m.json'
import countryNamesJa from '../assets/country_names_ja.json'
import countryRegions from '../assets/country_regions.json'
import planSetsStatic from '../data/plan_sets.json'
import CITIES_MASTER from '../assets/cities_master.json'

// Nominatim 国名 → Natural Earth 国名 補正テーブル
const COUNTRY_NAME_FIX = {
  'Türkiye':                              'Turkey',
  'United States':                         'United States of America',
  'Republic of Korea':                     'South Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'Czech Republic':                        'Czechia',
  'Russian Federation':                    'Russia',
  'Islamic Republic of Iran':              'Iran',
  'Syrian Arab Republic':                  'Syria',
  "Lao People's Democratic Republic":      'Laos',
  'Viet Nam':                              'Vietnam',
  'United Republic of Tanzania':           'Tanzania',
  'Republic of Moldova':                   'Moldova',
  'Republic of North Macedonia':           'Macedonia',
  'Collectivity of Saint Martin':          'France',
  'French Polynesia':                      'French Polynesia',
}

// 都市データ: マスター + ランタイム取得キャッシュ (localStorage)
const _localCache = JSON.parse(localStorage.getItem('trip-geo-cache') || '{}')
const cityData = reactive({ ...CITIES_MASTER, ..._localCache })

async function geocodeCity(name) {
  try {
    const url = 'https://nominatim.openstreetmap.org/search'
      + `?q=${encodeURIComponent(name)}&format=json&limit=1&addressdetails=1`
    const res  = await fetch(url, { headers: { 'User-Agent': 'trip-map/1.0' } })
    const data = await res.json()
    if (!data.length) return null
    const item = data[0]
    const rawCountry = item.address?.country ?? ''
    return {
      coords:  [parseFloat(item.lon), parseFloat(item.lat)],
      country: COUNTRY_NAME_FIX[rawCountry] ?? rawCountry,
    }
  } catch {
    return null
  }
}

// plan_sets.json はリアクティブ ref（起動時に GitHub から最新版を取得して上書き）
const PLAN_SETS = ref(planSetsStatic)

const mapRef = ref(null)
let visitedSet = new Set()   // Vue reactivity 不要：D3コールバック内で直接参照
let jaMapData = {}           // Vue reactivity 不要
const allFeatureNames = ref([])  // drawMap() 後に全フィーチャー名を格納
const totalCount = ref(0)    // 英語名なし含む全件数（テンプレートで表示）
const totalFeatures = ref(0) // 地図上の総国・地域数（drawMap後に確定）
const tooltip = ref({ visible: false, x: 0, y: 0, text: '' })
const cityPopup = reactive({ visible: false, x: 0, y: 0, name: '', nights: null, memo: null, spots: [] })
const legPopup  = reactive({ visible: false, x: 0, y: 0, from: '', to: '', transport: null, url: null, memo: null })
const listMode = ref(null)   // null | 'visited' | 'unvisited'
const selectedSet   = ref(null) // null | セットindex
const selectedPlan  = ref(new Set()) // Set<number> 選択中のプランindex（セット内）
const modalSetIndex = ref(null) // null | セット詳細モーダルのindex
const burgerOpen    = ref(false)
const dropdownOpen  = ref(false)
let mapInstance = null
let mapReady = false
let countriesGeoJSON = null

function memoHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/¥n|\\n|\n/g, '<br>')
}

function resolvePlan(plan) {
  if (!plan) return null
  const items = plan.cities
    .map(c => {
      if (c.name === undefined) {
        // 移動エントリー（transport のみ）
        return { _type: 'transport', transport: c.transport ?? null, url: c.url ?? null, memo: c.memo ?? null }
      }
      const coords = cityData[c.name]?.coords ?? null
      if (!coords) return null
      return {
        _type: 'city',
        name:   c.name,
        coords,
        nights: c.nights ?? null,
        memo:   c.memo   ?? null,
        spots:  c.spots  ?? [],
      }
    })
    .filter(Boolean)
  const countries = [...new Set(
    items
      .filter(i => i._type === 'city')
      .map(i => cityData[i.name]?.country)
      .filter(Boolean)
  )]
  return { ...plan, cities: items, countries }
}

// 選択中の全プランを解決した配列
const activePlans = computed(() => {
  if (selectedSet.value === null || selectedPlan.value.size === 0) return []
  return [...selectedPlan.value]
    .sort()
    .map(pi => resolvePlan(PLAN_SETS.value[selectedSet.value]?.plans[pi] ?? null))
    .filter(Boolean)
})

// 選択プランが変わったとき、未知の都市を Nominatim で自動取得
watch([selectedSet, selectedPlan], async ([si, planSet]) => {
  if (si === null || planSet.size === 0) return
  for (const pi of planSet) {
    const plan = PLAN_SETS.value[si]?.plans[pi]
    if (!plan) continue
    const missing = plan.cities
      .filter(c => c.name !== undefined)
      .map(c => c.name)
      .filter(name => !cityData[name])
    for (const name of missing) {
      const result = await geocodeCity(name)
      if (result) {
        cityData[name] = result  // reactive → activePlans が自動再計算される
        const cache = JSON.parse(localStorage.getItem('trip-geo-cache') || '{}')
        cache[name] = result
        localStorage.setItem('trip-geo-cache', JSON.stringify(cache))
      }
    }
  }
})

const REGION_ORDER = [
  '東アジア', '東南アジア', '南アジア', '中央アジア',
  '中東・西アジア', 'ヨーロッパ', 'アフリカ',
  '北米・中米', 'カリブ海', '南アメリカ', 'オセアニア', 'その他'
]

const groupedList = computed(() => {
  if (!listMode.value || allFeatureNames.value.length === 0) return {}
  visitedVersion.value   // 保存後の強制再計算
  const inEdit = countryEditMode.value
  const editSet = countryEditSet.value
  const result = {}
  for (const name of allFeatureNames.value) {
    if (!name) continue
    const isV = inEdit ? editSet.has(name) : isVisited(name)
    if (listMode.value === 'visited'   &&  !isV) continue
    if (listMode.value === 'unvisited' &&   isV) continue
    if (listMode.value === 'unvisited' && name === 'Japan') continue
    const region = countryRegions[name] || 'その他'
    if (!result[region]) result[region] = []
    result[region].push({ en: name, ja: getJaName(name), strikethrough: STRIKETHROUGH_NAMES.has(name) })
  }
  for (const arr of Object.values(result)) {
    arr.sort((a, b) => a.ja.localeCompare(b.ja, 'ja'))
  }
  return result
})

// 渡航困難国（取り消し線表示）
const STRIKETHROUGH_NAMES = new Set([
  'Iran', 'Iraq', 'North Korea', 'Syria', 'Sudan', 'Libya', 'Somalia', 'Yemen', 'Cuba',
])

// CSV英語名 → 10mデータのproperties.name への変換（差異のある分のみ）
const NAME_MAP = {
  'United States': 'United States of America',
  'Czech Republic': 'Czechia',
  'FYR Macedonia': 'Macedonia',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Cook Islands': 'Cook Is.',
  'Slovak Republic': 'Slovakia',
}

function isVisited(propName) {
  if (!propName) return false
  if (visitedSet.has(propName)) return true
  for (const [csvName, mappedName] of Object.entries(NAME_MAP)) {
    if (mappedName === propName && visitedSet.has(csvName)) return true
  }
  return false
}

// 国のベース塗り色（プランまたは渡航済み/未渡航）
function getCountryFill(propName) {
  if (!propName) return '#4a7a9b'
  for (const plan of activePlans.value) {
    if (plan.countries.includes(propName)) return plan.color
  }
  return isVisited(propName) ? '#e63946' : '#4a7a9b'
}

// 国のホバー色
function getCountryHover(propName) {
  if (!propName) return '#6a9ab8'
  for (const plan of activePlans.value) {
    if (plan.countries.includes(propName)) return plan.color + 'cc'
  }
  return isVisited(propName) ? '#ff6b6b' : '#6a9ab8'
}

function getJaName(propName) {
  if (!propName) return '不明'
  if (jaMapData[propName]) return jaMapData[propName]
  for (const [csvName, mappedName] of Object.entries(NAME_MAP)) {
    if (mappedName === propName && jaMapData[csvName]) return jaMapData[csvName]
  }
  return countryNamesJa[propName] || propName
}

// CSVで英語名が空欄の地域の補完マッピング
const MISSING_EN_MAP = {
  'ニューカレドニア': 'New Caledonia',
  'ジプラルタル': 'Gibraltar',
  'スコットランド': 'Scotland',
}

function loadCSV(text = csvRaw) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true })
  result.data.forEach(row => {
    const ja = row['名称']?.trim()
    let en = row['英語名称']?.trim()
    // 英語名が空の場合は補完マッピングを使用
    if (!en && ja && MISSING_EN_MAP[ja]) en = MISSING_EN_MAP[ja]
    if (ja || en) totalCount.value++
    if (en) {
      visitedSet.add(en)
      if (ja) jaMapData[en] = ja
    }
  })
}

// 大圏弧の座標列を計算（球面線形補間）
function geodesicPoints(from, to, n = 60) {
  const toRad = d => d * Math.PI / 180
  const toDeg = r => r * 180 / Math.PI
  const [lon1, lat1] = from.map(toRad)
  const [lon2, lat2] = to.map(toRad)
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ))
  if (d < 0.001) return [[toDeg(lat1), toDeg(lon1)], [toDeg(lat2), toDeg(lon2)]]
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const A = Math.sin((1 - t) * d) / Math.sin(d)
    const B = Math.sin(t * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))])
  }
  return pts
}

// 日付変更線をまたぐ経度ジャンプを除去（Leaflet 用）
function unwrapLongitudes(pts) {
  const result = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prevLng = result[i - 1][1]
    let lng = pts[i][1]
    while (lng - prevLng > 180) lng -= 360
    while (lng - prevLng < -180) lng += 360
    result.push([pts[i][0], lng])
  }
  return result
}

// GeoJSON リングの日付変更線ジャンプを除去（MapLibre でも必要）
function wrapGeoJSONRing(ring) {
  if (!ring || ring.length === 0) return ring
  const result = [[...ring[0]]]
  for (let i = 1; i < ring.length; i++) {
    const prev = result[i - 1][0]
    let lng = ring[i][0]
    while (lng - prev > 180) lng -= 360
    while (lng - prev < -180) lng += 360
    result.push([lng, ring[i][1]])
  }
  return result
}

function wrapGeoJSONGeometry(geometry) {
  if (!geometry) return geometry
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(wrapGeoJSONRing) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(poly => poly.map(wrapGeoJSONRing)) }
  }
  return geometry
}

function wrapAntimeridian(fc) {
  return { ...fc, features: fc.features.map(f => ({ ...f, geometry: wrapGeoJSONGeometry(f.geometry) })) }
}

// 国ごとの塗り色プロパティを付与した GeoJSON を生成
function buildCountriesData() {
  if (!countriesGeoJSON) return { type: 'FeatureCollection', features: [] }
  return {
    ...countriesGeoJSON,
    features: countriesGeoJSON.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        fillColor: getCountryFill(f.properties?.name || ''),
      },
    })),
  }
}

function resetZoom() {
  mapInstance?.easeTo({ center: [135, 35], zoom: 1.5 })
}

async function drawMap() {
  const world = worldData
  const countries = wrapAntimeridian(rewind(topojson.feature(world, world.objects.countries), false))

  // France の海外領土を本土から分離して個別フィーチャーとして描画
  // （フランス領ギアナ・マルティニーク・グアドループ・レユニオン・マヨット）
  const franceIdx = countries.features.findIndex(f => f.properties?.name === 'France')
  if (franceIdx !== -1) {
    const france = countries.features[franceIdx]
    if (france.geometry?.type === 'MultiPolygon') {
      const buckets = { 'Fr. Guiana': [], 'Martinique': [], 'Guadeloupe': [], 'Réunion': [], 'Mayotte': [], _france: [] }
      france.geometry.coordinates.forEach(poly => {
        const lons = poly[0].map(c => c[0])
        const lats = poly[0].map(c => c[1])
        const lonMin = Math.min(...lons), latMax = Math.max(...lats)
        if (lonMin < -50 && latMax < 10)           buckets['Fr. Guiana'].push(poly)
        else if (lonMin < -40 && latMax < 15.5)    buckets['Martinique'].push(poly)
        else if (lonMin < -40 && latMax < 20)      buckets['Guadeloupe'].push(poly)
        else if (lonMin > 50  && latMax < 0)       buckets['Réunion'].push(poly)
        else if (lonMin > 40  && latMax < 0)       buckets['Mayotte'].push(poly)
        else                                        buckets._france.push(poly)
      })
      france.geometry.coordinates = buckets._france
      Object.entries(buckets).forEach(([name, polys]) => {
        if (name !== '_france' && polys.length > 0) {
          countries.features.push({ type: 'Feature', properties: { name }, geometry: { type: 'MultiPolygon', coordinates: polys } })
        }
      })
    }
  }

  // 全フィーチャー名を保存（国一覧モーダル用）
  allFeatureNames.value = countries.features.map(f => f.properties?.name).filter(Boolean)
  totalFeatures.value = allFeatureNames.value.length

  // 既存マップを破棄してから再生成
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    mapReady = false
  }

  countriesGeoJSON = countries

  await new Promise((resolve) => {
    mapInstance = new maplibregl.Map({
      container: mapRef.value,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0d1b2a' } }],
      },
      center: [135, 35],
      zoom: 1.5,
      minZoom: 0.5,
      maxZoom: 12,
      renderWorldCopies: true,
      attributionControl: false,
    })

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    mapInstance.on('load', () => {
      // 国塗り分けソース + レイヤー（renderWorldCopies で自動3コピー）
      mapInstance.addSource('countries', {
        type: 'geojson',
        data: buildCountriesData(),
      })
      mapInstance.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': 0.85,
        },
      })
      // ホバーハイライト用レイヤー（フィルターで制御）
      mapInstance.addLayer({
        id: 'countries-fill-hover',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': 0.97,
        },
        filter: ['==', ['get', 'name'], ''],
      })
      mapInstance.addLayer({
        id: 'countries-line',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': '#1a2d40',
          'line-width': 0.5,
        },
      })

      // アークソース + レイヤー
      mapInstance.addSource('arcs', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      mapInstance.addLayer({
        id: 'arc-lines',
        type: 'line',
        source: 'arcs',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.85,
          'line-dasharray': [6, 3],
        },
      })

      // 都市マーカーソース + レイヤー
      mapInstance.addSource('city-markers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      mapInstance.addLayer({
        id: 'city-circles',
        type: 'circle',
        source: 'city-markers',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      })
      mapInstance.addLayer({
        id: 'city-labels',
        type: 'symbol',
        source: 'city-markers',
        layout: {
          'text-field': ['get', 'cityName'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-anchor': 'left',
          'text-offset': [0.7, 0],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
        },
      })

      // 国ホバー: ハイライトレイヤーのフィルターを切り替え
      mapInstance.on('mousemove', 'countries-fill', (e) => {
        const propName = e.features[0]?.properties?.name || ''
        mapInstance.setFilter('countries-fill-hover', ['==', ['get', 'name'], propName])
        const rect = mapRef.value.getBoundingClientRect()
        tooltip.value = {
          visible: true,
          x: rect.left + e.point.x + 12,
          y: rect.top + e.point.y - 28,
          text: `${getJaName(propName)}${isVisited(propName) ? ' ✓ 渡航済み' : ''}`,
        }
      })
      mapInstance.on('mouseleave', 'countries-fill', () => {
        mapInstance.setFilter('countries-fill-hover', ['==', ['get', 'name'], ''])
        tooltip.value.visible = false
      })

      // アーククリック
      mapInstance.on('click', 'arc-lines', (e) => {
        const props = e.features[0].properties
        const rect = mapRef.value.getBoundingClientRect()
        cityPopup.visible = false
        legPopup.visible   = true
        legPopup.x         = rect.left + e.point.x + 14
        legPopup.y         = rect.top  + e.point.y - 10
        legPopup.from      = props.from
        legPopup.to        = props.to
        legPopup.transport = props.transport || null
        legPopup.url       = props.url       || null
        legPopup.memo      = props.memo      || null
      })

      // 都市マーカークリック
      mapInstance.on('click', 'city-circles', (e) => {
        const props = e.features[0].properties
        const rect = mapRef.value.getBoundingClientRect()
        legPopup.visible  = false
        cityPopup.visible = true
        cityPopup.x       = rect.left + e.point.x + 14
        cityPopup.y       = rect.top  + e.point.y - 10
        cityPopup.name    = props.cityName
        cityPopup.nights  = props.nights || null
        cityPopup.memo    = props.memo   || null
        cityPopup.spots   = JSON.parse(props.spots || '[]')
      })

      // マップ背景クリックでポップアップを閉じる
      mapInstance.on('click', (e) => {
        const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['city-circles', 'arc-lines'] })
        if (features.length === 0) {
          cityPopup.visible = false
          legPopup.visible  = false
        }
      })

      mapInstance.on('mouseenter', 'city-circles', () => { mapInstance.getCanvas().style.cursor = 'pointer' })
      mapInstance.on('mouseleave', 'city-circles', () => { mapInstance.getCanvas().style.cursor = '' })
      mapInstance.on('mouseenter', 'arc-lines',    () => { mapInstance.getCanvas().style.cursor = 'pointer' })
      mapInstance.on('mouseleave', 'arc-lines',    () => { mapInstance.getCanvas().style.cursor = '' })

      mapReady = true
      if (activePlans.value.length > 0) updatePlanOverlay()
      resolve()
    })
  })
}

// プランオーバーレイ（アーク + 都市マーカー）の更新
function updatePlanOverlay() {
  if (!mapInstance || !mapReady) return

  cityPopup.visible = false

  // 国の色を更新
  mapInstance.getSource('countries')?.setData(buildCountriesData())

  // アーク・マーカー GeoJSON を再構築してソースを更新
  const arcFeatures    = []
  const markerFeatures = []
  for (const plan of activePlans.value) {
    buildPlanFeatures(plan, arcFeatures, markerFeatures)
  }
  mapInstance.getSource('arcs')?.setData({ type: 'FeatureCollection', features: arcFeatures })
  mapInstance.getSource('city-markers')?.setData({ type: 'FeatureCollection', features: markerFeatures })
}

// 1プラン分のアーク・マーカーを GeoJSON フィーチャーとして構築
function buildPlanFeatures(plan, arcFeatures, markerFeatures) {
  // 各区間の移動情報ルックアップ
  const arcTransports = []
  {
    let cityIdx = -1
    let lastTransport = null
    for (const item of plan.cities) {
      if (item._type === 'transport') {
        lastTransport = item
      } else if (item._type === 'city') {
        if (cityIdx >= 0) {
          arcTransports.push(lastTransport)
          lastTransport = null
        }
        cityIdx++
      }
    }
  }

  const cities = plan.cities.filter(i => i._type === 'city')

  // アーク GeoJSON（renderWorldCopies で自動3コピー）
  for (let i = 0; i < cities.length - 1; i++) {
    const from = cities[i].coords       // [lng, lat]
    const to   = cities[i + 1].coords
    const t    = arcTransports[i] ?? null

    const pts    = unwrapLongitudes(geodesicPoints(from, to))
    const coords = pts.map(([lat, lng]) => [lng, lat])   // GeoJSON は [lng, lat]

    arcFeatures.push({
      type: 'Feature',
      properties: {
        color:     plan.color,
        from:      cities[i].name,
        to:        cities[i + 1].name,
        transport: t?.transport ?? null,
        url:       t?.url       ?? null,
        memo:      t?.memo      ?? null,
      },
      geometry: { type: 'LineString', coordinates: coords },
    })
  }

  // 都市マーカー GeoJSON（renderWorldCopies で自動3コピー）
  const seen = new Set()
  for (const city of cities) {
    const key = city.coords.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    markerFeatures.push({
      type: 'Feature',
      properties: {
        color:    plan.color,
        cityName: city.name,
        nights:   city.nights ?? null,
        memo:     city.memo   ?? null,
        spots:    JSON.stringify(city.spots || []),
      },
      geometry: { type: 'Point', coordinates: city.coords },  // [lng, lat]
    })
  }
}

function selectSetFromDD(si) {
  selectedSet.value = si
  selectedPlan.value = new Set()
  dropdownOpen.value = false
}

function selectSet(i) {
  selectedSet.value = selectedSet.value === i ? null : i
  selectedPlan.value = new Set()
}

function togglePlanTab(j) {
  const next = new Set(selectedPlan.value)
  if (next.has(j)) next.delete(j)
  else next.add(j)
  selectedPlan.value = next
}

function clearPlan() {
  selectedSet.value = null
  selectedPlan.value = new Set()
  dropdownOpen.value = false
}

const openPlans = ref([])

watch(modalSetIndex, (val) => {
  if (val !== null) openPlans.value = PLAN_SETS.value[val].plans.map(() => true)
})

function togglePlan(j) {
  openPlans.value[j] = !openPlans.value[j]
}

const showUpdateBanner = ref(false)

function reloadApp() { window.location.reload() }

function onUpdateAvailable() { showUpdateBanner.value = true }

// ─── 認証 ────────────────────────────────────────────
const currentUser = ref(null)

async function signIn() {
  await signInWithPopup(auth, new GoogleAuthProvider())
}

async function handleSignOut() {
  await fbSignOut(auth)
}

// ─── 渡航済み国 編集 ────────────────────────────────────────
const visitedVersion    = ref(0)     // groupedList の強制再計算トリガー
const countryEditMode   = ref(false)
const countryEditSet    = ref(new Set())
const countryEditOrig   = ref(new Set())
const countryEditSaving = ref(false)
const countryEditError  = ref('')

const countryEditAdded   = computed(() => { let n = 0; for (const en of countryEditSet.value) { if (!countryEditOrig.value.has(en)) n++ }; return n })
const countryEditRemoved = computed(() => { let n = 0; for (const en of countryEditOrig.value) { if (!countryEditSet.value.has(en)) n++ }; return n })

function enterCountryEditMode() {
  countryEditSet.value  = new Set(visitedSet)
  countryEditOrig.value = new Set(visitedSet)
  countryEditError.value = ''
  countryEditMode.value  = true
}

function toggleCountryEdit(enName, jaName) {
  const next = new Set(countryEditSet.value)
  if (next.has(enName)) { next.delete(enName) }
  else { next.add(enName); if (jaName && !jaMapData[enName]) jaMapData[enName] = jaName }
  countryEditSet.value = next
}

async function saveCountryList() {
  countryEditSaving.value = true
  countryEditError.value  = ''
  try {
    const lines = ['名称,英語名称']
    for (const en of [...countryEditSet.value].sort()) {
      const ja = jaMapData[en] || countryNamesJa[en] || en
      lines.push(`${ja},${en}`)
    }
    const csv = lines.join('\n') + '\n'
    await setDoc(doc(db, 'tripdata', 'countries'), { csv })
    // in-memory 更新
    visitedSet = new Set(countryEditSet.value)
    totalCount.value = visitedSet.size
    visitedVersion.value++
    mapInstance?.getSource('countries')?.setData(buildCountriesData())
    countryEditMode.value  = false
    countryEditOrig.value  = new Set(visitedSet)
  } catch (e) {
    countryEditError.value = e.message
  } finally {
    countryEditSaving.value = false
  }
}

// ─── プラン UI 編集 ─────────────────────────────────────────
const showPlanEditor  = ref(false)
const planUISaving    = ref(false)
const planUIError     = ref('')

function openPlanEditor() {
  planUIError.value   = ''
  modalSetIndex.value = null
  showPlanEditor.value = true
}

async function handlePlanEditorSave(newData) {
  planUISaving.value = true
  planUIError.value  = ''
  try {
    await setDoc(doc(db, 'tripdata', 'plans'), { sets: newData })
    // onSnapshot が自動的に PLAN_SETS を更新する
    showPlanEditor.value = false
  } catch (e) {
    planUIError.value = e.message
  } finally {
    planUISaving.value = false
  }
}

// ── Firestore リアルタイムリスナー ──────────────────────────
let unsubPlans     = null
let unsubCountries = null
let unsubAuth      = null

function startFirestoreListeners() {
  // プランデータ
  unsubPlans = onSnapshot(doc(db, 'tripdata', 'plans'), async (snap) => {
    if (snap.exists()) {
      if (!showPlanEditor.value) PLAN_SETS.value = snap.data().sets
    } else {
      // 初回: 静的データでシード
      await setDoc(doc(db, 'tripdata', 'plans'), { sets: planSetsStatic })
    }
  })
  // 渡航済み国データ
  unsubCountries = onSnapshot(doc(db, 'tripdata', 'countries'), async (snap) => {
    if (snap.exists()) {
      if (!countryEditMode.value) {
        visitedSet       = new Set()
        jaMapData        = {}
        totalCount.value = 0
        loadCSV(snap.data().csv)
        visitedVersion.value++
        if (mapReady) mapInstance?.getSource('countries')?.setData(buildCountriesData())
      }
    } else {
      // 初回: 静的データでシード
      await setDoc(doc(db, 'tripdata', 'countries'), { csv: csvRaw })
    }
  })
}

watch(activePlans, () => updatePlanOverlay())

onMounted(async () => {
  loadCSV()          // 静的インポートで即時表示
  await drawMap()
  startFirestoreListeners()  // Firestore リアルタイムリスナー開始
  unsubAuth = onAuthStateChanged(auth, user => { currentUser.value = user })
  window.addEventListener('app-update-available', onUpdateAvailable)
})

onUnmounted(() => {
  unsubPlans?.()
  unsubCountries?.()
  unsubAuth?.()
  mapInstance?.remove()
  window.removeEventListener('app-update-available', onUpdateAvailable)
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 4px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 更新バナー */
.update-banner {
  width: 100%;
  background: #2ecc71;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 0.85rem;
  box-sizing: border-box;
  flex-shrink: 0;
}
.update-btn {
  background: rgba(255,255,255,0.25);
  border: 1px solid rgba(255,255,255,0.6);
  color: #fff;
  padding: 3px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  white-space: nowrap;
}
.update-btn:hover { background: rgba(255,255,255,0.4); }
.update-dismiss {
  background: none;
  border: none;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 4px;
  line-height: 1;
  margin-left: auto;
}
.update-dismiss:hover { color: #fff; }

/* トップバー */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
}

.title-reset {
  font-size: clamp(1rem, 3.5vw, 1.5rem);
  color: #e0e0e0;
  margin: 0;
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}
.title-reset:hover { color: #fff; }

.burger-wrap { position: absolute; right: 0; }

.burger-btn {
  background: none;
  border: none;
  color: #7ab3d4;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s;
}
.burger-btn:hover { background: #1a2d40; }

.burger-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: #1a2d40;
  border: 1px solid #2d4a6a;
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 220px;
  z-index: 150;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
}
.burger-hint {
  font-size: 0.72rem;
  color: #556;
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #2d4a6a;
}
.burger-menu a {
  font-size: 0.8rem;
  color: #7ab3d4;
  text-decoration: none;
}
.burger-menu a:hover { text-decoration: underline; }

/* 統計 */
.stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 0.9rem;
  color: #aaa;
  gap: 1px;
}
.stat-visited { color: #e63946; cursor: pointer; }
.stat-visited:hover { text-decoration: underline; }
.stat-visited strong { font-size: 1.1rem; }
.stat-unvisited { color: #4a7a9b; cursor: pointer; }
.stat-unvisited:hover { text-decoration: underline; }
.total-features { font-size: 1.1rem; color: #4a7a9b; }
.stat-sep { color: #556; }
.stat-unit { color: #666; }

/* プランバー */
.plan-bar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.plan-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}
.plan-bar-label {
  font-size: 0.8rem;
  color: #666;
  white-space: nowrap;
}
.plan-selector-wrap { position: relative; }
.plan-selector {
  background: #1a2d40;
  color: #ccc;
  border: 1px solid #2d4a6a;
  border-radius: 6px;
  padding: 4px 10px 4px 12px;
  font-size: 0.82rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: border-color 0.2s;
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.plan-selector:hover { border-color: #4a7a9b; color: #eee; }
.selector-arrow { font-size: 0.7rem; color: #4a7a9b; flex-shrink: 0; }

.plan-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: #1a2d40;
  border: 1px solid #2d4a6a;
  border-radius: 8px;
  min-width: 260px;
  max-height: 260px;
  overflow-y: auto;
  z-index: 150;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  padding: 4px 0;
}
.dropdown-group {
  font-size: 0.68rem;
  color: #4a7a9b;
  padding: 8px 14px 3px;
  letter-spacing: 0.05em;
  border-top: 1px solid #2d4a6a;
}
.dropdown-item {
  font-size: 0.82rem;
  color: #bbb;
  padding: 7px 14px 7px 22px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.dropdown-item:hover { background: #2d4a6a; color: #eee; }
.dropdown-item.active { font-weight: 600; }
.item-clear { font-size: 0.75rem; color: #556; padding-left: 14px; font-style: italic; }

.detail-btn {
  flex-shrink: 0;
  background: #1a2d40;
  border: 1px solid #4a7a9b;
  color: #7ab3d4;
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 0.73rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.detail-btn:hover { background: #2d4a6a; color: #fff; }


/* プランナビボタン */
.plan-nav {
  width: 100%;
  height: 28px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  flex-shrink: 0;
}
.plan-nav::-webkit-scrollbar { display: none; }
.plan-nav-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 100%;
  height: 100%;
  justify-content: center;
  padding: 0 4px;
  box-sizing: border-box;
}
.plan-nav-arrow {
  color: #4a7a9b;
  font-size: 1.1rem;
  line-height: 1;
  flex-shrink: 0;
}
.set-tab {
  background: #1a2d40;
  color: #bbb;
  border: 1px solid #4a7a9b;
  border-radius: 6px;
  padding: 3px 8px 3px 10px;
  font-size: 0.77rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.set-tab:hover { background: #2d4a6a; color: #ddd; }
.set-tab.active { background: #2d4a6a; color: #e0e0e0; border-color: #7ab3d4; font-weight: 600; }
.set-info-btn {
  font-size: 0.68rem;
  color: #4a7a9b;
  cursor: pointer;
  padding: 0 2px;
  border-radius: 3px;
  transition: color 0.2s;
}
.set-info-btn:hover { color: #7ab3d4; }
.plan-tab {
  background: #1a2d40;
  color: #aaa;
  border: 1px solid #2d4a6a;
  border-radius: 16px;
  padding: 3px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}
.plan-tab:hover { border-color: #4a7a9b; color: #ccc; }
.plan-tab.active { background: #0d1b2a; font-weight: 600; }

.course-list {
  width: 100%;
  min-height: 34px;  /* コース未選択時も高さを確保してマップが動かない */
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px 4px;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
}
.course-list::-webkit-scrollbar { display: none; }

/* ドロップダウン外クリックオーバーレイ */
.click-outside {
  position: fixed;
  inset: 0;
  z-index: 140;
}

.svg-wrapper {
  flex: 1;
  min-height: 200px;
  width: 100%;
  position: relative;
  overflow: hidden;
  user-select: none;
  border-radius: 12px;
}

/* MapLibre コンテナのデフォルト背景をダーク海に */
:deep(.maplibregl-map) {
  background: #0d1b2a;
  border-radius: 12px;
}
:deep(.maplibregl-canvas) {
  border-radius: 12px;
}

/* NavigationControl をダークテーマに合わせる */
:deep(.maplibregl-ctrl-group) {
  background: #1a2d40;
  border: 1px solid #2d4a6a;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
:deep(.maplibregl-ctrl-group button) {
  background: transparent;
  color: #7ab3d4;
}
:deep(.maplibregl-ctrl-group button:hover) {
  background: #2d4a6a;
}
:deep(.maplibregl-ctrl-group button + button) {
  border-top: 1px solid #2d4a6a;
}
:deep(.maplibregl-ctrl-icon) {
  filter: invert(0.7) sepia(1) hue-rotate(180deg) saturate(0.8);
}

.tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  pointer-events: none;
  white-space: nowrap;
  z-index: 100;
}

/* 都市ポップアップ */
.city-popup {
  position: fixed;
  background: #1a2d40;
  border: 1px solid #4a7a9b;
  border-radius: 8px;
  padding: 10px 14px 12px;
  min-width: 180px;
  max-width: 280px;
  z-index: 150;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  color: #e0e0e0;
  font-size: 0.85rem;
}
.city-popup-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}
.city-popup-name {
  font-weight: bold;
  font-size: 0.95rem;
}
.city-popup-nights {
  color: #a0b4c8;
  font-size: 0.78rem;
  background: rgba(255,255,255,0.08);
  padding: 1px 6px;
  border-radius: 10px;
}
.city-popup-close {
  margin-left: auto;
  background: none;
  border: none;
  color: #7a9bb8;
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.8rem;
  line-height: 1;
}
.city-popup-close:hover { color: #fff; }
.city-popup-memo {
  color: #b0bec8;
  font-size: 0.78rem;
  font-style: italic;
  margin-bottom: 7px;
  line-height: 1.5;
}
.city-popup-spots {
  margin: 0;
  padding-left: 16px;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.city-popup-spots li { list-style: disc; }
.city-popup-spots a {
  color: #7ab8d8;
  text-decoration: none;
}
.city-popup-spots a:hover { text-decoration: underline; }
.city-popup-spot-memo {
  display: block;
  color: #8a96a4;
  font-size: 0.72rem;
  font-style: italic;
  margin-top: 1px;
  line-height: 1.4;
}
.city-popup-empty {
  color: #607080;
  font-size: 0.78rem;
  margin: 0;
  font-style: italic;
}
/* 移動ポップアップ固有 */
.leg-popup-route {
  font-size: 0.88rem;
}
.leg-popup-transport {
  font-size: 0.85rem;
  color: #e0e0e0;
  margin-bottom: 4px;
}
.leg-popup-link {
  color: #7ab8d8;
  text-decoration: none;
}
.leg-popup-link:hover { text-decoration: underline; }

/* 国一覧モーダル */
.list-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.list-panel {
  background: #1a2d40;
  border: 1px solid #4a7a9b;
  border-radius: 12px;
  width: min(860px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #2d4a6a;
  flex-shrink: 0;
  gap: 8px;
}

.list-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 編集モードボタン */
.edit-mode-btn {
  background: #1a2d40;
  border: 1px solid #4a7a9b;
  color: #7ab3d4;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.edit-mode-btn:hover { background: #2d4a6a; }

/* GitHub 保存ボタン */
.gh-save-btn {
  background: #1a3a1a;
  border: 1px solid #3a7a3a;
  color: #7ad47a;
  border-radius: 6px;
  padding: 3px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.gh-save-btn:hover:not(:disabled) { background: #2a5a2a; }
.gh-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cancel-edit-btn {
  background: #2a2a2a;
  border: 1px solid #555;
  color: #aaa;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.cancel-edit-btn:hover { background: #3a3a3a; }

/* 変更数インジケータ */
.edit-diff-count {
  font-size: 0.75rem;
  color: #7ad47a;
  font-weight: normal;
  margin-left: 6px;
}

/* エラー表示 */
.edit-error {
  background: rgba(200, 50, 50, 0.15);
  border-left: 3px solid #e63946;
  color: #ff8888;
  font-size: 0.8rem;
  padding: 6px 16px;
  flex-shrink: 0;
  word-break: break-all;
}

/* 国リスト: リストアイテムのトグルボタン */
.region-section ul li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.region-section ul li span { flex: 1; }

.toggle-remove-btn {
  background: none;
  border: 1px solid #664444;
  color: #e66;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.7rem;
  cursor: pointer;
  line-height: 1.4;
  flex-shrink: 0;
  transition: background 0.15s;
}
.toggle-remove-btn:hover { background: rgba(200,60,60,0.2); }

.toggle-add-btn {
  background: none;
  border: 1px solid #446644;
  color: #8c8;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 0.7rem;
  cursor: pointer;
  line-height: 1.4;
  flex-shrink: 0;
  transition: background 0.15s;
  min-width: 22px;
  text-align: center;
}
.toggle-add-btn:hover { background: rgba(60,180,60,0.2); }
.toggle-add-btn.active { background: rgba(60,180,60,0.25); border-color: #7ad47a; color: #7ad47a; }

.edit-item-new { background: rgba(60,180,60,0.08); border-radius: 4px; }

/* GitHub 設定パネル */
.gh-settings-panel { max-width: 420px; }
.gh-settings-body {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.gh-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  color: #bbb;
}
.gh-input {
  background: #0d1b2a;
  border: 1px solid #2d4a6a;
  border-radius: 6px;
  color: #e0e0e0;
  padding: 6px 10px;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}
.gh-input:focus { border-color: #4a7a9b; }
.gh-pat { font-family: monospace; letter-spacing: 0.05em; }
.gh-hint { color: #556; font-size: 0.72rem; margin-top: 2px; }
.gh-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* バーガーメニュー内のボタン */
.burger-gh-btn {
  background: none;
  border: 1px solid #2d4a6a;
  color: #7ab3d4;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s;
}
.burger-gh-btn:hover { background: #1a2d40; }

/* プラン JSON エディタ */
.plan-json-editor {
  width: 100%;
  min-height: 340px;
  background: #0d1b2a;
  border: 1px solid #2d4a6a;
  border-radius: 6px;
  color: #c5d8e8;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.plan-json-editor:focus { border-color: #4a7a9b; }
.edit-note {
  font-size: 0.75rem;
  color: #556;
  margin: 6px 0 0;
  font-style: italic;
}

.list-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #e0e0e0;
}

.close-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
  border-radius: 4px;
  transition: background 0.2s;
}
.close-btn:hover { background: #2d4a6a; color: #fff; }

.list-body {
  overflow-y: auto;
  padding: 12px 20px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px 20px;
  align-content: start;
}

.region-section h3 {
  font-size: 0.8rem;
  color: #7ab3d4;
  margin: 0 0 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #2d4a6a;
  white-space: nowrap;
}

.region-count {
  color: #556;
  font-weight: normal;
}

.region-section ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.region-section ul li {
  font-size: 0.85rem;
  color: #ccc;
  padding: 2px 0;
  line-height: 1.4;
}

.strikethrough-item {
  text-decoration: line-through;
  opacity: 0.45;
}

/* セット詳細モーダル */
.set-detail-panel {
  max-width: 520px;
}

.set-detail-body {
  overflow-y: auto;
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(82vh - 60px);
}

.plan-detail {
  border-left: 3px solid;
  padding-left: 12px;
}

.plan-detail-toggle {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 4px;
}

.plan-detail-toggle:hover {
  opacity: 0.85;
}

.plan-toggle-icon {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.plan-detail h3 {
  font-size: 0.9rem;
  margin: 0 0 8px;
}

/* 都市タイムライン */
.city-stops {
  display: flex;
  flex-direction: column;
  margin-bottom: 6px;
}

.city-stop {
  display: flex;
  flex-direction: column;
}

.stop-leg {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0 2px 4px;
}

.stop-leg-arrow {
  color: #4a7a9b;
  font-size: 0.75rem;
  line-height: 1;
}

.stop-leg-link,
.stop-leg-text {
  font-size: 0.72rem;
  color: #7ab3d4;
}

.stop-leg-link {
  text-decoration: underline dotted;
}

.stop-leg-link:hover {
  color: #a8d4f0;
}

.stop-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 0;
}

.stop-name {
  font-size: 0.82rem;
  color: #ddd;
  font-weight: 500;
}

.stop-nights {
  font-size: 0.7rem;
  color: #7ab3d4;
  background: rgba(74, 122, 155, 0.18);
  padding: 1px 5px;
  border-radius: 3px;
}

.stop-spots {
  list-style: none;
  margin: 2px 0 2px 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stop-spots li {
  font-size: 0.72rem;
  color: #aaa;
}

.stop-spots li::before {
  content: '📍 ';
  font-size: 0.65rem;
}

.stop-spots a {
  color: #7ab3d4;
  text-decoration: underline dotted;
}

.stop-spots a:hover {
  color: #a8d4f0;
}

.stop-memo {
  font-size: 0.7rem;
  color: #888;
  font-style: italic;
  margin: 1px 0;
  padding: 0;
}

.spot-memo {
  font-size: 0.68rem;
  color: #777;
  font-style: italic;
  margin-left: 4px;
}

.spot-memo-block {
  display: block;
  margin-left: 0;
  margin-top: 1px;
}

.plan-countries {
  font-size: 0.75rem;
  color: #7ab3d4;
  margin-top: 2px;
}

.set-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(74, 122, 155, 0.35);
  color: #7ab3d4;
  font-size: 0.65rem;
  font-style: normal;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.set-info-btn:hover {
  background: rgba(74, 122, 155, 0.75);
  color: #fff;
}
</style>
