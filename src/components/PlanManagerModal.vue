<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="pm-panel">

      <!-- ヘッダー -->
      <div class="pm-header">
        <h2>📋 プラン管理</h2>
        <div class="pm-header-actions">
          <span v-if="saveStatus !== 'idle'" class="save-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失敗' : saveStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
          </span>
          <template v-if="editorInfo && saveStatus === 'external'">
            <img v-if="editorInfo.photo" :src="editorInfo.photo" class="editor-avatar" :title="editorInfo.name" referrerpolicy="no-referrer" />
            <span v-else class="editor-name">{{ editorInfo.name }}</span>
          </template>
          <button v-if="data.length" class="pm-mode-btn" @click="toggleAllSets">{{ allSetsCollapsed ? '⊞ すべて展開' : '⊟ すべて折りたたむ' }}</button>
          <button v-if="canEdit" class="pm-mode-btn" @click="addSet">＋ プラン追加</button>
          <button class="pm-close-btn" @click="handleClose" title="閉じる">✕</button>
        </div>
      </div>
      <div v-if="saveError" class="modal-error">{{ saveError }}</div>

      <div class="pm-body">
        <p class="pm-hint">⠿ ドラッグで移動、☆ で地図に表示</p>

        <div
          class="pm-set-none"
          :class="{ active: currentSelected === null }"
          @click="selectSet(null)"
        >未選択（地図に表示しない）</div>

        <div
          v-for="(ps, si) in data"
          :key="si"
          class="pm-set-group"
          :class="{
            active: currentSelected === si,
            'pm-set-drop': dragOverCourse?.si === si && dragOverCourse?.pi === -1,
            'pm-set-dragging': dragSet === si,
            'pm-set-reorder-over': dragOverSet === si && dragSet !== si
          }"
          :data-set-drop="si"
        >
          <div class="pm-set-row">
            <span class="pm-set-handle" @pointerdown.prevent="startSetDrag($event, si)">⠿</span>
            <button class="pm-select-btn" @click="selectSet(si)" :title="currentSelected === si ? '表示中' : '地図に表示'">{{ currentSelected === si ? '★' : '☆' }}</button>
            <input class="pm-set-name pm-name-input" v-model="ps.setName" placeholder="プラン名" />
            <button class="icon-btn" @click="editSet(si)" title="詳細編集">✎</button>
            <button class="icon-btn danger" @click="deleteSet(si)" title="削除">🗑</button>
            <button class="icon-btn toggle" @click="toggleSet(si)" :title="collapsedSets.has(si) ? '展開' : '折りたたむ'">{{ collapsedSets.has(si) ? '▸' : '▾' }}</button>
          </div>
          <div
            v-for="(plan, pi) in ps.plans"
            v-show="!collapsedSets.has(si)"
            :key="pi"
            class="pm-course-row"
            data-course
            :data-si="si"
            :data-pi="pi"
            :class="{
              'pm-course-dragging': dragCourse?.si === si && dragCourse?.pi === pi,
              'pm-course-over': dragOverCourse?.si === si && dragOverCourse?.pi === pi && !(dragCourse?.si === si && dragCourse?.pi === pi)
            }"
          >
            <span class="pm-course-handle" @pointerdown.prevent="startCourseDrag($event, si, pi)">⠿</span>
            <input class="pm-course-name pm-name-input" v-model="plan.label" placeholder="コース名" />
            <button class="icon-btn" @click="editCourse(si, pi)" title="詳細編集">✎</button>
            <button class="icon-btn danger" @click="deletePlan(si, pi)" title="削除">🗑</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { auth } from '../firebase.js'
import { saveWithHistory } from '../lib/persistence.js'

const props = defineProps({
  initialData:     { type: Array,   required: true },
  externalData:    { type: Array,   default: null },
  editorInfo:      { type: Object,  default: null },
  currentSelected: { type: Number,  default: null },   // 現在表示中のプランindex | null
  canEdit:         { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'edit', 'select'])

// 各プランのコース一覧を折りたたむ
const collapsedSets = ref(new Set())
function toggleSet(si) {
  const s = new Set(collapsedSets.value)
  s.has(si) ? s.delete(si) : s.add(si)
  collapsedSets.value = s
}

// ── 自動保存 ──────────────────────────────────────
const saveStatus = ref('idle')
const saveError  = ref('')
let autoSaveTimer = null
let initialized   = false
let dirty         = false

const data = reactive(JSON.parse(JSON.stringify(props.initialData)))

// 全プランのコース一覧を一括開閉
const allSetsCollapsed = computed(() => data.length > 0 && data.every((_, si) => collapsedSets.value.has(si)))
function toggleAllSets() {
  collapsedSets.value = allSetsCollapsed.value ? new Set() : new Set(data.map((_, si) => si))
}

watch(data, () => {
  if (!initialized) return
  dirty = true
  saveStatus.value = 'saving'
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(doSave, 1500)
}, { deep: true })

// 他ユーザーの更新をモーダル内に反映
watch(() => props.externalData, (newVal) => {
  if (!newVal) return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = null
  dirty = false
  data.splice(0, data.length, ...JSON.parse(JSON.stringify(newVal)))
  saveStatus.value = 'external'
  setTimeout(() => { if (saveStatus.value === 'external') saveStatus.value = 'idle' }, 3000)
})

setTimeout(() => { initialized = true }, 0)
onBeforeUnmount(() => clearTimeout(autoSaveTimer))

async function doSave(close = false) {
  saveStatus.value = 'saving'
  saveError.value  = ''
  try {
    await saveWithHistory('plans', {
      sets:        JSON.parse(JSON.stringify(data)),
      savedBy:     auth.currentUser?.uid          ?? '',
      editorName:  auth.currentUser?.displayName  ?? '',
      editorPhoto: auth.currentUser?.photoURL     ?? '',
    })
    dirty = false
    saveStatus.value = 'saved'
    if (close) emit('close')
  } catch (e) {
    saveStatus.value = 'error'
    saveError.value  = e.message
  }
}

function handleClose() {
  clearTimeout(autoSaveTimer)
  if (dirty) {
    doSave(true)
  } else {
    emit('close')
  }
}

function addSet() {
  data.push({ setName: '新しいプラン', plans: [] })
}

function deleteSet(si) {
  if (!confirm(`「${data[si].setName || '（名称なし）'}」を削除しますか？`)) return
  data.splice(si, 1)
}

function deletePlan(si, pi) {
  const plan = data[si].plans[pi]
  if (!confirm(`「${plan.label || '（名称なし）'}」を削除しますか？`)) return
  data[si].plans.splice(pi, 1)
}

// 未保存の変更があれば即時保存を発火（画面遷移前）
function flush() {
  if (dirty) { clearTimeout(autoSaveTimer); doSave(false) }
}

function selectSet(si) {
  flush()
  emit('select', si)
}

function editSet(si) {
  flush()
  emit('edit', { si })
}

function editCourse(si, pi) {
  flush()
  emit('edit', { si, pi })
}

// ── ポインタ D&D ─────────────────────────────────
let _ghost = null
function _startGhost(el, e) {
  if (_ghost) { _ghost.remove(); _ghost = null }
  const rect = el.getBoundingClientRect()
  _ghost = el.cloneNode(true)
  Object.assign(_ghost.style, {
    position: 'fixed', top: rect.top + 'px', left: rect.left + 'px',
    width: rect.width + 'px', pointerEvents: 'none', opacity: '0.85',
    zIndex: '9999', boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
    borderRadius: '8px', cursor: 'grabbing', margin: '0',
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

// ── セット（プラン）D&D 並び替え ─────────────────────
const dragSet     = ref(null)  // number | null
const dragOverSet = ref(null)  // number | null

function startSetDrag(e, si) {
  dragSet.value     = si
  dragOverSet.value = si
  e.target.releasePointerCapture?.(e.pointerId)
  const groupEl = e.target.closest('[data-set-drop]')
  const offset  = groupEl ? _startGhost(groupEl, e) : null

  const handleMove = (ev) => {
    if (offset) _moveGhost(ev, offset)
    const dragEl = document.querySelector('.pm-set-dragging')
    if (dragEl) dragEl.style.visibility = 'hidden'
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-set-drop]')
    if (dragEl) dragEl.style.visibility = ''
    if (!target) return
    const idx = parseInt(target.dataset.setDrop)
    if (!isNaN(idx)) dragOverSet.value = idx
  }
  const handleUp = () => {
    _endGhost()
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    const from = dragSet.value
    const to   = dragOverSet.value
    dragSet.value     = null
    dragOverSet.value = null
    if (from === null || to === null || from === to) return
    const [item] = data.splice(from, 1)
    data.splice(to, 0, item)
  }

  document.addEventListener('pointermove', handleMove)
  document.addEventListener('pointerup', handleUp)
}

// ── コース D&D（並び替え・別プランへ移動）─────────────
const dragCourse     = ref(null)  // { si, pi } | null
const dragOverCourse = ref(null)  // { si, pi } | null  pi=-1 はそのプラン末尾

function startCourseDrag(e, si, pi) {
  dragCourse.value     = { si, pi }
  dragOverCourse.value = { si, pi }
  e.target.releasePointerCapture?.(e.pointerId)
  const rowEl  = e.target.closest('[data-course]')
  const offset = rowEl ? _startGhost(rowEl, e) : null

  const handleMove = (ev) => {
    if (offset) _moveGhost(ev, offset)
    const dragEl = document.querySelector('.pm-course-dragging')
    if (dragEl) dragEl.style.visibility = 'hidden'
    const point   = document.elementFromPoint(ev.clientX, ev.clientY)
    const courseEl = point?.closest('[data-course]')
    const setEl    = point?.closest('[data-set-drop]')
    if (dragEl) dragEl.style.visibility = ''
    if (courseEl) {
      const elSi = parseInt(courseEl.dataset.si)
      const elPi = parseInt(courseEl.dataset.pi)
      if (!isNaN(elSi) && !isNaN(elPi)) dragOverCourse.value = { si: elSi, pi: elPi }
    } else if (setEl) {
      const elSi = parseInt(setEl.dataset.setDrop)
      if (!isNaN(elSi)) dragOverCourse.value = { si: elSi, pi: -1 }
    }
  }

  const handleUp = () => {
    _endGhost()
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    const src = dragCourse.value
    const tgt = dragOverCourse.value
    dragCourse.value     = null
    dragOverCourse.value = null
    if (!src || !tgt) return
    if (src.si === tgt.si && src.pi === tgt.pi) return
    const [item] = data[src.si].plans.splice(src.pi, 1)
    let insertPi = tgt.pi
    if (insertPi === -1) insertPi = data[tgt.si].plans.length
    else if (src.si === tgt.si && src.pi < insertPi) insertPi = insertPi - 1
    data[tgt.si].plans.splice(insertPi, 0, item)
  }

  document.addEventListener('pointermove', handleMove)
  document.addEventListener('pointerup', handleUp)
}
</script>

<style scoped>
.modal-overlay { z-index: var(--z-modal-front); }
.pm-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: var(--modal-width);
  max-height: min(80vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-3);
}
.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.pm-header h2 { margin: 0; font-size: 1.05rem; color: var(--text); font-weight: 500; }
.pm-header-actions { display: flex; align-items: center; gap: 6px; }
.pm-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.3rem;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
}
.pm-close-btn:hover { color: var(--text); background: var(--bg-hover); }
.pm-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pm-hint {
  font-size: 0.7rem;
  color: var(--text-faint);
  text-align: center;
  margin: 0 0 4px;
}
.pm-mode-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--accent);
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.pm-mode-btn:hover { background: var(--bg-selected); border-color: var(--accent); }

/* プラン選択・並び替え */
.pm-set-none {
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-muted);
  font-style: italic;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
}
.pm-set-none:hover { background: var(--bg-hover); }
.pm-set-none.active { border-color: var(--accent); background: var(--bg-selected); color: var(--accent); }
.pm-set-handle {
  cursor: grab;
  color: var(--text-faint);
  font-size: 1rem;
  padding: 2px 4px;
  flex-shrink: 0;
  user-select: none;
  touch-action: none;
  line-height: 1;
}
.pm-set-handle:active { cursor: grabbing; }
.pm-select-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 1rem;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.pm-set-group.pm-set-dragging { opacity: 0.3; }
.pm-set-group.pm-set-reorder-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.pm-set-group.active {
  border-color: var(--accent);
  background: var(--bg-selected);
}

/* セット編集モード */
.pm-set-group {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: outline 0.1s;
}
.pm-set-group.pm-set-drop {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
.pm-set-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
}
.pm-set-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-course-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  margin-left: 14px;
  transition: opacity 0.15s;
}
.pm-course-row.pm-course-dragging { opacity: 0.3; }
.pm-course-row.pm-course-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.pm-course-handle {
  cursor: grab;
  color: var(--text-faint);
  font-size: 1rem;
  padding: 2px 4px;
  flex-shrink: 0;
  user-select: none;
  touch-action: none;
  line-height: 1;
}
.pm-course-handle:active { cursor: grabbing; }
.pm-course-name {
  flex: 1;
  font-size: 0.82rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-name-input {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 6px;
  color: inherit;
  font-family: inherit;
}
.pm-name-input:hover { border-color: var(--border); }
.pm-name-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--bg-input, var(--bg));
}
.pm-add-btn {
  background: none;
  border: 1px dashed var(--border);
  color: var(--accent);
  border-radius: 6px;
  padding: 8px;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.pm-add-btn:hover { border-color: var(--accent); background: var(--bg-selected); }
</style>
