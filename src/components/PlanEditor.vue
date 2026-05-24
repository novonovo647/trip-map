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
        <h2 v-else>✏ プランを編集</h2>
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
                        <input v-model="item.name" placeholder="都市名" class="pe-city-name-input" />
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
                        <input v-model="item.transport" placeholder="移動手段（例: TK 198）" class="pe-tr-main" />
                        <input v-model="item.url"       placeholder="URL（任意）"             class="pe-tr-url"  />
                        <input v-model="item.memo"      placeholder="メモ（任意）"             class="pe-tr-memo" />
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
  plan.cities.push({ transport: '', url: '', memo: '' })
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


</script>

<style scoped>
/* ── オーバーレイ ─────────────────────────────── */
.pe-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.pe-panel {
  background: #1a2d40;
  border: 1px solid #4a7a9b;
  border-radius: 12px;
  width: min(1080px, 96vw);
  height: min(88vh, 840px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.65);
}

/* ── ヘッダー ─────────────────────────────────── */
.pe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 10px;
  border-bottom: 1px solid #2d4a6a;
  flex-shrink: 0;
  gap: 8px;
}
.pe-header h2 {
  margin: 0;
  font-size: 1.05rem;
  color: #e0e0e0;
}
.pe-header-name-input {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: #e0e0e0;
  font-size: 1.1rem;
  font-weight: 600;
  padding: 2px 4px;
  min-width: 0;
  outline: none;
  transition: border-color 0.15s;
}
.pe-header-name-input:hover,
.pe-header-name-input:focus { border-bottom-color: #4a7a9b; }
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
.pe-status.saved    { color: #7ad47a; }
.pe-status.saving   { color: #aaa; }
.pe-status.error    { color: #ff8888; }
.pe-status.external { color: #7ab8d4; }
.pe-close-btn {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 1.3rem;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
}
.pe-close-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
.pe-editor-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid #7ab8d4;
  object-fit: cover;
}
.pe-editor-name {
  font-size: 0.75rem;
  color: #7ab8d4;
}

.pe-error {
  background: rgba(200, 50, 50, 0.15);
  border-left: 3px solid #e63946;
  color: #ff8888;
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
  border-right: 1px solid #2d4a6a;
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
  color: #bbb;
  font-size: 0.82rem;
  border: 1px solid transparent;
}
.pe-set-tab:hover { background: #1e3352; }
.pe-set-tab.active {
  background: #2d4a6a;
  color: #eee;
  border-color: #4a7a9b;
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
  border: 1px dashed #2d4a6a;
  color: #4a7a9b;
  border-radius: 6px;
  padding: 6px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  text-align: center;
}
.pe-add-set-btn:hover { border-color: #7ab3d4; color: #7ab3d4; }

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
  color: #446;
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
  color: #7ab3d4;
  white-space: nowrap;
  min-width: 52px;
}
.pe-label-sm {
  font-size: 0.72rem;
  color: #7ab3d4;
  white-space: nowrap;
}
.pe-input {
  background: #0d1b2a;
  border: 1px solid #2d4a6a;
  border-radius: 5px;
  color: #e0e0e0;
  padding: 5px 8px;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}
.pe-input:focus { border-color: #4a7a9b; }
.pe-input-wide { width: 100%; box-sizing: border-box; }

/* プランセクション */
.pe-plans-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pe-plan {
  border: 1px solid #2d4a6a;
  border-radius: 8px;
  overflow: hidden;
}
.pe-plan-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #0f2030;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.pe-plan-bar:hover { background: #142a40; }
.pe-plan-arrow { font-size: 0.7rem; color: #4a7a9b; flex-shrink: 0; }
.pe-plan-name {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: #e0e0e0;
  font-size: 0.88rem;
  font-weight: 500;
  outline: none;
  padding: 2px 4px;
  min-width: 0;
  cursor: text;
  transition: border-color 0.2s;
}
.pe-plan-name:focus { border-bottom-color: #4a7a9b; }
.pe-color-picker {
  width: 28px;
  height: 22px;
  border: 1px solid #2d4a6a;
  border-radius: 4px;
  padding: 1px;
  background: #0d1b2a;
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
  background: #0d1b2a;
  border: 1px solid #2d4a6a;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 3px 4px;
  font-size: 0.8rem;
  outline: none;
  text-align: right;
}
.pe-nights-input:focus { border-color: #4a7a9b; }
.pe-plan-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* アイコンボタン共通 */
.pe-icon-btn {
  background: none;
  border: 1px solid #2d4a6a;
  color: #7ab3d4;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.75rem;
  cursor: pointer;
  line-height: 1.4;
  transition: background 0.15s;
}
.pe-icon-btn:hover:not(:disabled) { background: #2d4a6a; }
.pe-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pe-icon-btn.del { border-color: #4a2a2a; color: #e66; }
.pe-icon-btn.del:hover:not(:disabled) { background: rgba(200, 60, 60, 0.15); }
.pe-icon-btn.sm { padding: 1px 5px; font-size: 0.7rem; }

/* タイムライン */
.pe-timeline {
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #0d1b2a;
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
.pe-badge.city      { background: rgba(74,122,155,0.25); color: #7ab3d4; border: 1px solid #2d4a6a; }
.pe-badge.transport { background: rgba(80,160,80,0.18);  color: #7ad47a; border: 1px solid #2d4a6a; }

/* 都市カード */
.pe-city-card {
  background: #0f2030;
  border: 1px solid #2d4a6a;
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
  background: #0d1b2a;
  border: 1px solid #1a3a50;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 3px 6px;
  font-size: 0.85rem;
  outline: none;
  min-width: 0;
}
.pe-city-name-input:focus { border-color: #4a7a9b; }
.pe-city-nights {
  width: 40px;
  background: #0d1b2a;
  border: 1px solid #1a3a50;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 3px 4px;
  font-size: 0.8rem;
  outline: none;
  text-align: right;
}
.pe-city-nights:focus { border-color: #4a7a9b; }
.pe-item-btns { display: flex; gap: 2px; flex-shrink: 0; }

.pe-city-sub {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pe-sub-label {
  font-size: 0.68rem;
  color: #4a7a9b;
  white-space: nowrap;
  min-width: 28px;
}
.pe-sub-input {
  flex: 1;
  background: #0d1b2a;
  border: 1px solid #1a3a50;
  border-radius: 4px;
  color: #ccc;
  padding: 2px 6px;
  font-size: 0.78rem;
  outline: none;
}
.pe-sub-input:focus { border-color: #4a7a9b; }

/* スポット */
.pe-spots-section { padding-top: 2px; }
.pe-spots-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #4a7a9b;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  user-select: none;
  transition: background 0.15s;
}
.pe-spots-toggle:hover { background: rgba(74, 122, 155, 0.1); }
.pe-spots-arrow { font-size: 0.65rem; }
.pe-spot-row {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 3px 0 0 4px;
}
.pe-spot-name, .pe-spot-url, .pe-spot-memo {
  background: #0d1b2a;
  border: 1px solid #1a3a50;
  border-radius: 3px;
  color: #ccc;
  padding: 2px 5px;
  font-size: 0.75rem;
  outline: none;
}
.pe-spot-name:focus, .pe-spot-url:focus, .pe-spot-memo:focus { border-color: #4a7a9b; }
.pe-spot-name { flex: 1.2; min-width: 0; }
.pe-spot-url  { flex: 1.5; min-width: 0; }
.pe-spot-memo { flex: 1;   min-width: 0; }

/* 移動カード */
.pe-transport-card {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  background: #091a10;
  border: 1px solid #1e3a1e;
  border-radius: 6px;
  padding: 6px 8px;
}
.pe-transport-fields {
  flex: 1;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}
.pe-tr-main, .pe-tr-url, .pe-tr-memo {
  background: #0d1b2a;
  border: 1px solid #1a3a50;
  border-radius: 4px;
  color: #ccc;
  padding: 3px 6px;
  font-size: 0.78rem;
  outline: none;
}
.pe-tr-main:focus, .pe-tr-url:focus, .pe-tr-memo:focus { border-color: #4a7a9b; }
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
  border: 1px dashed #2d4a6a;
  color: #4a7a9b;
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.pe-add-btn:hover { border-color: #7ab3d4; color: #7ab3d4; }
.pe-add-btn.sm    { padding: 2px 8px; font-size: 0.7rem; }
.add-plan-btn     { align-self: flex-start; }

/* ── ドラッグハンドル ──────────────────────────── */
.pe-drag-handle {
  cursor: grab;
  color: #3a5a7a;
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
  outline: 2px solid #4a7a9b;
  outline-offset: -2px;
}
.pe-plan.dnd-dragging,
.pe-city-card.dnd-dragging,
.pe-transport-card.dnd-dragging {
  opacity: 0.35;
}
</style>
