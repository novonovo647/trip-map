<template>
  <div class="pm-overlay" @click.self="handleClose">
    <div class="pm-panel">

      <!-- ヘッダー -->
      <div class="pm-header">
        <h2>✎ プランを管理</h2>
        <div class="pm-header-actions">
          <span v-if="saveStatus !== 'idle'" class="pm-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失敗' : saveStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
          </span>
          <template v-if="editorInfo && saveStatus === 'external'">
            <img v-if="editorInfo.photo" :src="editorInfo.photo" class="pm-editor-avatar" :title="editorInfo.name" referrerpolicy="no-referrer" />
            <span v-else class="pm-editor-name">{{ editorInfo.name }}</span>
          </template>
          <button class="pm-close-btn" @click="handleClose" title="閉じる">×</button>
        </div>
      </div>
      <div v-if="saveError" class="pm-error">{{ saveError }}</div>

      <!-- ボディ: プランリスト -->
      <div class="pm-body">
        <p class="pm-hint">⠿ をドラッグして並び替え</p>

        <div
          v-for="(ps, si) in data"
          :key="si"
          class="pm-item"
          :data-idx="si"
          :class="{
            'pm-dragging': draggingIdx === si,
            'pm-drag-over': dragOverIdx === si && draggingIdx !== si
          }"
        >
          <span class="pm-handle" @pointerdown.prevent="startDrag($event, si)">⠿</span>
          <input class="pm-name-input" v-model="ps.setName" placeholder="プラン名" @pointerdown.stop />
          <button class="pm-edit-btn" @click="$emit('edit', si)" title="編集">✎</button>
          <button class="pm-del-btn" @click="deleteSet(si)" title="削除">🗑</button>
        </div>

        <button class="pm-add-btn" @click="addSet">＋ プランを追加</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { auth } from '../firebase.js'
import { saveWithHistory } from '../lib/persistence.js'

const props = defineProps({
  initialData:  { type: Array,  required: true },
  externalData: { type: Array,  default: null },
  editorInfo:   { type: Object, default: null },
})

const emit = defineEmits(['close', 'edit'])

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

function startDrag(e, idx) {
  draggingIdx.value = idx
  dragOverIdx.value = idx
  e.target.releasePointerCapture?.(e.pointerId)
  const itemEl = e.target.closest('[data-idx]')
  const offset = itemEl ? _startGhost(itemEl, e) : null

  const handleMove = (ev) => {
    if (offset) _moveGhost(ev, offset)
    const dragEl = document.querySelector('.pm-item.pm-dragging')
    if (dragEl) dragEl.style.visibility = 'hidden'
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-idx]')
    if (dragEl) dragEl.style.visibility = ''
    if (!target) return
    const newIdx = parseInt(target.dataset.idx)
    if (!isNaN(newIdx)) dragOverIdx.value = newIdx
  }

  const handleUp = () => {
    _endGhost()
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    const from = draggingIdx.value
    const to   = dragOverIdx.value
    draggingIdx.value = null
    dragOverIdx.value = null
    if (from === null || to === null || from === to) return
    const [item] = data.splice(from, 1)
    data.splice(to, 0, item)
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
.pm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 10px;
  transition: opacity 0.15s;
}
.pm-item.pm-dragging { opacity: 0.3; }
.pm-item.pm-drag-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.pm-handle {
  cursor: grab;
  color: var(--text-faint);
  font-size: 1rem;
  padding: 2px 4px;
  flex-shrink: 0;
  user-select: none;
  touch-action: none;
  line-height: 1;
}
.pm-handle:active { cursor: grabbing; }
.pm-name-input {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 0.88rem;
  outline: none;
  min-width: 0;
}
.pm-name-input:focus { border-color: var(--accent); }
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
