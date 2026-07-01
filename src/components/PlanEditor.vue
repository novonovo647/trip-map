<template>
  <div class="pe-overlay" @click.self="handleClose">
    <div class="pe-panel">

      <!-- ヘッダー -->
      <div class="pe-header">
        <input
          v-if="singleSetIndex !== null"
          class="pe-header-name-input"
          v-model="data[singleSetIndex].setName"
          placeholder="プラン名"
        />
        <h2 v-else>✎ プランを編集</h2>
        <div class="pe-header-actions">
          <span v-if="saveStatus !== 'idle'" class="pe-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失敗' : saveStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
          </span>
          <!-- 他ユーザーが編集中のアイコン -->
          <template v-if="editorInfo && saveStatus === 'external'">
            <img v-if="editorInfo.photo" :src="editorInfo.photo" class="pe-editor-avatar" :title="editorInfo.name" referrerpolicy="no-referrer" />
            <span v-else class="pe-editor-name">{{ editorInfo.name }}</span>
          </template>
          <button class="pe-close-btn" @click="handleClose" title="閉じる">×</button>
        </div>
      </div>
      <div v-if="saveError" class="pe-error">{{ saveError }}</div>

      <!-- ボディ: サイドバー + コンテンツ -->
      <div class="pe-body">

        <!-- サイドバー: コース一覧 -->
        <div class="pe-sidebar" v-if="singleSetIndex === null">
          <div
            v-for="(ps, si) in data"
            :key="si"
            class="pe-set-tab"
            :class="{ active: activeSet === si }"
            @click="selectSet(si)"
          >
            <span class="pe-set-tab-name">{{ ps.setName || '（名称なし）' }}</span>
            <button class="pe-icon-btn del sm" @click.stop="deleteSet(si)" title="このプランを削除">🗑</button>
          </div>
          <button class="pe-add-set-btn" @click="addSet">＋ プラン追加</button>
        </div>

        <!-- コンテンツ: 選択中のコースを編集 -->
        <div class="pe-content" v-if="activeSet !== null && data[activeSet]">

          <!-- プラン名 -->
          <div class="pe-field-row" v-if="singleSetIndex === null">
            <label class="pe-label">プラン名</label>
            <input class="pe-input pe-input-wide" v-model="data[activeSet].setName" placeholder="プラン名を入力" />
          </div>

          <!-- プラン一覧 -->
          <div class="pe-plans-section">
            <template v-for="(plan, pi) in data[activeSet].plans" :key="pi">
              <div
                class="pe-plan"
                data-item-type="plan"
                :data-pi="pi"
                :class="{
                  'dnd-over': dragOverPlanInfo?.pi === pi && dragPlanInfo?.pi !== pi,
                  'dnd-dragging': dragPlanInfo?.pi === pi
                }"
              >

                <!-- プランヘッダー -->
                <div class="pe-plan-bar" @click="togglePlan(pi)">
                  <span class="pe-drag-handle" @pointerdown.prevent="startPlanDrag($event, pi)" @click.stop>⠿</span>
                  <span class="pe-plan-arrow">{{ openPlan[pi] ? '▾' : '▸' }}</span>
                  <input
                    class="pe-plan-name"
                    v-model="plan.label"
                    @click.stop
                    placeholder="コース名"
                  />
                  <input
                    type="color"
                    v-model="plan.color"
                    @click.stop
                    class="pe-color-picker"
                    title="カラー"
                  />
                  <div class="pe-nights-row" @click.stop>
                    <input
                      type="number"
                      v-model.number="plan.nights"
                      min="0"
                      class="pe-nights-input"
                      placeholder="-"
                    />
                    <span class="pe-label-sm">泊</span>
                  </div>
                  <div class="pe-plan-actions" @click.stop>
                    <button class="pe-icon-btn del sm" @click="deletePlan(pi)" title="コースを削除">🗑</button>
                  </div>
                </div>

                <!-- 都市・移動タイムライン -->
                <div v-if="openPlan[pi]" class="pe-timeline">
                  <template v-for="(item, ci) in plan.cities" :key="ci">

                    <!-- 都市 -->
                    <div
                      v-if="'name' in item"
                      class="pe-city-card"
                      data-item-type="city"
                      :data-pi="pi"
                      :data-ci="ci"
                      :class="{
                        'dnd-over': dragOverCityInfo?.pi === pi && dragOverCityInfo?.ci === ci && dragCityInfo?.ci !== ci,
                        'dnd-dragging': dragCityInfo?.pi === pi && dragCityInfo?.ci === ci
                      }"
                    >
                      <div class="pe-city-main">
                        <span class="pe-drag-handle" @pointerdown.prevent="startCityDrag($event, pi, ci)" @click.stop>⠿</span>
                        <span class="pe-badge city">都市</span>
                        <div class="pe-city-name-wrap">
                          <input v-model="item.name" placeholder="都市名" class="pe-city-name-input"
                            @input="onCityNameInput(`${pi}-${ci}`, item)" />
                          <div class="pe-city-country-row">
                            <div class="pe-country-wrap">
                              <input
                                :value="countryDisplayText(`${pi}-${ci}`, item)"
                                @input="onCountryInput(`${pi}-${ci}`, item, $event.target.value)"
                                @focus="onCountryFocus(`${pi}-${ci}`, item)"
                                @blur="onCountryBlur(`${pi}-${ci}`)"
                                :placeholder="cityCountryCandidates[`${pi}-${ci}`] === 'loading' ? '候補取得中…' : '国（日本語可・省略可）'"
                                class="pe-country-input"
                                :class="{ 'is-loading': cityCountryCandidates[`${pi}-${ci}`] === 'loading' }"
                                autocomplete="off"
                              />
                              <div
                                v-if="countryACState[`${pi}-${ci}`]?.open &&
                                  (cityCountryCandidates[`${pi}-${ci}`]?.length ||
                                   countryACState[`${pi}-${ci}`]?.suggestions?.length)"
                                class="pe-country-dropdown"
                              >
                                <template v-if="cityCountryCandidates[`${pi}-${ci}`]?.length">
                                  <div class="pe-country-section-label">{{ item.name }} の候補</div>
                                  <div
                                    v-for="s in cityCountryCandidates[`${pi}-${ci}`]"
                                    :key="'cand-' + s.en"
                                    class="pe-country-option pe-country-candidate"
                                    @mousedown.prevent="selectCountry(`${pi}-${ci}`, item, s)"
                                  >{{ s.ja }}</div>
                                  <div v-if="countryACState[`${pi}-${ci}`]?.suggestions?.length" class="pe-country-divider"></div>
                                </template>
                                <template v-if="countryACState[`${pi}-${ci}`]?.suggestions?.length">
                                  <div v-if="cityCountryCandidates[`${pi}-${ci}`]?.length" class="pe-country-section-label">すべての国</div>
                                  <div
                                    v-for="s in countryACState[`${pi}-${ci}`].suggestions"
                                    :key="s.en"
                                    class="pe-country-option"
                                    @mousedown.prevent="selectCountry(`${pi}-${ci}`, item, s)"
                                  >{{ s.ja }}</div>
                                </template>
                              </div>
                            </div>
                          </div>
                        </div>
                        <input type="number" v-model.number="item.nights" min="0" class="pe-city-nights" placeholder="-" />
                        <span class="pe-label-sm">泊</span>
                        <div class="pe-item-btns">
                          <button class="pe-icon-btn sm del" @click="deleteItem(plan.cities, ci)" title="削除">✕</button>
                        </div>
                      </div>
                      <div class="pe-city-sub">
                        <label class="pe-sub-label">メモ</label>
                        <input v-model="item.memo" placeholder="メモ（¥nで改行）" class="pe-sub-input" />
                      </div>
                      <!-- 観光スポット -->
                      <div class="pe-spots-section">
                        <div class="pe-spots-toggle" @click="toggleSpots(pi, ci)">
                          <span>観光スポット ({{ (item.spots || []).length }}件)</span>
                          <span class="pe-spots-arrow">{{ openSpots[`${pi}-${ci}`] ? '▾' : '▸' }}</span>
                        </div>
                        <template v-if="openSpots[`${pi}-${ci}`]">
                          <div v-for="(spot, spi) in ensureSpots(item)" :key="spi" class="pe-spot-row">
                            <input v-model="spot.name" placeholder="スポット名" class="pe-spot-name" />
                            <input v-model="spot.url"  placeholder="URL（任意）" class="pe-spot-url"  />
                            <input v-model="spot.memo" placeholder="メモ（任意）" class="pe-spot-memo" />
                            <button class="pe-icon-btn sm del" @click="deleteSpot(item, spi)" title="削除">✕</button>
                          </div>
                          <button class="pe-add-btn sm" @click="addSpot(item)">＋ スポットを追加</button>
                        </template>
                      </div>
                    </div>

                    <!-- 移動手段 -->
                    <div
                      v-else
                      class="pe-transport-card"
                      data-item-type="city"
                      :data-pi="pi"
                      :data-ci="ci"
                      :class="{
                        'dnd-over': dragOverCityInfo?.pi === pi && dragOverCityInfo?.ci === ci && dragCityInfo?.ci !== ci,
                        'dnd-dragging': dragCityInfo?.pi === pi && dragCityInfo?.ci === ci
                      }"
                    >
                      <span class="pe-drag-handle" @pointerdown.prevent="startCityDrag($event, pi, ci)" @click.stop>⠿</span>
                      <span class="pe-badge transport">移動</span>
                      <div class="pe-transport-fields">
                        <div class="pe-tr-selects">
                          <select v-model="item.ticketType" class="pe-tr-select">
                            <option value="世界一周券">世界一周券</option>
                            <option value="自己手配">自己手配</option>
                          </select>
                          <select v-model="item.mode" class="pe-tr-select">
                            <option value="飛行機">✈ 飛行機</option>
                            <option value="電車">🚆 電車</option>
                            <option value="バス">🚌 バス</option>
                            <option value="その他">🚗 その他</option>
                          </select>
                        </div>
                        <input v-model="item.transport" placeholder="便名・路線名（任意）" class="pe-tr-main" />
                        <input v-model="item.url"       placeholder="URL（任意）"           class="pe-tr-url"  />
                        <input v-model="item.memo"      placeholder="メモ（任意）"           class="pe-tr-memo" />
                      </div>
                      <div class="pe-item-btns">
                        <button class="pe-icon-btn sm del" @click="deleteItem(plan.cities, ci)" title="削除">✕</button>
                      </div>
                    </div>

                  </template>

                  <!-- 追加ボタン -->
                  <div class="pe-add-row">
                    <button class="pe-add-btn" @click="addCity(plan)">＋ 都市を追加</button>
                    <button class="pe-add-btn" @click="addTransport(plan)">＋ 移動を追加</button>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <button class="pe-add-btn add-plan-btn" @click="addPlan">＋ コースを追加</button>
        </div>

        <div v-else-if="singleSetIndex === null" class="pe-no-set">
          プランを選択または追加してください
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { db, auth } from '../firebase.js'
import { setDoc, doc } from 'firebase/firestore'
import countryNamesJa from '../assets/country_names_ja.json'

const COUNTRY_LIST = Object.entries(countryNamesJa).map(([en, ja]) => ({ en, ja }))

const props = defineProps({
  initialData:    { type: Array,  required: true },
  externalData:   { type: Array,  default: null },
  editorInfo:     { type: Object, default: null },
  singleSetIndex: { type: Number, default: null },
})

const emit = defineEmits(['close'])

// ── 自動保存 ──────────────────────────────────────
const saveStatus = ref('idle')   // 'idle' | 'saved' | 'saving' | 'error' | 'external'
const saveError  = ref('')
let   autoSaveTimer        = null
let   initialized          = false
let   isApplyingExternal   = false

// 元データを破壊しないようディープコピーで作業
const data = reactive(JSON.parse(JSON.stringify(props.initialData)))

watch(data, () => {
  if (!initialized || isApplyingExternal) return
  saveStatus.value = 'saving'
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => doSave(false), 1500)
}, { deep: true })

// 他ユーザーの更新をエディタに反映
watch(() => props.externalData, (newVal) => {
  if (!newVal) return
  isApplyingExternal = true
  clearTimeout(autoSaveTimer)
  autoSaveTimer = null
  data.splice(0, data.length, ...JSON.parse(JSON.stringify(newVal)))
  // activeSet の更新
  if (props.singleSetIndex !== null) {
    if (props.singleSetIndex < data.length) {
      activeSet.value = props.singleSetIndex
    } else {
      emit('close')
    }
  } else if (activeSet.value !== null && activeSet.value >= data.length) {
    activeSet.value = data.length > 0 ? 0 : null
  }
  setTimeout(() => { isApplyingExternal = false }, 0)
  saveStatus.value = 'external'
  setTimeout(() => { if (saveStatus.value === 'external') saveStatus.value = 'saved' }, 3000)
})

// watch登録後に初期化（初期値で自動保存しない）
setTimeout(() => { initialized = true }, 0)

onBeforeUnmount(() => clearTimeout(autoSaveTimer))

function buildCleanedData() {
  const cleaned = JSON.parse(JSON.stringify(data))
  cleaned.forEach(ps => {
    ps.plans.forEach(plan => {
      if (!plan.nights && plan.nights !== 0) plan.nights = null
      plan.cities = plan.cities.filter(item => {
        if ('name' in item) return item.name?.trim()
        return item.transport?.trim()
      })
      plan.cities.forEach(item => {
        if ('name' in item) {
          if (!item.nights && item.nights !== 0) delete item.nights
          if (!item.memo?.trim())                delete item.memo
          if (!item.country?.trim())             delete item.country
          if (item.spots) {
            item.spots = item.spots.filter(s => s.name?.trim())
            item.spots.forEach(s => {
              if (!s.url?.trim())  delete s.url
              if (!s.memo?.trim()) delete s.memo
            })
            if (item.spots.length === 0) delete item.spots
          }
        } else {
          if (!item.url?.trim())  delete item.url
          if (!item.memo?.trim()) delete item.memo
        }
      })
    })
  })
  return cleaned
}

async function doSave(shouldClose) {
  saveStatus.value = 'saving'
  saveError.value  = ''
  try {
    await setDoc(doc(db, 'tripdata', 'plans'), {
      sets:        buildCleanedData(),
      savedBy:     auth.currentUser?.uid          ?? '',
      editorName:  auth.currentUser?.displayName  ?? '',
      editorPhoto: auth.currentUser?.photoURL     ?? '',
    })
    saveStatus.value = 'saved'
    if (shouldClose) emit('close')
  } catch (e) {
    saveStatus.value = 'error'
    saveError.value  = e.message
  }
}

function handleClose() {
  clearTimeout(autoSaveTimer)
  doSave(true)
}

const activeSet = ref(props.singleSetIndex !== null ? props.singleSetIndex : (data.length > 0 ? 0 : null))
const openPlan  = ref({})   // { [pi]: boolean }
const openSpots = ref({})   // { [`${pi}-${ci}`]: boolean }

// ── ポインタ D&D ─────────────────────────────
const dragPlanInfo      = ref(null)  // { pi } | null
const dragOverPlanInfo  = ref(null)  // { pi } | null
const dragCityInfo      = ref(null)  // { pi, ci } | null
const dragOverCityInfo  = ref(null)  // { pi, ci } | null

// 最初のプランを開いた状態にする
if (data.length > 0 && data[0].plans.length > 0) openPlan.value[0] = true

function selectSet(si) {
  activeSet.value  = si
  openPlan.value   = { 0: true }
  openSpots.value  = {}
}

function togglePlan(pi) {
  openPlan.value[pi] = !openPlan.value[pi]
}

function toggleSpots(pi, ci) {
  const key = `${pi}-${ci}`
  openSpots.value[key] = !openSpots.value[key]
}

// ── ポインタ D&D ハンドラ ─────────────────────────────────
let _ghost = null

function _startGhost(el, e) {
  if (_ghost) { _ghost.remove(); _ghost = null }
  const rect = el.getBoundingClientRect()
  _ghost = el.cloneNode(true)
  Object.assign(_ghost.style, {
    position: 'fixed', top: rect.top + 'px', left: rect.left + 'px',
    width: rect.width + 'px', pointerEvents: 'none', opacity: '0.85',
    zIndex: '9999', boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
    borderRadius: '6px', cursor: 'grabbing', margin: '0',
  })
  document.body.appendChild(_ghost)
  return { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
}
function _moveGhost(e, o) {
  if (!_ghost) return
  _ghost.style.top  = (e.clientY - o.dy) + 'px'
  _ghost.style.left = (e.clientX - o.dx) + 'px'
}
function _endGhost() { if (_ghost) { _ghost.remove(); _ghost = null } }

function _hitEl(ev, selector) {
  const dragging = document.querySelectorAll('.dnd-dragging')
  dragging.forEach(el => { el.style.visibility = 'hidden' })
  const found = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(selector)
  dragging.forEach(el => { el.style.visibility = '' })
  return found ?? null
}

function startPlanDrag(e, pi) {
  dragPlanInfo.value     = { pi }
  dragOverPlanInfo.value = { pi }
  e.target.releasePointerCapture?.(e.pointerId)
  const planEl = e.target.closest('[data-item-type="plan"]')
  const barEl  = planEl?.querySelector('.pe-plan-bar') ?? planEl
  const offset = barEl ? _startGhost(barEl, e) : null
  const onMove = (ev) => {
    if (offset) _moveGhost(ev, offset)
    const el = _hitEl(ev, '[data-item-type="plan"]')
    if (!el) return
    const newPi = parseInt(el.dataset.pi)
    if (!isNaN(newPi)) dragOverPlanInfo.value = { pi: newPi }
  }
  const onUp = () => {
    _endGhost()
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    const from = dragPlanInfo.value?.pi
    const to   = dragOverPlanInfo.value?.pi
    dragPlanInfo.value     = null
    dragOverPlanInfo.value = null
    if (from == null || to == null || from === to) return
    const plans = data[activeSet.value].plans
    const [item] = plans.splice(from, 1)
    plans.splice(to, 0, item)
  }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
}

function startCityDrag(e, pi, ci) {
  dragCityInfo.value     = { pi, ci }
  dragOverCityInfo.value = { pi, ci }
  e.target.releasePointerCapture?.(e.pointerId)
  const cardEl = e.target.closest('[data-item-type="city"]')
  const offset = cardEl ? _startGhost(cardEl, e) : null
  const onMove = (ev) => {
    if (offset) _moveGhost(ev, offset)
    const el = _hitEl(ev, '[data-item-type="city"]')
    if (!el) return
    const elPi = parseInt(el.dataset.pi)
    const elCi = parseInt(el.dataset.ci)
    if (elPi === pi && !isNaN(elCi)) dragOverCityInfo.value = { pi, ci: elCi }
  }
  const onUp = () => {
    _endGhost()
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    const src = dragCityInfo.value
    const tgt = dragOverCityInfo.value
    dragCityInfo.value     = null
    dragOverCityInfo.value = null
    if (!src || !tgt || src.ci === tgt.ci) return
    const cities = data[activeSet.value].plans[pi].cities
    const [item] = cities.splice(src.ci, 1)
    cities.splice(tgt.ci, 0, item)
  }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
}

function ensureSpots(item) {
  if (!item.spots) item.spots = []
  return item.spots
}

// ── コース CRUD ─────────────────────────────────
function addSet() {
  data.push({ setName: '新しいプラン', plans: [] })
  activeSet.value = data.length - 1
  openPlan.value  = {}
  openSpots.value = {}
}

function deleteSet(si) {
  if (!confirm(`「${data[si].setName || '（名称なし）'}」を削除しますか？`)) return
  data.splice(si, 1)
  if (activeSet.value >= data.length) activeSet.value = data.length - 1
  if (data.length === 0) activeSet.value = null
  openPlan.value  = { 0: true }
  openSpots.value = {}
}

// ── プラン CRUD ─────────────────────────────────
function addPlan() {
  if (activeSet.value === null) return
  const pi = data[activeSet.value].plans.length
  data[activeSet.value].plans.push({
    label:  '新しいコース',
    nights: null,
    color:  '#4a90e2',
    cities: [],
  })
  openPlan.value[pi] = true
}

function deletePlan(pi) {
  const plan = data[activeSet.value].plans[pi]
  if (!confirm(`「${plan.label || '（名称なし）'}」を削除しますか？`)) return
  data[activeSet.value].plans.splice(pi, 1)
}

function movePlan(pi, dir) {
  const plans  = data[activeSet.value].plans
  const target = pi + dir
  if (target < 0 || target >= plans.length) return
  const tmp = plans[pi]; plans[pi] = plans[target]; plans[target] = tmp
}

// ── 都市・移動 CRUD ─────────────────────────────
function addCity(plan) {
  plan.cities.push({ name: '', nights: null, memo: '', spots: [] })
}

function addTransport(plan) {
  plan.cities.push({ transport: '', url: '', memo: '', ticketType: '世界一周券', mode: '飛行機' })
}

function deleteItem(cities, ci) {
  cities.splice(ci, 1)
}

function moveItem(cities, ci, dir) {
  const target = ci + dir
  if (target < 0 || target >= cities.length) return
  const tmp = cities[ci]; cities[ci] = cities[target]; cities[target] = tmp
}

// ── スポット CRUD ───────────────────────────────
function addSpot(cityItem) {
  if (!cityItem.spots) cityItem.spots = []
  cityItem.spots.push({ name: '', url: '', memo: '' })
}

function deleteSpot(cityItem, spi) {
  cityItem.spots.splice(spi, 1)
}

// ── 国オートコンプリート ──────────────────────────
const NOMINATIM_FIX = {
  'Türkiye': 'Turkey',
  'United States': 'United States of America',
  'Republic of Korea': 'South Korea',
  "Democratic People's Republic of Korea": 'North Korea',
  'Czech Republic': 'Czechia',
  'Russian Federation': 'Russia',
  'Islamic Republic of Iran': 'Iran',
  'Syrian Arab Republic': 'Syria',
  "Lao People's Democratic Republic": 'Laos',
  'Viet Nam': 'Vietnam',
  'United Republic of Tanzania': 'Tanzania',
  'Republic of Moldova': 'Moldova',
  'Republic of North Macedonia': 'Macedonia',
  'Collectivity of Saint Martin': 'France',
  'French Polynesia': 'French Polynesia',
  'Brasil': 'Brazil',
}

// 都市名に対応する候補国: key→[{en,ja}] | 'loading' | null
const cityCountryCandidates = reactive({})
const _cityNameTimers = {}

function onCityNameInput(key, item) {
  clearTimeout(_cityNameTimers[key])
  cityCountryCandidates[key] = null
  const name = item.name?.trim()
  if (!name) return
  cityCountryCandidates[key] = 'loading'
  _cityNameTimers[key] = setTimeout(async () => {
    try {
      const url = 'https://nominatim.openstreetmap.org/search'
        + `?q=${encodeURIComponent(name)}&format=json&limit=5&addressdetails=1`
      const res = await fetch(url, { headers: { 'User-Agent': 'trip-map/1.0', 'Accept-Language': 'en' } })
      const json = await res.json()
      const seen = new Set()
      const candidates = []
      for (const r of json) {
        const raw = r.address?.country ?? ''
        const en = NOMINATIM_FIX[raw] ?? raw
        if (!en || seen.has(en)) continue
        seen.add(en)
        candidates.push({ en, ja: countryNamesJa[en] || en })
      }
      cityCountryCandidates[key] = candidates
      // 候補が1件のみなら自動選択して国フィールドを開かない
      if (candidates.length === 1 && !item.country) {
        item.country = candidates[0].en
        if (countryACState[key]) {
          countryACState[key].text = candidates[0].ja
          countryACState[key].suggestions = []
        }
      }
    } catch {
      cityCountryCandidates[key] = null
    }
  }, 800)
}

const countryACState = reactive({})

function countryDisplayText(key, item) {
  const st = countryACState[key]
  if (st !== undefined) return st.text
  return item.country ? (countryNamesJa[item.country] || item.country) : ''
}

function onCountryInput(key, item, value) {
  if (!countryACState[key]) countryACState[key] = { text: '', open: false, suggestions: [] }
  countryACState[key].text = value
  countryACState[key].open = true
  item.country = ''
  if (!value.trim()) { countryACState[key].suggestions = []; return }
  const q = value.trim().toLowerCase()
  countryACState[key].suggestions = COUNTRY_LIST
    .filter(c => c.ja.toLowerCase().includes(q) || c.en.toLowerCase().includes(q))
    .slice(0, 8)
}

function onCountryFocus(key, item) {
  if (!countryACState[key]) {
    countryACState[key] = { text: item.country ? (countryNamesJa[item.country] || item.country) : '', open: true, suggestions: [] }
  } else {
    countryACState[key].open = true
  }
  const q = countryACState[key].text.trim().toLowerCase()
  if (q) {
    countryACState[key].suggestions = COUNTRY_LIST
      .filter(c => c.ja.toLowerCase().includes(q) || c.en.toLowerCase().includes(q))
      .slice(0, 8)
  }
  // 候補がなくて都市名があれば即時取得
  if (!cityCountryCandidates[key] && item.name?.trim()) {
    onCityNameInput(key, item)
  }
}

function onCountryBlur(key) {
  setTimeout(() => { if (countryACState[key]) countryACState[key].open = false }, 150)
}

function selectCountry(key, item, s) {
  item.country = s.en
  if (countryACState[key]) {
    countryACState[key].text = s.ja
    countryACState[key].open = false
    countryACState[key].suggestions = []
  }
}




</script>

<style scoped>
/* ── オーバーレイ ─────────────────────────────── */
.pe-overlay {
  position: fixed;
  inset: 0;
  background: rgba(32, 33, 36, 0.5);
  z-index: 300;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: env(safe-area-inset-top, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
}

.pe-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: min(860px, 92vw);
  height: calc(min(88vh, 840px) - env(safe-area-inset-top, 0px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-3);
}

/* ── ヘッダー ─────────────────────────────────── */
.pe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 8px;
}
.pe-header h2 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text);
  font-weight: 500;
}
.pe-header-name-input {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: var(--text);
  font-size: 1.1rem;
  font-weight: 600;
  padding: 2px 4px;
  min-width: 0;
  outline: none;
  transition: border-color 0.15s;
}
.pe-header-name-input:hover,
.pe-header-name-input:focus { border-bottom-color: var(--accent); }
.pe-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pe-status {
  font-size: 0.78rem;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
}
.pe-status.saved    { color: var(--success); }
.pe-status.saving   { color: var(--text-muted); }
.pe-status.error    { color: var(--danger); }
.pe-status.external { color: var(--accent); }
.pe-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.3rem;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
}
.pe-close-btn:hover { color: var(--text); background: var(--bg-hover); }
.pe-editor-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  object-fit: cover;
}
.pe-editor-name {
  font-size: 0.75rem;
  color: var(--accent);
}

.pe-error {
  background: #fce8e6;
  border-left: 3px solid var(--danger);
  color: var(--danger);
  font-size: 0.78rem;
  padding: 6px 16px;
  flex-shrink: 0;
}


/* ── ボディ ───────────────────────────────────── */
.pe-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* サイドバー */
.pe-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 10px 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pe-set-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  color: var(--text-secondary);
  font-size: 0.82rem;
  border: 1px solid transparent;
}
.pe-set-tab:hover { background: var(--bg-hover); }
.pe-set-tab.active {
  background: var(--bg-selected);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
}
.pe-set-tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-add-set-btn {
  margin-top: 4px;
  background: none;
  border: 1px dashed var(--border);
  color: var(--accent);
  border-radius: 6px;
  padding: 6px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  text-align: center;
}
.pe-add-set-btn:hover { border-color: var(--accent); background: var(--bg-selected); }

/* コンテンツ */
.pe-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pe-no-set {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  font-size: 0.9rem;
}

/* フィールド行 */
.pe-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pe-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 52px;
}
.pe-label-sm {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.pe-input {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  padding: 5px 8px;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}
.pe-input:focus { border-color: var(--accent); }
.pe-input-wide { width: 100%; box-sizing: border-box; }

/* プランセクション */
.pe-plans-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pe-plan {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.pe-plan-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-subtle);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.pe-plan-bar:hover { background: var(--bg-hover); }
.pe-plan-arrow { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
.pe-plan-name {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 500;
  outline: none;
  padding: 2px 4px;
  min-width: 0;
  cursor: text;
  transition: border-color 0.2s;
}
.pe-plan-name:focus { border-bottom-color: var(--accent); }
.pe-color-picker {
  width: 28px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px;
  background: var(--bg-input);
  cursor: pointer;
  flex-shrink: 0;
}
.pe-nights-row {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.pe-nights-input {
  width: 44px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 3px 4px;
  font-size: 0.8rem;
  outline: none;
  text-align: right;
}
.pe-nights-input:focus { border-color: var(--accent); }
.pe-plan-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* アイコンボタン共通 */
.pe-icon-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--accent);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.75rem;
  cursor: pointer;
  line-height: 1.4;
  transition: background 0.15s;
}
.pe-icon-btn:hover:not(:disabled) { background: var(--bg-selected); }
.pe-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pe-icon-btn.del { border-color: #f3c0bc; color: var(--danger); }
.pe-icon-btn.del:hover:not(:disabled) { background: #fce8e6; }
.pe-icon-btn.sm { padding: 1px 5px; font-size: 0.7rem; }

/* タイムライン */
.pe-timeline {
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-app);
}

/* バッジ */
.pe-badge {
  font-size: 0.62rem;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}
.pe-badge.city      { background: var(--accent-soft); color: var(--accent); border: 1px solid var(--border); }
.pe-badge.transport { background: #e6f4ea;  color: var(--success); border: 1px solid var(--border); }

/* 都市カード */
.pe-city-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pe-city-main {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pe-city-name-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 3px 6px;
  font-size: 0.85rem;
  outline: none;
  min-width: 0;
}
.pe-city-name-input:focus { border-color: var(--accent); }
.pe-city-nights {
  width: 40px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  padding: 3px 4px;
  font-size: 0.8rem;
  outline: none;
  text-align: right;
}
.pe-city-nights:focus { border-color: var(--accent); }
.pe-item-btns { display: flex; gap: 2px; flex-shrink: 0; }

.pe-city-sub {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pe-sub-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 28px;
}
.pe-sub-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 2px 6px;
  font-size: 0.78rem;
  outline: none;
}
.pe-sub-input:focus { border-color: var(--accent); }

/* 都市名エリア（都市名 + 国横並び） */
.pe-city-name-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pe-city-country-row {
  display: flex;
  align-items: center;
}
.pe-country-wrap {
  position: relative;
  flex: 1;
}
.pe-country-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 2px 6px;
  font-size: 0.72rem;
  outline: none;
}
.pe-country-input:focus { border-color: var(--accent); color: var(--text); }
.pe-country-input::placeholder { color: var(--text-faint); }
.pe-country-input.is-loading { color: var(--text-faint); font-style: italic; }
.pe-country-section-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  padding: 4px 10px 2px;
  letter-spacing: 0.03em;
}
.pe-country-divider {
  border-top: 1px solid var(--border);
  margin: 3px 0;
}
.pe-country-candidate {
  color: var(--accent);
  font-weight: 500;
}
.pe-country-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  z-index: 500;
  max-height: 180px;
  overflow-y: auto;
  margin-top: 2px;
  box-shadow: var(--shadow-2);
}
.pe-country-option {
  padding: 5px 10px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.1s;
}
.pe-country-option:hover { background: var(--bg-selected); color: var(--accent); }
.pe-spots-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  user-select: none;
  transition: background 0.15s;
}
.pe-spots-toggle:hover { background: var(--bg-hover); }
.pe-spots-arrow { font-size: 0.65rem; }
.pe-spot-row {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 3px 0 0 4px;
}
.pe-spot-name, .pe-spot-url, .pe-spot-memo {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-secondary);
  padding: 2px 5px;
  font-size: 0.75rem;
  outline: none;
}
.pe-spot-name:focus, .pe-spot-url:focus, .pe-spot-memo:focus { border-color: var(--accent); }
.pe-spot-name { flex: 1.2; min-width: 0; }
.pe-spot-url  { flex: 1.5; min-width: 0; }
.pe-spot-memo { flex: 1;   min-width: 0; }

/* 移動カード */
.pe-transport-card {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  background: #f2f8f4;
  border: 1px solid #cbe5d3;
  border-radius: 6px;
  padding: 6px 8px;
}
.pe-transport-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.pe-tr-selects {
  display: flex;
  gap: 4px;
}
.pe-tr-select {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 3px 6px;
  font-size: 0.78rem;
  outline: none;
  cursor: pointer;
  flex: 1;
}
.pe-tr-select:focus { border-color: var(--accent); }
.pe-tr-inputs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.pe-tr-main, .pe-tr-url, .pe-tr-memo {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 3px 6px;
  font-size: 0.78rem;
  outline: none;
}
.pe-tr-main:focus, .pe-tr-url:focus, .pe-tr-memo:focus { border-color: var(--accent); }
.pe-tr-main { flex: 2; min-width: 120px; }
.pe-tr-url  { flex: 1.5; min-width: 100px; }
.pe-tr-memo { flex: 1;   min-width: 80px;  }

/* 追加ボタン */
.pe-add-row {
  display: flex;
  gap: 6px;
  padding-top: 2px;
}
.pe-add-btn {
  background: none;
  border: 1px dashed var(--border);
  color: var(--accent);
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.pe-add-btn:hover { border-color: var(--accent); background: var(--bg-selected); }
.pe-add-btn.sm    { padding: 2px 8px; font-size: 0.7rem; }
.add-plan-btn     { align-self: flex-start; }

/* ── ドラッグハンドル ──────────────────────────── */
.pe-drag-handle {
  cursor: grab;
  color: var(--text-faint);
  font-size: 0.95rem;
  padding: 0 4px;
  flex-shrink: 0;
  user-select: none;
  touch-action: none;
  line-height: 1;
}
.pe-drag-handle:active { cursor: grabbing; }
.pe-plan.dnd-over,
.pe-city-card.dnd-over,
.pe-transport-card.dnd-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.pe-plan.dnd-dragging,
.pe-city-card.dnd-dragging,
.pe-transport-card.dnd-dragging {
  opacity: 0.35;
}
</style>
