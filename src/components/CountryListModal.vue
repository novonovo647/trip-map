<template>
  <Teleport to="body">
    <div class="list-overlay" @click.self="$emit('close')">
      <div class="list-panel">
        <div class="list-header">
          <h2>
            {{ listMode === 'visited' ? '渡航済み国・地域一覧' : '未渡航国・地域一覧' }}
            <span v-if="countryEditMode" class="edit-diff-count">
              <template v-if="countryEditAdded > 0">+{{ countryEditAdded }}</template>
              <template v-if="countryEditRemoved > 0"> −{{ countryEditRemoved }}</template>
            </span>
          </h2>
          <div class="list-header-actions">
            <button v-if="canEdit && !countryEditMode" class="edit-mode-btn" @click="$emit('enter-edit')">✎ 編集</button>
            <template v-if="countryEditMode">
              <span v-if="countryEditStatus !== 'idle'" class="ce-status" :class="countryEditStatus">
                {{ countryEditStatus === 'saving' ? '保存中…' : countryEditStatus === 'error' ? '⚠ 保存失敗' : countryEditStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
              </span>
              <template v-if="countryEditStatus === 'external' && countryEditorInfo">
                <img v-if="countryEditorInfo.photo" :src="countryEditorInfo.photo" class="ce-editor-avatar" :title="countryEditorInfo.name" referrerpolicy="no-referrer" />
                <span v-else class="ce-editor-name">{{ countryEditorInfo.name }}</span>
              </template>
            </template>
            <button class="close-btn" @click="$emit('close')">✕</button>
          </div>
        </div>
        <div v-if="countryEditMode && countryEditError" class="edit-error">{{ countryEditError }}</div>
        <div class="list-body">
          <template v-for="region in REGION_ORDER" :key="region">
            <div v-if="groupedList[region]" class="region-section">
              <h3>{{ REGION_LABELS[region] }} <span class="region-count">({{ groupedList[region].length }})</span></h3>
              <ul>
                <li v-for="c in groupedList[region]" :key="c.en"
                  :class="{ 'strikethrough-item': c.strikethrough, 'skip-item': c.skip, 'edit-item-new': countryEditMode && listMode === 'unvisited' && countryEditSet.has(c.en) }">
                  <span>{{ c.ja }}</span>
                  <button v-if="countryEditMode && listMode === 'visited'" class="toggle-remove-btn" @click.stop="$emit('toggle', c.en, c.ja)" title="渡航済みから削除">✕</button>
                  <button v-if="countryEditMode && listMode === 'unvisited'" class="toggle-add-btn" :class="{ active: countryEditSet.has(c.en) }" @click.stop="$emit('toggle', c.en, c.ja)" :title="countryEditSet.has(c.en) ? '追加を取り消す' : '渡航済みに追加'">{{ countryEditSet.has(c.en) ? '✓' : '+' }}</button>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { REGION_ORDER, REGION_LABELS } from '../utils/countries.js'

defineProps({
  listMode:           { type: String,  default: null },
  groupedList:        { type: Object,  default: () => ({}) },
  countryEditMode:    { type: Boolean, default: false },
  countryEditSet:     { type: Set,     default: () => new Set() },
  countryEditStatus:  { type: String,  default: 'idle' },
  countryEditorInfo:  { type: Object,  default: null },
  countryEditError:   { type: String,  default: '' },
  countryEditAdded:   { type: Number,  default: 0 },
  countryEditRemoved: { type: Number,  default: 0 },
  canEdit:            { type: Boolean, default: false },
})

defineEmits(['close', 'enter-edit', 'toggle'])
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
  width: min(860px, 92vw);
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

.list-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.list-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text);
  font-weight: 500;
}

/* 編集モードボタン */
.edit-mode-btn {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
  border-radius: 6px;
  padding: 3px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.edit-mode-btn:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

/* autosave ステータス */
.ce-status {
  font-size: 0.78rem;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
}
.ce-status.saved    { color: var(--success); }
.ce-status.saving   { color: var(--text-muted); }
.ce-status.error    { color: var(--danger); }
.ce-status.external { color: var(--accent); }
.ce-editor-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  object-fit: cover;
}
.ce-editor-name {
  font-size: 0.75rem;
  color: var(--accent);
}

/* 変更数インジケータ */
.edit-diff-count {
  font-size: 0.75rem;
  color: var(--success);
  font-weight: normal;
  margin-left: 6px;
}

/* エラー表示 */
.edit-error {
  background: var(--danger-soft);
  border-left: 3px solid var(--danger);
  color: var(--danger);
  font-size: 0.8rem;
  padding: 6px 16px;
  flex-shrink: 0;
  word-break: break-all;
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
  color: var(--accent);
  margin: 0 0 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.region-count {
  color: var(--text-faint);
  font-weight: normal;
}

.region-section ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.region-section ul li {
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding: 2px 0;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 6px;
}
.region-section ul li span { flex: 1; }

.strikethrough-item {
  text-decoration-line: line-through;
  text-decoration-style: double;
  opacity: 0.45;
}

.skip-item {
  text-decoration: line-through;
  opacity: 0.35;
}

.toggle-remove-btn {
  background: none;
  border: 1px solid var(--danger-border);
  color: var(--danger);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.7rem;
  cursor: pointer;
  line-height: 1.4;
  flex-shrink: 0;
  transition: background 0.15s;
}
.toggle-remove-btn:hover { background: var(--danger-soft); }

.toggle-add-btn {
  background: none;
  border: 1px solid var(--success-border);
  color: var(--success);
  border-radius: 4px;
  padding: 0 6px;
  font-size: 0.7rem;
  cursor: pointer;
  line-height: 1.4;
  flex-shrink: 0;
  transition: background 0.15s;
  min-width: 22px;
  text-align: center;
}
.toggle-add-btn:hover { background: var(--success-soft); }
.toggle-add-btn.active { background: var(--success-soft); border-color: var(--success); color: var(--success); }

.edit-item-new { background: var(--success-soft); border-radius: 4px; }
</style>
