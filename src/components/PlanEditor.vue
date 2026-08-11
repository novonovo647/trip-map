<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="pe-panel">

      <!-- ヘッダー -->
      <div class="pe-header">
        <h2 v-if="singlePlan">✎ コースを編集</h2>
        <input
          v-else-if="singleSetIndex !== null"
          class="pe-header-name-input"
          v-model="data[singleSetIndex].setName"
          placeholder="プラン名"
        />
        <h2 v-else>✎ プランを編集</h2>
        <div class="pe-header-actions">
          <span v-if="saveStatus !== 'idle'" class="save-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失敗' : saveStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
          </span>
          <!-- 他ユーザーが編集中のアイコン -->
          <template v-if="editorInfo && saveStatus === 'external'">
            <img v-if="editorInfo.photo" :src="editorInfo.photo" class="editor-avatar" :title="editorInfo.name" referrerpolicy="no-referrer" />
            <span v-else class="editor-name">{{ editorInfo.name }}</span>
          </template>
          <button class="pe-close-btn" @click="handleClose" title="閉じる">✕</button>
        </div>
      </div>
      <div v-if="saveError" class="modal-error">{{ saveError }}</div>

      <!-- ボディ: サイドバー + コンテンツ -->
      <div class="pe-body">

        <!-- サイドバー: コース一覧 -->
        <div class="pe-sidebar" v-if="singleSetIndex === null && !singlePlan">
          <div
            v-for="(ps, si) in data"
            :key="si"
            class="pe-set-tab"
            :class="{ active: activeSet === si }"
            @click="selectSet(si)"
          >
            <span class="pe-set-tab-name">{{ ps.setName || '（名称なし）' }}</span>
            <button class="icon-btn danger sm" @click.stop="deleteSet(si)" title="このプランを削除">🗑</button>
          </div>
          <button class="pe-add-set-btn" @click="addSet">＋ プラン追加</button>
        </div>

        <!-- コンテンツ: 選択中のコースを編集 -->
        <div class="pe-content" v-if="activeSet !== null && data[activeSet]">

          <!-- プラン名 -->
          <div class="pe-field-row" v-if="singleSetIndex === null && !singlePlan">
            <label class="pe-label">プラン名</label>
            <input class="pe-input pe-input-wide" v-model="data[activeSet].setName" placeholder="プラン名を入力" />
          </div>

          <!-- プラン一覧 -->
          <div class="pe-plans-section">
            <template v-for="{ plan, pi } in displayPlans" :key="pi">
              <div
                class="pe-plan"
                data-item-type="plan"
                :data-pi="pi"
                :class="{
                  'dnd-over': dragOverPlanInfo?.pi === pi && dragPlanInfo?.pi !== pi,
                  'dnd-dragging': dragPlanInfo?.pi === pi,
                  'dnd-city-target': dragCityInfo && dragOverCityInfo?.pi === pi && dragOverCityInfo?.ci === -1
                }"
              >

                <!-- プランヘッダー -->
                <div class="pe-plan-bar" @click="togglePlan(pi)">
                  <span class="pe-drag-handle" @pointerdown.prevent="startPlanDrag($event, pi)" @click.stop>⠿</span>
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
                    <button class="icon-btn sm" @click="toggleAllItems(pi, plan)" title="都市・移動をすべて開閉">
                      {{ plan.cities.every((_, ci) => isItemOpen(pi, ci)) ? '⊟' : '⊞' }}
                    </button>
                    <button v-if="!singlePlan" class="icon-btn danger sm" @click="deletePlan(pi)" title="コースを削除">🗑</button>
                    <button class="icon-btn toggle sm" @click.stop="togglePlan(pi)">{{ openPlan[pi] ? '▾' : '▸' }}</button>
                  </div>
                </div>

                <!-- 都市・移動タイムライン -->
                <div v-if="openPlan[pi]" class="pe-timeline">
                  <template v-for="(item, ci) in plan.cities" :key="ci">

                    <!-- 都市 -->
                    <div
                      v-if="isCity(item)"
                      class="pe-item-card pe-city-card"
                      data-item-type="city"
                      :data-pi="pi"
                      :data-ci="ci"
                      :class="{
                        'dnd-over': dragOverCityInfo?.pi === pi && dragOverCityInfo?.ci === ci && dragCityInfo?.ci !== ci,
                        'dnd-dragging': dragCityInfo?.pi === pi && dragCityInfo?.ci === ci
                      }"
                    >
                      <span class="pe-drag-handle" @pointerdown.prevent="startCityDrag($event, pi, ci)" @click.stop>⠿</span>
                      <span class="pe-badge city">都市</span>
                      <div class="pe-item-main">
                        <div class="pe-city-name-wrap">
                          <input v-model="item.name" placeholder="都市名" class="pe-city-name-input" />
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
                                  (hasCands(`${pi}-${ci}`) ||
                                   countryACState[`${pi}-${ci}`]?.suggestions?.length)"
                                class="pe-country-dropdown"
                              >
                                <template v-if="hasCands(`${pi}-${ci}`)">
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
                                  <div v-if="hasCands(`${pi}-${ci}`)" class="pe-country-section-label">すべての国</div>
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
                          <button class="icon-btn sm danger" @click="deleteItem(plan.cities, ci)" title="削除">🗑</button>
                          <button class="icon-btn toggle sm" @click.stop="toggleItem(pi, ci)">{{ isItemOpen(pi, ci) ? '▾' : '▸' }}</button>
                        </div>
                      </div>
                      <div v-if="isItemOpen(pi, ci)" class="pe-item-details">
                        <textarea v-model="item.memo" :placeholder="PLACEHOLDER.MEMO" class="pe-sub-input pe-sub-textarea" rows="2"></textarea>
                      <!-- ホテル -->
                      <div class="pe-hotels-section">
                        <div class="pe-spots-toggle" @click="toggleHotels(pi, ci)">
                          <span>🏨 ホテル ({{ (item.hotels || []).length }}件)</span>
                          <button class="icon-btn toggle sm">{{ openHotels[`${pi}-${ci}`] ? '▾' : '▸' }}</button>
                        </div>
                        <template v-if="openHotels[`${pi}-${ci}`]">
                          <div v-for="(hotel, hi) in ensureHotels(item)" :key="hi" class="pe-hotel-row">
                            <div class="pe-hotel-main">
                              <input v-model="hotel.name" placeholder="ホテル名" class="pe-hotel-name" />
                              <input type="number" v-model.number="hotel.nights" min="0" placeholder="泊" class="pe-hotel-nights" />
                              <input type="number" v-model.number="hotel.price" min="0" placeholder="料金(円)" class="pe-hotel-price" />
                              <input v-model="hotel.url"  :placeholder="PLACEHOLDER.URL"  class="pe-hotel-url"  />
                              <button class="icon-btn sm danger" @click="deleteHotel(item, hi)" title="削除">🗑</button>
                            </div>
                            <textarea v-model="hotel.memo" :placeholder="PLACEHOLDER.MEMO" class="pe-hotel-memo pe-sub-textarea" rows="2"></textarea>
                          </div>
                          <button class="pe-add-btn sm" @click="addHotel(item)">＋ ホテルを追加</button>
                        </template>
                      </div>
                      <!-- 観光スポット -->
                      <div class="pe-spots-section">
                        <div class="pe-spots-toggle" @click="toggleSpots(pi, ci)">
                          <span>📍 観光スポット ({{ (item.spots || []).length }}件)</span>
                          <button class="icon-btn toggle sm">{{ openSpots[`${pi}-${ci}`] ? '▾' : '▸' }}</button>
                        </div>
                        <template v-if="openSpots[`${pi}-${ci}`]">
                          <div v-for="(spot, spi) in ensureSpots(item)" :key="spi" class="pe-spot-row">
                            <div class="pe-spot-main">
                              <input v-model="spot.name" placeholder="スポット名" class="pe-spot-name" />
                              <input v-model="spot.url"  :placeholder="PLACEHOLDER.URL"  class="pe-spot-url"  />
                              <button class="icon-btn sm danger" @click="deleteSpot(item, spi)" title="削除">🗑</button>
                            </div>
                            <textarea v-model="spot.memo" :placeholder="PLACEHOLDER.MEMO" class="pe-spot-memo pe-sub-textarea" rows="2"></textarea>
                          </div>
                          <button class="pe-add-btn sm" @click="addSpot(item)">＋ スポットを追加</button>
                        </template>
                      </div>
                      </div>
                    </div>

                    <!-- 移動手段 -->
                    <div
                      v-else
                      class="pe-item-card pe-transport-card"
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
                      <div class="pe-item-main">
                        <input v-model="item.transport" placeholder="便名・路線名（任意）" class="pe-tr-main" />
                        <select v-model="item.mode" class="pe-tr-select">
                          <option v-for="m in TRANSPORT_MODES" :key="m.value" :value="m.value">{{ m.emoji }} {{ m.label }}</option>
                        </select>
                        <select v-model="item.ticketType" class="pe-tr-select">
                          <option v-for="t in TICKET_TYPES" :key="t.value" :value="t.value">{{ t.value }}</option>
                        </select>
                        <div class="pe-item-btns">
                          <button class="icon-btn sm danger" @click="deleteItem(plan.cities, ci)" title="削除">🗑</button>
                          <button class="icon-btn toggle sm" @click.stop="toggleItem(pi, ci)">{{ isItemOpen(pi, ci) ? '▾' : '▸' }}</button>
                        </div>
                      </div>
                      <div v-if="isItemOpen(pi, ci)" class="pe-item-details">
                        <input type="number" v-model.number="item.price" min="0" placeholder="料金（円）" class="pe-tr-price" />
                        <input v-model="item.url"       :placeholder="PLACEHOLDER.URL"       class="pe-tr-url"  />
                        <textarea v-model="item.memo" :placeholder="PLACEHOLDER.MEMO" class="pe-tr-memo pe-sub-textarea" rows="2"></textarea>
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

          <button v-if="!singlePlan" class="pe-add-btn add-plan-btn" @click="addPlan">＋ コースを追加</button>
        </div>

        <div v-else-if="singleSetIndex === null && !singlePlan" class="pe-no-set">
          プランを選択または追加してください
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { isCity } from '../utils/plan.js'
import { TRANSPORT_MODES, TICKET_TYPES, DEFAULT_MODE, DEFAULT_TICKET } from '../utils/transport.js'
import { PLACEHOLDER } from '../utils/labels.js'
import { useGeocoding } from '../composables/useGeocoding.js'
import { usePlanPersistence } from '../composables/usePlanPersistence.js'
import countryNamesJa from '../assets/country_names_ja.json'

const COUNTRY_LIST = Object.entries(countryNamesJa).map(([en, ja]) => ({ en, ja }))

// 地図描画と共有する都市キャッシュ（localStorage + Firestore geodata）
const { cityData, geocodeCityNames } = useGeocoding()

const props = defineProps({
  initialData:    { type: Array,  required: true },
  externalData:   { type: Array,  default: null },
  editorInfo:     { type: Object, default: null },
  singleSetIndex: { type: Number, default: null },
  singlePlan:     { type: Object, default: null },   // { si, pi } 単一コース編集
})

const emit = defineEmits(['close'])

// 元データを破壊しないようディープコピーで作業
const data = reactive(JSON.parse(JSON.stringify(props.initialData)))

const activeSet = ref(
  props.singlePlan ? props.singlePlan.si
  : props.singleSetIndex !== null ? props.singleSetIndex
  : (data.length > 0 ? 0 : null)
)

// 外部更新の反映後に activeSet を追従（対象が消えたら閉じる）
function applyExternalActiveSet() {
  if (props.singlePlan) {
    if (props.singlePlan.si < data.length && props.singlePlan.pi < (data[props.singlePlan.si]?.plans.length ?? 0)) {
      activeSet.value = props.singlePlan.si
    } else {
      emit('close')
    }
  } else if (props.singleSetIndex !== null) {
    if (props.singleSetIndex < data.length) {
      activeSet.value = props.singleSetIndex
    } else {
      emit('close')
    }
  } else if (activeSet.value !== null && activeSet.value >= data.length) {
    activeSet.value = data.length > 0 ? 0 : null
  }
}

// ── 自動保存 ──────────────────────────────────────
const { saveStatus, saveError, handleClose } = usePlanPersistence(data, {
  getExternalData: () => props.externalData,
  serialize: buildCleanedData,
  onExternalApply: applyExternalActiveSet,
  emitClose: () => emit('close'),
})

function buildCleanedData() {
  const cleaned = JSON.parse(JSON.stringify(data))
  cleaned.forEach(ps => {
    ps.plans.forEach(plan => {
      if (!plan.nights && plan.nights !== 0) plan.nights = null
      // 都市・移動エントリーとも無条件で保持（意図的に追加した行を保存時に消さない）
      plan.cities.forEach(item => {
        if (isCity(item)) {
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
          if (item.hotels) {
            item.hotels = item.hotels.filter(h => h.name?.trim())
            item.hotels.forEach(h => {
              if (!h.nights && h.nights !== 0) delete h.nights
              if (h.price === '' || h.price === null || h.price === undefined) delete h.price
              if (!h.url?.trim())  delete h.url
              if (!h.memo?.trim()) delete h.memo
            })
            if (item.hotels.length === 0) delete item.hotels
          }
        } else {
          if (!item.url?.trim())  delete item.url
          if (!item.memo?.trim()) delete item.memo
          if (item.price === '' || item.price === null || item.price === undefined) delete item.price
        }
      })
    })
  })
  return cleaned
}

const openPlan  = ref({})   // { [pi]: boolean }
const openSpots = ref({})   // { [`${pi}-${ci}`]: boolean }
const openHotels = ref({})  // { [`${pi}-${ci}`]: boolean }
const openItem  = ref({})   // { [`${pi}-${ci}`]: boolean } 都市・移動の開閉（未設定は開扱い）

// 表示対象のコース（単一コースモードは対象の1つのみ）
const displayPlans = computed(() => {
  if (activeSet.value === null || !data[activeSet.value]) return []
  const plans = data[activeSet.value].plans
  if (props.singlePlan) {
    const p = plans[props.singlePlan.pi]
    return p ? [{ plan: p, pi: props.singlePlan.pi }] : []
  }
  return plans.map((plan, pi) => ({ plan, pi }))
})

// ── ポインタ D&D ─────────────────────────────
const dragPlanInfo      = ref(null)  // { pi } | null
const dragOverPlanInfo  = ref(null)  // { pi } | null
const dragCityInfo      = ref(null)  // { pi, ci } | null
const dragOverCityInfo  = ref(null)  // { pi, ci } | null

// 最初のプランを開いた状態にする
if (props.singlePlan) {
  openPlan.value[props.singlePlan.pi] = true
} else if (data.length > 0 && data[0].plans.length > 0) {
  openPlan.value[0] = true
}

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

function toggleHotels(pi, ci) {
  const key = `${pi}-${ci}`
  openHotels.value[key] = !openHotels.value[key]
}

function isItemOpen(pi, ci) {
  return openItem.value[`${pi}-${ci}`] !== false   // 既定は開いた状態
}

function toggleItem(pi, ci) {
  openItem.value[`${pi}-${ci}`] = !isItemOpen(pi, ci)
}

function toggleAllItems(pi, plan) {
  const next = !plan.cities.every((_, ci) => isItemOpen(pi, ci))
  plan.cities.forEach((_, ci) => { openItem.value[`${pi}-${ci}`] = next })
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
    // 都市/移動カード上なら、そのコース・位置を対象にする（コースをまたいでOK）
    const cardEl = _hitEl(ev, '[data-item-type="city"]')
    if (cardEl) {
      const elPi = parseInt(cardEl.dataset.pi)
      const elCi = parseInt(cardEl.dataset.ci)
      if (!isNaN(elPi) && !isNaN(elCi)) dragOverCityInfo.value = { pi: elPi, ci: elCi }
      return
    }
    // カード外＝コース本体上なら末尾へ挿入（空コース対応）
    const planEl = _hitEl(ev, '[data-item-type="plan"]')
    if (planEl) {
      const elPi = parseInt(planEl.dataset.pi)
      if (!isNaN(elPi)) dragOverCityInfo.value = { pi: elPi, ci: -1 }
    }
  }
  const onUp = () => {
    _endGhost()
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    const src = dragCityInfo.value
    const tgt = dragOverCityInfo.value
    dragCityInfo.value     = null
    dragOverCityInfo.value = null
    if (!src || !tgt) return
    if (src.pi === tgt.pi && src.ci === tgt.ci) return
    const plans = data[activeSet.value].plans
    const [item] = plans[src.pi].cities.splice(src.ci, 1)
    let insertCi = tgt.ci
    if (insertCi === -1) insertCi = plans[tgt.pi].cities.length
    else if (src.pi === tgt.pi && src.ci < insertCi) insertCi -= 1
    plans[tgt.pi].cities.splice(insertCi, 0, item)
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

// ── 都市・移動 CRUD ─────────────────────────────
function addCity(plan) {
  plan.cities.push({ name: '', nights: null, memo: '', spots: [] })
}

function addTransport(plan) {
  plan.cities.push({ transport: '', url: '', memo: '', price: null, ticketType: DEFAULT_TICKET, mode: DEFAULT_MODE })
}

function deleteItem(cities, ci) {
  cities.splice(ci, 1)
}

// ── スポット CRUD ───────────────────────────────
function addSpot(cityItem) {
  if (!cityItem.spots) cityItem.spots = []
  cityItem.spots.push({ name: '', url: '', memo: '' })
}

function deleteSpot(cityItem, spi) {
  cityItem.spots.splice(spi, 1)
}

// ── ホテル CRUD ─────────────────────
function ensureHotels(item) {
  if (!item.hotels) item.hotels = []
  return item.hotels
}

function addHotel(cityItem) {
  if (!cityItem.hotels) cityItem.hotels = []
  cityItem.hotels.push({ name: '', nights: null, price: null, url: '', memo: '' })
}

function deleteHotel(cityItem, hi) {
  cityItem.hotels.splice(hi, 1)
}

// ── 国オートコンプリート ──────────────────────────

// 都市名に対応する候補国: key→[{en,ja}] | 'loading' | null
const cityCountryCandidates = reactive({})
const _lastQueriedName = {}   // key→ 直近に問い合わせた都市名（同名の再取得を防ぐ）

// 候補が配列（実データ）として存在するか。'loading' 文字列を length で誤判定しないためのガード
function hasCands(key) {
  const c = cityCountryCandidates[key]
  return Array.isArray(c) && c.length > 0
}

// 取得済みの英語国名を候補として反映（未選択なら自動選択）
function applyCountryCandidate(key, item, en) {
  const cand = { en, ja: countryNamesJa[en] || en }
  cityCountryCandidates[key] = [cand]
  if (!item.country) {
    item.country = en
    if (countryACState[key]) {
      countryACState[key].text = cand.ja
      countryACState[key].suggestions = []
    }
  }
}

// 国フィールドを開いたときに、都市キャッシュ優先で候補国を取得する
async function fetchCityCountries(key, item) {
  const name = item.name?.trim()
  if (!name) { cityCountryCandidates[key] = null; return }
  // 地図描画で取得済みのキャッシュがあれば即反映（Nominatim を叩かない）
  const cached = cityData[name]?.country
  if (cached) { applyCountryCandidate(key, item, cached); return }
  // 同じ都市名で取得済みなら再取得しない
  if (_lastQueriedName[key] === name && cityCountryCandidates[key] && cityCountryCandidates[key] !== 'loading') return
  _lastQueriedName[key] = name
  cityCountryCandidates[key] = 'loading'
  await geocodeCityNames([name])   // 座標・国名を取得し localStorage/Firestore に共有キャッシュ
  const country = cityData[name]?.country
  if (country) applyCountryCandidate(key, item, country)
  else { cityCountryCandidates[key] = []; _lastQueriedName[key] = null }
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
  // 国フィールドを開いたら、現在の都市名で候補を取得する
  if (item.name?.trim()) {
    fetchCityCountries(key, item)
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
.modal-overlay { z-index: var(--z-modal-front); }

.pe-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: var(--modal-width);
  max-height: var(--modal-height);
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
.pe-badge.transport { background: var(--success-soft);  color: var(--success); border: 1px solid var(--border); }

/* 都市・移動の共通レイアウト（⠿ ｜ バッジ ｜ 本体） */
.pe-item-card {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 4px 5px;
  border-radius: 6px;
  padding: 6px 8px;
}
.pe-item-main    { grid-row: 1; grid-column: 3; display: flex; align-items: center; gap: 5px; min-width: 0; }
.pe-item-details { grid-column: 3; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pe-city-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
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
.pe-sub-textarea {
  resize: vertical;
  min-height: 2.4em;
  font-family: inherit;
  line-height: 1.4;
}

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
.pe-spot-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0 8px 4px;
  border-bottom: 1px solid var(--border);
}
.pe-spot-row:last-of-type { border-bottom: none; }
.pe-spot-main {
  display: flex;
  gap: 4px;
  align-items: center;
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
.pe-spot-memo { width: 100%; box-sizing: border-box; min-width: 0; }

/* ホテル行 */
.pe-hotel-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0 8px 4px;
  border-bottom: 1px solid var(--border);
}
.pe-hotel-row:last-of-type { border-bottom: none; }
.pe-hotel-main {
  display: flex;
  gap: 4px;
  align-items: center;
}
.pe-hotel-name, .pe-hotel-nights, .pe-hotel-price, .pe-hotel-url, .pe-hotel-memo {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-secondary);
  padding: 2px 5px;
  font-size: 0.75rem;
  outline: none;
}
.pe-hotel-name:focus, .pe-hotel-nights:focus, .pe-hotel-price:focus,
.pe-hotel-url:focus, .pe-hotel-memo:focus { border-color: var(--accent); }
.pe-hotel-name   { flex: 1.2; min-width: 0; }
.pe-hotel-nights { width: 44px; flex: none; text-align: right; }
.pe-hotel-price  { width: 74px; flex: none; text-align: right; }
.pe-hotel-url    { flex: 1.3; min-width: 0; }
.pe-hotel-memo   { width: 100%; box-sizing: border-box; min-width: 0; }

/* 移動カード */
.pe-transport-card {
  background: #f2f8f4;
  border: 1px solid #cbe5d3;
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
.pe-tr-price {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 3px 6px;
  font-size: 0.78rem;
  outline: none;
  width: 100px;
  text-align: right;
}
.pe-tr-price:focus { border-color: var(--accent); }

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
.pe-plan.dnd-city-target {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
.pe-plan.dnd-dragging,
.pe-city-card.dnd-dragging,
.pe-transport-card.dnd-dragging {
  opacity: 0.35;
}
</style>
