<template>
  <div class="map-container">
    <!-- トップバー: タイトル（リセット） + バーガーメニュー -->
    <div class="top-bar">
      <h1 class="title-reset" @click="resetZoom" title="クリックでリセット">🌍 海外渡航マップ</h1>
      <div class="burger-wrap">
        <button class="burger-btn" @click.stop="burgerOpen = !burgerOpen">☰</button>
        <div v-if="burgerOpen" class="burger-menu">
          <p class="burger-hint">スクロール: 拡大・縮小　ドラッグ: 移動</p>
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">地図データ: Natural Earth</a>
          <a href="https://ja.wikipedia.org/wiki/ISO_3166-1" target="_blank" rel="noopener">国・地域コード: ISO 3166-1</a>
        </div>
      </div>
    </div>
    <!-- 統計: 渡航済み / 未渡航（クリックで一覧） -->
    <div class="stats">
      <span class="stat-visited" @click="listMode = 'visited'">渡航済み: <strong>{{ totalCount }}</strong></span>
      <span class="stat-sep">&nbsp;/&nbsp;未渡航:&nbsp;</span>
      <span class="stat-unvisited" @click="listMode = 'unvisited'"><strong class="total-features">{{ totalFeatures }}</strong></span>
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
      <!-- コース一覧（セット選択時に表示） -->
      <div v-if="selectedSet !== null" class="course-list">
        <button
          v-for="(plan, j) in PLAN_SETS[selectedSet].plans" :key="j"
          class="plan-tab"
          :class="{ active: selectedPlan === j }"
          :style="selectedPlan === j ? { borderColor: plan.color, color: plan.color } : {}"
          @click="selectedPlan = selectedPlan === j ? null : j"
        >{{ plan.label }}{{ plan.nights ? `（${plan.nights}泊）` : '' }}</button>
      </div>
    </div>
    <div ref="mapRef" class="svg-wrapper"></div>
    <div v-if="tooltip.visible" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      {{ tooltip.text }}
    </div>
    <!-- 国一覧モーダル -->
    <Teleport to="body">
      <div v-if="listMode" class="list-overlay" @click.self="listMode = null">
        <div class="list-panel">
          <div class="list-header">
            <h2>{{ listMode === 'visited' ? '渡航済み国・地域一覧' : '未渡航国・地域一覧' }}</h2>
            <button class="close-btn" @click="listMode = null">✕</button>
          </div>
          <div class="list-body">
            <template v-for="region in REGION_ORDER" :key="region">
              <div v-if="groupedList[region]" class="region-section">
                <h3>{{ region }} <span class="region-count">({{ groupedList[region].length }})</span></h3>
                <ul>
                  <li v-for="c in groupedList[region]" :key="c.en" :class="{ 'strikethrough-item': c.strikethrough }">{{ c.ja }}</li>
                </ul>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- セット詳細モーダル -->
    <Teleport to="body">
      <div v-if="modalSetIndex !== null" class="list-overlay" @click.self="modalSetIndex = null">
        <div class="list-panel set-detail-panel">
          <div class="list-header">
            <h2>{{ PLAN_SETS[modalSetIndex].setName }}</h2>
            <button class="close-btn" @click="modalSetIndex = null">✕</button>
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
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import Papa from 'papaparse'
import csvRaw from '../data/country_list.csv?raw'
import worldData from '../assets/countries-10m.json'
import rewind from 'geojson-rewind'
import countryNamesJa from '../assets/country_names_ja.json'
import countryRegions from '../assets/country_regions.json'
import PLAN_SETS from '../data/plan_sets.json'
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

const mapRef = ref(null)
let visitedSet = new Set()   // Vue reactivity 不要：D3コールバック内で直接参照
let jaMapData = {}           // Vue reactivity 不要
const allFeatureNames = ref([])  // drawMap() 後に全フィーチャー名を格納
const totalCount = ref(0)    // 英語名なし含む全件数（テンプレートで表示）
const totalFeatures = ref(0) // 地図上の総国・地域数（drawMap後に確定）
const tooltip = ref({ visible: false, x: 0, y: 0, text: '' })
const listMode = ref(null)   // null | 'visited' | 'unvisited'
const selectedSet   = ref(null) // null | セットindex
const selectedPlan  = ref(null) // null | プランindex（セット内）
const modalSetIndex = ref(null) // null | セット詳細モーダルのindex
const burgerOpen    = ref(false)
const dropdownOpen  = ref(false)
let svgRef = null
let gRef = null
let projRef = null
let pathRef = null
let zoomBehavior = null
let resizeObserver = null
let redrawTimer = null

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

const currentPlan = computed(() => {
  if (selectedSet.value === null || selectedPlan.value === null) return null
  return resolvePlan(PLAN_SETS[selectedSet.value]?.plans[selectedPlan.value] ?? null)
})

// 選択プランが変わったとき、未知の都市を Nominatim で自動取得
watch([selectedSet, selectedPlan], async ([si, pi]) => {
  if (si === null || pi === null) return
  const plan = PLAN_SETS[si]?.plans[pi]
  if (!plan) return
  const missing = plan.cities
    .filter(c => c.name !== undefined)
    .map(c => c.name)
    .filter(name => !cityData[name])
  if (!missing.length) return
  for (const name of missing) {
    const result = await geocodeCity(name)
    if (result) {
      cityData[name] = result  // reactive → currentPlan が自動再計算される
      const cache = JSON.parse(localStorage.getItem('trip-geo-cache') || '{}')
      cache[name] = result
      localStorage.setItem('trip-geo-cache', JSON.stringify(cache))
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
  const result = {}
  for (const name of allFeatureNames.value) {
    if (!name) continue
    const visited = isVisited(name)
    if (listMode.value === 'visited' && !visited) continue
    if (listMode.value === 'unvisited' && visited) continue
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
  if (!propName) return '#2d4a6a'
  if (currentPlan.value?.countries.includes(propName)) return currentPlan.value.color
  return isVisited(propName) ? '#e63946' : '#2d4a6a'
}

// 国のホバー色
function getCountryHover(propName) {
  if (!propName) return '#4a7a9b'
  if (currentPlan.value?.countries.includes(propName)) return currentPlan.value.color + 'cc'
  return isVisited(propName) ? '#ff6b6b' : '#4a7a9b'
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

async function loadCSV() {
  const result = Papa.parse(csvRaw, { header: true, skipEmptyLines: true })
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

function resetZoom() {
  if (svgRef && zoomBehavior) {
    svgRef.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity)
  }
}

async function drawMap() {
  const world = worldData
  const countries = topojson.feature(world, world.objects.countries)

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
        if (lonMin < -50 && latMax < 10)           buckets['Fr. Guiana'].push(poly)   // フランス領ギアナ
        else if (lonMin < -40 && latMax < 15.5)    buckets['Martinique'].push(poly)    // マルティニーク
        else if (lonMin < -40 && latMax < 20)      buckets['Guadeloupe'].push(poly)    // グアドループ
        else if (lonMin > 50  && latMax < 0)       buckets['Réunion'].push(poly)       // レユニオン
        else if (lonMin > 40  && latMax < 0)       buckets['Mayotte'].push(poly)       // マヨット
        else                                        buckets._france.push(poly)          // 本土・コルシカ等
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

  const wrapper = mapRef.value
  const container = wrapper.parentElement
  const containerW = wrapper.clientWidth || (container.clientWidth - 24)
  // 利用可能な高さ（ヘッダー要素の高さを実測して差し引く）
  let siblingsH = 0
  for (const child of container.children) {
    if (child !== wrapper) siblingsH += child.offsetHeight
  }
  const numGaps = Math.max(container.children.length - 1, 0)
  const availH = Math.max(container.clientHeight - siblingsH - numGaps * 6 - 12, 80)
  const aspect = 960 / 487
  const widthConstrainedH = containerW / aspect
  let width = containerW
  let height, projScale, xMin, xMax, yMin, yMax

  if (widthConstrainedH <= availH) {
    // 縦向き：高さフィル、地図が横にはみ出す → 横ドラッグで表示
    height = availH
    const mapW = height * aspect
    projScale = mapW / 6.3
    xMin = (width - mapW) / 2
    xMax = (width + mapW) / 2
    yMin = 0
    yMax = height
  } else {
    // 横向き：幅フィル、地図が縦にはみ出す → 縦ドラッグで表示
    height = availH
    const mapH = width / aspect
    projScale = width / 6.3
    xMin = 0
    xMax = width
    yMin = (height - mapH) / 2
    yMax = (height + mapH) / 2
  }

  width = Math.floor(Math.max(width, 100))
  height = Math.floor(Math.max(height, 50))

  // winding order の誤りを選択的に修正
  // rewind が bbox を大幅に改善した場合のみ適用（Russia/Fiji 等 antimeridian 国には適用しない）
  const projection = d3.geoNaturalEarth1()
    .scale(projScale)
    .translate([width / 2, height / 2])
  const path = d3.geoPath().projection(projection)
  projRef = projection
  pathRef = path
  const svgArea = width * height
  countries.features.forEach(feature => {
    const b = path.bounds(feature)
    const area = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1])
    if (area > svgArea * 0.15) {
      const origGeom = JSON.parse(JSON.stringify(feature.geometry))
      rewind(feature, true)
      const b2 = path.bounds(feature)
      const area2 = (b2[1][0] - b2[0][0]) * (b2[1][1] - b2[0][1])
      if (area2 > area * 0.5) feature.geometry = origGeom // rewind が悪化した場合は元に戻す
    }
  })

  const svg = d3.select(mapRef.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('background', '#0d1b2a')
    .style('border-radius', '12px')
    .style('cursor', 'grab')

  svgRef = svg
  gRef = null // reset before assign

  // 海のグラデーション
  const defs = svg.append('defs')
  defs.append('linearGradient')
    .attr('id', 'ocean-grad')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '0%').attr('y2', '100%')
    .selectAll('stop')
    .data([
      { offset: '0%', color: '#0d1b2a' },
      { offset: '100%', color: '#1a3a5c' }
    ])
    .enter().append('stop')
    .attr('offset', d => d.offset)
    .attr('stop-color', d => d.color)

  svg.append('rect')
    .attr('width', width).attr('height', height)
    .attr('fill', 'url(#ocean-grad)')

  // ズーム対象のグループ
  const g = svg.append('g').attr('class', 'map-g')
  gRef = g

  g.selectAll('.country')
    .data(countries.features)
    .enter()
    .append('path')
    .attr('class', 'country')
    .attr('d', path)
    .attr('fill', d => getCountryFill(d.properties?.name || ''))
    .attr('stroke', '#0d1b2a')
    .attr('stroke-width', 0.2)
    .on('mousemove', function (event, d) {
      const propName = d.properties?.name || ''
      const jaName = getJaName(propName)
      const vis = isVisited(propName)
      tooltip.value = {
        visible: true,
        x: event.clientX + 12,
        y: event.clientY - 28,
        text: `${jaName}${vis ? ' ✓ 渡航済み' : ''}`
      }
      d3.select(this).attr('fill', getCountryHover(propName))
    })
    .on('mouseleave', function (event, d) {
      tooltip.value.visible = false
      d3.select(this).attr('fill', getCountryFill(d.properties?.name || ''))
    })

  // 国境線
  g.append('path')
    .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
    .attr('fill', 'none')
    .attr('stroke', '#0d1b2a')
    .attr('stroke-width', 0.2)
    .attr('d', path)

  // ズーム設定
  zoomBehavior = d3.zoom()
    .scaleExtent([1, 20])
    .translateExtent([[xMin, yMin], [xMax, yMax]])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
      svg.style('cursor', event.transform.k > 1 ? 'grabbing' : 'grab')
    })

  svg.call(zoomBehavior)
    .on('dblclick.zoom', null) // ダブルクリックズームを無効化
}

// プランオーバーレイ（アーク + 都市マーカー）の更新
function updatePlanOverlay() {
  if (!gRef || !projRef || !pathRef) return

  // 国の色を更新
  gRef.selectAll('.country').attr('fill', d => getCountryFill(d.properties?.name || ''))

  // 既存オーバーレイを削除
  gRef.select('.plan-overlay').remove()
  if (!currentPlan.value) return

  const plan = currentPlan.value
  const overlay = gRef.append('g').attr('class', 'plan-overlay')

  // ── アーク描画 ─────────────────────────────────────────────
  const cities = plan.cities.filter(i => i._type === 'city')
  for (let i = 0; i < cities.length - 1; i++) {
    const from = cities[i].coords
    const to   = cities[i + 1].coords
    // 日付変更線をまたぐか判定（経度差 > 180°）
    const lonDiff = Math.abs(from[0] - to[0])
    if (lonDiff > 180) {
      // 日付変更線をまたぐ場合は 2 分割して描画
      const sign = from[0] > 0 ? 1 : -1
      const lat  = (from[1] + to[1]) / 2
      overlay.append('path').datum({ type: 'LineString', coordinates: [from, [sign * 180, lat]] })
        .attr('d', pathRef).attr('fill', 'none')
        .attr('stroke', plan.color).attr('stroke-width', 1.0)
        .attr('stroke-dasharray', '6,3').attr('opacity', 0.85)
      overlay.append('path').datum({ type: 'LineString', coordinates: [[-sign * 180, lat], to] })
        .attr('d', pathRef).attr('fill', 'none')
        .attr('stroke', plan.color).attr('stroke-width', 1.0)
        .attr('stroke-dasharray', '6,3').attr('opacity', 0.85)
    } else {
      overlay.append('path')
        .datum({ type: 'LineString', coordinates: [from, to] })
        .attr('d', pathRef)
        .attr('fill', 'none')
        .attr('stroke', plan.color)
        .attr('stroke-width', 1.0)
        .attr('stroke-dasharray', '6,3')
        .attr('opacity', 0.85)
    }
  }

  // ── 都市マーカー・ラベル ───────────────────────────────────
  const seen = new Set()
  cities.forEach(city => {
    const key = city.coords.join(',')
    if (seen.has(key)) return
    seen.add(key)
    const pt = projRef(city.coords)
    if (!pt) return
    overlay.append('circle')
      .attr('cx', pt[0]).attr('cy', pt[1]).attr('r', 4)
      .attr('fill', plan.color).attr('stroke', '#fff').attr('stroke-width', 1)
    overlay.append('text')
      .attr('x', pt[0] + 6).attr('y', pt[1] - 4)
      .attr('fill', '#fff').attr('font-size', '7px')
      .style('text-shadow', '0 0 3px #000, 0 0 3px #000')
      .text(city.name)
  })
}

function selectSetFromDD(si) {
  selectedSet.value = si
  selectedPlan.value = null
  dropdownOpen.value = false
}

function selectSet(i) {
  selectedSet.value = selectedSet.value === i ? null : i
  selectedPlan.value = null
}

function selectPlanFromDD(si, pi) {
  selectedSet.value = si
  selectedPlan.value = pi
  dropdownOpen.value = false
}

function clearPlan() {
  selectedSet.value = null
  selectedPlan.value = null
  dropdownOpen.value = false
}

const openPlans = ref([])

watch(modalSetIndex, (val) => {
  if (val !== null) openPlans.value = PLAN_SETS[val].plans.map(() => true)
})

function togglePlan(j) {
  openPlans.value[j] = !openPlans.value[j]
}

watch(currentPlan, () => updatePlanOverlay())

onMounted(async () => {
  await loadCSV()
  await drawMap()

  resizeObserver = new ResizeObserver(() => {
    clearTimeout(redrawTimer)
    redrawTimer = setTimeout(() => {
      d3.select(mapRef.value).selectAll('*').remove()
      drawMap()
    }, 150)
  })
  resizeObserver.observe(mapRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  clearTimeout(redrawTimer)
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
  color: #4a7a9b;
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
  flex-shrink: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
  user-select: none;
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
