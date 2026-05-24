<template>
  <div class="pm-overlay" @click.self="handleClose">
    <div class="pm-panel">

      <!-- ヘッダー -->
      <div class="pm-header">
        <h2>✏ プランを管理</h2>
        <div class="pm-header-actions">
          <span v-if="saveStatus !== 'idle'" class="pm-status" :class="saveStatus">
            {{ saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失敗' : '✓ 保存済み' }}
          </span>
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
          <button class="pm-del-btn" @click="deleteSet(si)" title="削除">🗑</button>
        </div>

        <button class="pm-add-btn" @click="addSet">＋ プランを追加</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { db, auth } from '../firebase.js'
import { setDoc, doc } from 'firebase/firestore'

const props = defineProps({
  initialData: { type: Array, required: true },
})

const emit = defineEmits(['close'])

// ── 自動保存 ──────────────────────────────────────
const saveStatus = ref('idle')
const saveError  = ref('')
let autoSaveTimer = null
let initialized   = false

const data = reactive(JSON.parse(JSON.stringify(props.initialData)))

watch(data, () => {
  if (!initialized) return
  saveStatus.value = 'saving'
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(doSave, 1500)
}, { deep: true })

setTimeout(() => { initialized = true }, 0)
onBeforeUnmount(() => clearTimeout(autoSaveTimer))

async function doSave(close = false) {
  saveStatus.value = 'saving'
  saveError.value  = ''
  try {
    await setDoc(doc(db, 'tripdata', 'plans'), {
      sets:        JSON.parse(JSON.stringify(data)),
      savedBy:     auth.currentUser?.uid          ?? '',
      editorName:  auth.currentUser?.displayName  ?? '',
      editorPhoto: auth.currentUser?.photoURL     ?? '',
    })
    saveStatus.value = 'saved'
    if (close) emit('close')
  } catch (e) {
    saveStatus.value = 'error'
    saveError.value  = e.message
  }
}

function handleClose() {
  clearTimeout(autoSaveTimer)
  doSave(true)
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

function startDrag(e, idx) {
  draggingIdx.value = idx
  dragOverIdx.value = idx

  const handleMove = (ev) => {
    const dragEl = document.querySelector('.pm-item.pm-dragging')
    if (dragEl) dragEl.style.visibility = 'hidden'
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-idx]')
    if (dragEl) dragEl.style.visibility = ''
    if (!target) return
    const newIdx = parseInt(target.dataset.idx)
    if (!isNaN(newIdx)) dragOverIdx.value = newIdx
  }

  const handleUp = () => {
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    const from = draggingIdx.value
    const to   = dragOverIdx.value
    draggingIdx.value = null
    dragOverIdx.value = null
    if (from === null || to === null || from === to) return
    const [item] = data.splice(from, 1)
    data.splice(from < to ? to - 1 : to, 0, item)
  }

  document.addEventListener('pointermove', handleMove)
  document.addEventListener('pointerup', handleUp)
}
</script>

<style scoped>
.pm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pm-panel {
  background: #1a2d40;
  border: 1px solid #4a7a9b;
  border-radius: 12px;
  width: min(400px, 94vw);
  max-height: min(80vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,0.65);
}
.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 10px;
  border-bottom: 1px solid #2d4a6a;
  flex-shrink: 0;
}
.pm-header h2 { margin: 0; font-size: 1.05rem; color: #e0e0e0; }
.pm-header-actions { display: flex; align-items: center; gap: 6px; }
.pm-status {
  font-size: 0.78rem;
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.pm-status.saved  { color: #7ad47a; }
.pm-status.saving { color: #aaa; }
.pm-status.error  { color: #ff8888; }
.pm-close-btn {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 1.3rem;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
}
.pm-close-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
.pm-error {
  background: rgba(200,50,50,0.15);
  border-left: 3px solid #e63946;
  color: #ff8888;
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
  color: #3a5a7a;
  text-align: center;
  margin: 0 0 4px;
}
.pm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0f2030;
  border: 1px solid #2d4a6a;
  border-radius: 8px;
  padding: 9px 10px;
  transition: opacity 0.15s;
}
.pm-item.pm-dragging { opacity: 0.3; }
.pm-item.pm-drag-over {
  outline: 2px solid #4a7a9b;
  outline-offset: -2px;
}
.pm-handle {
  cursor: grab;
  color: #3a5a7a;
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
  background: #0d1b2a;
  border: 1px solid #2d4a6a;
  border-radius: 5px;
  color: #e0e0e0;
  padding: 6px 8px;
  font-size: 0.88rem;
  outline: none;
  min-width: 0;
}
.pm-name-input:focus { border-color: #4a7a9b; }
.pm-del-btn {
  background: none;
  border: 1px solid #4a2a2a;
  color: #e66;
  border-radius: 4px;
  padding: 4px 7px;
  font-size: 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
}
.pm-del-btn:hover { background: rgba(200,60,60,0.15); }
.pm-add-btn {
  background: none;
  border: 1px dashed #2d4a6a;
  color: #4a7a9b;
  border-radius: 6px;
  padding: 8px;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.pm-add-btn:hover { border-color: #7ab3d4; color: #7ab3d4; }
</style>
