<template>
  <Teleport to="body">
    <div class="list-overlay" @click.self="$emit('close')">
      <div class="list-panel recovery-panel">
        <div class="list-header">
          <h2>🕘 データ復旧</h2>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="recovery-tabs">
          <button :class="{ active: tab === 'plans' }" @click="tab = 'plans'">旅程</button>
          <button :class="{ active: tab === 'countries' }" @click="tab = 'countries'">渡航済み</button>
        </div>

        <p class="recovery-note">
          過去{{ MAX_HISTORY }}件の保存状態に戻せます。復旧しても<strong>現在のデータは履歴に退避</strong>されるため、やり直しできます。
        </p>

        <div class="recovery-body">
          <p v-if="loading" class="recovery-empty">読み込み中…</p>
          <p v-else-if="currentList.length === 0" class="recovery-empty">バックアップ履歴がありません</p>
          <ul v-else class="recovery-list">
            <li v-for="(item, i) in currentList" :key="i" :class="{ 'is-confirming': confirmIndex === i }">
              <div class="recovery-item-info">
                <span class="recovery-time">{{ formatTime(item.at) }}</span>
                <span class="recovery-meta">{{ summarize(item) }}</span>
              </div>
              <div class="recovery-actions">
                <template v-if="confirmIndex !== i">
                  <button class="recovery-btn" @click="startConfirm(i)">復旧</button>
                </template>
                <template v-else-if="confirmStep === 1">
                  <span class="recovery-confirm-text">この状態に戻しますか？（確認 1/2）</span>
                  <button class="recovery-btn danger" @click="confirmStep = 2">はい</button>
                  <button class="recovery-btn ghost" @click="cancelConfirm">やめる</button>
                </template>
                <template v-else>
                  <span class="recovery-confirm-text">現在のデータを上書きします。本当に実行しますか？（確認 2/2）</span>
                  <button class="recovery-btn danger" :disabled="restoring" @click="doRestore(item)">
                    {{ restoring ? '復旧中…' : '復旧を実行' }}
                  </button>
                  <button class="recovery-btn ghost" :disabled="restoring" @click="cancelConfirm">やめる</button>
                </template>
              </div>
            </li>
          </ul>

          <p v-if="statusMsg" class="recovery-status" :class="statusType">{{ statusMsg }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { loadHistory, saveWithHistory, MAX_HISTORY } from '../lib/persistence.js'
import { auth } from '../firebase.js'

defineEmits(['close'])

const tab = ref('plans')            // 'plans' | 'countries'
const loading = ref(true)
const plansHistory = ref([])
const countriesHistory = ref([])

const confirmIndex = ref(null)      // 確認中の項目 index
const confirmStep = ref(0)          // 1 = 1回目確認, 2 = 2回目確認
const restoring = ref(false)
const statusMsg = ref('')
const statusType = ref('')          // 'ok' | 'error'

const currentList = computed(() => (tab.value === 'plans' ? plansHistory.value : countriesHistory.value))

async function load() {
  loading.value = true
  try {
    const [p, c] = await Promise.all([loadHistory('plans'), loadHistory('countries')])
    plansHistory.value = p
    countriesHistory.value = c
  } catch (e) {
    statusMsg.value = '⚠ 履歴の読み込みに失敗しました: ' + e.message
    statusType.value = 'error'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// タブ切り替えで確認状態をリセット
watch(tab, cancelConfirm)

function startConfirm(i) {
  confirmIndex.value = i
  confirmStep.value = 1
  statusMsg.value = ''
}

function cancelConfirm() {
  confirmIndex.value = null
  confirmStep.value = 0
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function summarize(item) {
  const d = item.data || {}
  const editor = d.editorName ? ` / ${d.editorName}` : ''
  if (tab.value === 'plans') {
    const n = Array.isArray(d.sets) ? d.sets.length : 0
    return `${n}セット${editor}`
  }
  const lines = typeof d.csv === 'string' ? Math.max(0, d.csv.trim().split('\n').length - 1) : 0
  return `${lines}件${editor}`
}

async function doRestore(item) {
  restoring.value = true
  statusMsg.value = ''
  try {
    const docId = tab.value   // 'plans' | 'countries'
    const payload = {
      ...item.data,
      // 復旧を自分の操作として記録（他ユーザー扱いの誤検知を防ぐ）
      savedBy:     auth.currentUser?.uid         ?? '',
      editorName:  auth.currentUser?.displayName ?? '',
      editorPhoto: auth.currentUser?.photoURL    ?? '',
    }
    await saveWithHistory(docId, payload)
    statusMsg.value = '✓ 復旧しました'
    statusType.value = 'ok'
    cancelConfirm()
    await load()   // 復旧直前の状態も履歴に入るため再読み込み
  } catch (e) {
    statusMsg.value = '⚠ 復旧に失敗しました: ' + e.message
    statusType.value = 'error'
  } finally {
    restoring.value = false
  }
}
</script>

<style scoped>
.list-overlay {
  position: fixed;
  inset: 0;
  background: rgba(32, 33, 36, 0.5);
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: env(safe-area-inset-top, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
}

.list-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: min(640px, 92vw);
  height: calc(min(88vh, 840px) - env(safe-area-inset-top, 0px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-3);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 8px;
}
.list-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text);
  font-weight: 500;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
  border-radius: 4px;
  transition: background 0.2s;
}
.close-btn:hover { background: var(--bg-hover); color: var(--text); }

.recovery-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 20px 0;
  flex-shrink: 0;
}
.recovery-tabs button {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 4px 16px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.recovery-tabs button:hover { border-color: var(--accent); color: var(--text); }
.recovery-tabs button.active { background: var(--bg-selected); color: var(--accent); border-color: var(--accent); font-weight: 600; }

.recovery-note {
  margin: 10px 20px 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
  flex-shrink: 0;
}
.recovery-note strong { color: var(--success); font-weight: 600; }

.recovery-body {
  overflow-y: auto;
  padding: 12px 20px 20px;
}

.recovery-empty {
  color: var(--text-faint);
  font-size: 0.85rem;
  text-align: center;
  padding: 24px 0;
  font-style: italic;
}

.recovery-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recovery-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-app);
  flex-wrap: wrap;
}
.recovery-list li.is-confirming {
  border-color: var(--danger);
  background: var(--danger-soft);
}

.recovery-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}
.recovery-time {
  font-size: 0.85rem;
  color: var(--text);
  font-weight: 500;
}
.recovery-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.recovery-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.recovery-confirm-text {
  font-size: 0.75rem;
  color: var(--danger);
  font-weight: 600;
}

.recovery-btn {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.recovery-btn:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.recovery-btn:disabled { opacity: 0.6; cursor: default; }
.recovery-btn.danger { background: var(--danger); border-color: var(--danger); }
.recovery-btn.danger:hover:not(:disabled) { filter: brightness(0.92); }
.recovery-btn.ghost {
  background: none;
  color: var(--text-secondary);
  border-color: var(--border);
}
.recovery-btn.ghost:hover:not(:disabled) { background: var(--bg-hover); }

.recovery-status {
  margin: 14px 0 0;
  font-size: 0.82rem;
  text-align: center;
}
.recovery-status.ok    { color: var(--success); }
.recovery-status.error { color: var(--danger); }
</style>
