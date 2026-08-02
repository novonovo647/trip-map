<template>
  <div class="pm-overlay" @click.self="handleClose">
    <div class="pm-panel">

      <!-- ヘッダー -->
      <div class="pm-header">
        <h2>✎ プラン管理</h2>
        <div class="pm-header-actions">
          <span v-if="saveStatus !== 'idle'" class="pm-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失敗' : saveStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
          </span>
          <template v-if="editorInfo && saveStatus === 'external'">
            <img v-if="editorInfo.photo" :src="editorInfo.photo" class="pm-editor-avatar" :title="editorInfo.name" referrerpolicy="no-referrer" />
            <span v-else class="pm-editor-name">{{ editorInfo.name }}</span>
          </template>
          <button v-if="canEdit && mode === 'edit'" class="pm-mode-btn" @click="addSet">✎ プラン追加</button>
          <button v-if="canEdit" class="pm-mode-btn" :class="{ active: mode === 'edit' }" @click="toggleMode">✎ セット編集</button>
          <button class="pm-close-btn" @click="handleClose" title="閉じる">×</button>
        </div>
      </div>
      <div v-if="saveError" class="pm-error">{{ saveError }}</div>

      <!-- 選択モード -->
      <div v-if="mode === 'select'" class="pm-body">
        <p class="pm-hint">プランをドラッグして並び替え・プランをクリックで表示</p>

        <div
          class="pm-card pm-card-none"
          :class="{ active: currentSelected === null }"
          @click="selectSet(null)"
        >未選択</div>

        <div
          v-for="(ps, si) in data"
          :key="si"
          class="pm-card"
          :data-idx="si"
          :class="{
            active: currentSelected === si,
            'pm-dragging': draggingIdx === si,
            'pm-drag-over': dragOverIdx === si && draggingIdx !== si
          }"
          @pointerdown="startCardDrag($event, si)"
        >
          <span class="pm-card-handle">⠿</span>
          <div class="pm-card-body">
            <div class="pm-card-name">{{ ps.setName || '（名称なし）' }}</div>
            <div class="pm-card-courses">
              <span v-for="(plan, pi) in ps.plans" :key="pi" class="pm-card-course">{{ plan.label || '（名称なし）' }}</span>
              <span v-if="ps.plans.length === 0" class="pm-card-empty">コースなし</span>
            </div>
          </div>
        </div>
      </div>

      <!-- セット編集モード -->
      <div v-else class="pm-body">
        <p class="pm-hint">⠿ コースをドラッグして並び替え・別プランへ移動</p>

        <div
          v-for="(ps, si) in data"
          :key="si"
          class="pm-set-group"
          :class="{ 'pm-set-drop': dragOverCourse?.si === si && dragOverCourse?.pi === -1 }"
          :data-set-drop="si"
        >
          <div class="pm-set-row">
            <span class="pm-set-name">{{ ps.setName || '（名称なし）' }}</span>
            <button class="pm-edit-btn" @click="editSet(si)" title="編集">✎</button>
            <button class="pm-del-btn" @click="deleteSet(si)" title="削除">🗑</button>
          </div>
          <div
            v-for="(plan, pi) in ps.plans"
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
            <span class="pm-course-name">{{ plan.label || '（名称なし）' }}</span>
            <button class="pm-edit-btn" @click="editCourse(si, pi)" title="編集">✎</button>
            <button class="pm-del-btn" @click="deletePlan(si, pi)" title="削除">🗑</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { auth } from '../firebase.js'
import { saveWithHistory } from '../lib/persistence.js'

const props = defineProps({
  initialData:     { type: Array,   required: true },
  externalData:    { type: Array,   default: null },
  editorInfo:      { type: Object,  default: null },
  currentSelected: { type: Number,  default: null },   // 現在表示中のプランindex | null
  canEdit:         { type: Boolean, default: false },
  initialMode:     { type: String,  default: 'select' },
})

const emit = defineEmits(['close', 'edit', 'select'])

const mode = ref(props.initialMode)   // 'select' | 'edit'
function toggleMode() {
  mode.value = mode.value === 'select' ? 'edit' : 'select'
}

// ── 自動保存 ──────────────────────────────────────
const saveStatus = ref('idle')
const saveError  = ref('')
let autoSaveTimer = null
let initialized   = false
let dirty         = false

const data = reactive(JSON.parse(JSON.stringify(props.initialData)))

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
const draggingIdx = ref(null)
const dragOverIdx = ref(null)

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

// カード全体でD&D（移動しきい値でクリック/ドラッグを判定）
function startCardDrag(e, idx) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const startX = e.clientX, startY = e.clientY
  let dragging = false, canceled = false, offset = null
  const cardEl = e.target.closest('[data-idx]')
  e.target.releasePointerCapture?.(e.pointerId)

  const handleMove = (ev) => {
    if (canceled) return
    if (!dragging) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
      dragging = true
      draggingIdx.value = idx
      dragOverIdx.value = idx
      offset = cardEl ? _startGhost(cardEl, ev) : null
    }
    ev.preventDefault()
    if (offset) _moveGhost(ev, offset)
    const dragEl = document.querySelector('.pm-card.pm-dragging')
    if (dragEl) dragEl.style.visibility = 'hidden'
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-idx]')
    if (dragEl) dragEl.style.visibility = ''
    if (!target) return
    const newIdx = parseInt(target.dataset.idx)
    if (!isNaN(newIdx)) dragOverIdx.value = newIdx
  }
  const cleanup = () => {
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    document.removeEventListener('pointercancel', handleCancel)
  }
  const handleUp = () => {
    cleanup()
    if (canceled) return
    if (!dragging) { selectSet(idx); return }   // 移動なし=クリック→選択
    _endGhost()
    const from = draggingIdx.value
    const to   = dragOverIdx.value
    draggingIdx.value = null
    dragOverIdx.value = null
    if (from === null || to === null || from === to) return
    const [item] = data.splice(from, 1)
    data.splice(to, 0, item)
  }
  const handleCancel = () => {   // スクロール等での中断は誤操作にしない
    canceled = true
    _endGhost()
    draggingIdx.value = null
    dragOverIdx.value = null
    cleanup()
  }
  document.addEventListener('pointermove', handleMove)
  document.addEventListener('pointerup', handleUp)
  document.addEventListener('pointercancel', handleCancel)
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
.pm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(32,33,36,0.5);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pm-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: min(400px, 94vw);
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
.pm-status {
  font-size: 0.78rem;
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.pm-status.saved    { color: var(--success); }
.pm-status.saving   { color: var(--text-muted); }
.pm-status.error    { color: var(--danger); }
.pm-status.external { color: var(--accent); }
.pm-editor-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  object-fit: cover;
}
.pm-editor-name {
  font-size: 0.75rem;
  color: var(--accent);
}
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
.pm-error {
  background: var(--danger-soft);
  border-left: 3px solid var(--danger);
  color: var(--danger);
  font-size: 0.78rem;
  padding: 6px 16px;
  flex-shrink: 0;
}
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
.pm-mode-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* 選択モード: カード */
.pm-card {
  display: flex;
  align-items: stretch;
  gap: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
  user-select: none;
  touch-action: pan-y;
  transition: opacity 0.15s, border-color 0.15s, background 0.15s;
}
.pm-card:hover { background: var(--bg-hover); }
.pm-card.active { border-color: var(--accent); background: var(--bg-selected); }
.pm-card.pm-dragging { opacity: 0.3; }
.pm-card.pm-drag-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.pm-card-none {
  justify-content: center;
  font-size: 0.82rem;
  color: var(--text-muted);
  font-style: italic;
}
.pm-card-handle {
  cursor: grab;
  color: var(--text-faint);
  font-size: 1rem;
  padding: 2px 4px;
  flex-shrink: 0;
  user-select: none;
  touch-action: none;
  line-height: 1;
  align-self: center;
}
.pm-card-handle:active { cursor: grabbing; }
.pm-card-body { flex: 1; min-width: 0; }
.pm-card-name {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-card-courses {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.pm-card-course {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}
.pm-card-empty {
  font-size: 0.7rem;
  color: var(--text-faint);
  font-style: italic;
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
.pm-edit-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--accent);
  border-radius: 4px;
  padding: 4px 7px;
  font-size: 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
}
.pm-edit-btn:hover { background: var(--bg-selected); }
.pm-del-btn {
  background: none;
  border: 1px solid var(--danger-border);
  color: var(--danger);
  border-radius: 4px;
  padding: 4px 7px;
  font-size: 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
}
.pm-del-btn:hover { background: var(--danger-soft); }
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
