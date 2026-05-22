<template>
  <div class="map-container">
    <h1>🌍 海外渡航マップ</h1>
    <div class="stats">
      渡航済み: <strong>{{ totalCount }}</strong> / <strong>{{ totalFeatures }}</strong> か国・地域
    </div>
    <div class="controls">
      <div class="legend">
        <span class="legend-item visited" @click="listMode = 'visited'">&#9632; 渡航済み</span>
        <span class="legend-item unvisited" @click="listMode = 'unvisited'">&#9632; 未渡航</span>
      </div>
      <button class="reset-btn" @click="resetZoom">リセット</button>
    </div>
    <div ref="mapRef" class="svg-wrapper"></div>
    <div v-if="tooltip.visible" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      {{ tooltip.text }}
    </div>
    <p class="hint">スクロールで拡大・縮小 / ドラッグで移動</p>
    <p class="source-note">
      地図データ: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>
      &nbsp;|&nbsp; 国・地域コード: <a href="https://ja.wikipedia.org/wiki/ISO_3166-1" target="_blank" rel="noopener">ISO 3166-1</a>
    </p>

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
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import Papa from 'papaparse'
import csvRaw from '../assets/country_list.csv?raw'
import worldData from '../assets/countries-10m.json'
import rewind from 'geojson-rewind'
import countryNamesJa from '../assets/country_names_ja.json'
import countryRegions from '../assets/country_regions.json'

const mapRef = ref(null)
let visitedSet = new Set()   // Vue reactivity 不要：D3コールバック内で直接参照
let jaMapData = {}           // Vue reactivity 不要
const allFeatureNames = ref([])  // drawMap() 後に全フィーチャー名を格納
const totalCount = ref(0)    // 英語名なし含む全件数（テンプレートで表示）
const totalFeatures = ref(0) // 地図上の総国・地域数（drawMap後に確定）
const tooltip = ref({ visible: false, x: 0, y: 0, text: '' })
const listMode = ref(null)   // null | 'visited' | 'unvisited'
let svgRef = null
let zoomBehavior = null
let resizeObserver = null
let redrawTimer = null

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

  g.selectAll('.country')
    .data(countries.features)
    .enter()
    .append('path')
    .attr('class', 'country')
    .attr('d', path)
    .attr('fill', d => {
      const name = d.properties?.name || ''
      return isVisited(name) ? '#e63946' : '#2d4a6a'
    })
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
      d3.select(this).attr('fill', vis ? '#ff6b6b' : '#4a7a9b')
    })
    .on('mouseleave', function (event, d) {
      tooltip.value.visible = false
      const name = d.properties?.name || ''
      d3.select(this).attr('fill', isVisited(name) ? '#e63946' : '#2d4a6a')
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
  gap: 6px;
  padding: 8px 12px 4px;
  box-sizing: border-box;
  overflow: hidden;
}

h1 {
  font-size: clamp(1.1rem, 4vw, 1.8rem);
  color: #e0e0e0;
}

.stats {
  font-size: 1.1rem;
  color: #aaa;
}

.stats strong {
  color: #e63946;
  font-size: 1.3rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 24px;
}

.legend {
  display: flex;
  gap: 24px;
  font-size: 0.9rem;
}

.legend-item.visited { color: #e63946; cursor: pointer; }
.legend-item.unvisited { color: #4a7a9b; cursor: pointer; }
.legend-item:hover { text-decoration: underline; }

.reset-btn {
  background: #2d4a6a;
  color: #eee;
  border: 1px solid #4a7a9b;
  border-radius: 6px;
  padding: 4px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s;
}
.reset-btn:hover { background: #4a7a9b; }

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

.hint {
  font-size: 0.65rem;
  color: #555;
  margin-top: -2px;
}

.source-note {
  font-size: 0.6rem;
  color: #444;
  margin-top: 2px;
  text-align: center;
}

.source-note a {
  color: #557;
  text-decoration: none;
}

.source-note a:hover {
  text-decoration: underline;
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
</style>
