<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="list-panel">
        <div class="list-header">
          <h2>
            {{ listMode === 'visited' ? '渡航済み国・地域一覧' : listMode === 'planned' ? 'プラン済み国・地域一覧' : '未渡航国・地域一覧' }}
            <span v-if="countryEditMode" class="edit-diff-count">
              <template v-if="countryEditAdded > 0">+{{ countryEditAdded }}</template>
              <template v-if="countryEditRemoved > 0"> −{{ countryEditRemoved }}</template>
            </span>
          </h2>
          <div class="list-header-actions">
            <button v-if="canEdit && !countryEditMode && listMode !== 'planned'" class="edit-mode-btn" @click="$emit('enter-edit')">✎ 編集</button>
            <template v-if="countryEditMode">
              <span v-if="countryEditStatus !== 'idle'" class="save-status" :class="countryEditStatus">
                {{ countryEditStatus === 'saving' ? '保存中…' : countryEditStatus === 'error' ? '⚠ 保存失敗' : countryEditStatus === 'external' ? '↻ 同期済み' : '✓ 保存済み' }}
              </span>
              <template v-if="countryEditStatus === 'external' && countryEditorInfo">
                <img v-if="countryEditorInfo.photo" :src="countryEditorInfo.photo" class="editor-avatar" :title="countryEditorInfo.name" referrerpolicy="no-referrer" />
                <span v-else class="editor-name">{{ countryEditorInfo.name }}</span>
              </template>
            </template>
            <button class="close-btn" @click="$emit('close')">✕</button>
          </div>
        </div>
        <div v-if="countryEditMode && countryEditError" class="modal-error">{{ countryEditError }}</div>
        <div class="list-body">
          <template v-for="region in REGION_ORDER" :key="region">
            <div v-if="groupedList[region]" class="region-section">
              <h3>{{ REGION_LABELS[region] }} <span class="region-count">({{ groupedList[region].length }})</span></h3>
              <ul>
                <li v-for="c in groupedList[region]" :key="c.en"
                  :class="{ 'strikethrough-item': c.strikethrough, 'skip-item': c.skip, 'planned-item': c.planned, 'edit-item-new': countryEditMode && listMode === 'unvisited' && countryEditSet.has(c.en) }">
                  <span class="country-ja">{{ c.ja }}</span>
                  <span
                    v-if="c.plans"
                    v-overflow="c.en"
                    class="plan-name"
                    :class="{ expanded: expandedPlans.has(c.en), truncated: truncated.has(c.en) }"
                    :title="c.plans"
                    @click="onPlanClick(c.en)"
                  >{{ c.plans }}</span>
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
import { ref } from 'vue'
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

// タップで全文展開するプラン名の国コード集合（スマホ向け）
const expandedPlans = ref(new Set())
function togglePlan(en) {
  const s = new Set(expandedPlans.value)
  s.has(en) ? s.delete(en) : s.add(en)
  expandedPlans.value = s
}

// 溢れている（= タップ可能な）プラン名の集合
const truncated = ref(new Set())
function setTruncated(en, val) {
  const has = truncated.value.has(en)
  if (val === has) return
  const s = new Set(truncated.value)
  val ? s.add(en) : s.delete(en)
  truncated.value = s
}
function onPlanClick(en) {
  // 溢れている、または展開中のときだけトグル
  if (truncated.value.has(en) || expandedPlans.value.has(en)) togglePlan(en)
}

// 溢れ判定ディレクティブ（展開中は測定しない＝折返しで溢れ0になるため）
const vOverflow = {
  mounted(el, binding) {
    const en = binding.value
    const check = () => {
      if (expandedPlans.value.has(en)) return
      setTruncated(en, el.scrollWidth > el.clientWidth + 1)
    }
    el._ro = new ResizeObserver(check)
    el._ro.observe(el)
    check()
    // 日本語 Web フォント読込後は要素サイズが変わらず ResizeObserver が
    // 再発火しないため、フォント確定後にも溢れ判定をやり直す。
    document.fonts?.ready?.then(check)
  },
  updated(el, binding) {
    const en = binding.value
    if (!expandedPlans.value.has(en)) setTruncated(en, el.scrollWidth > el.clientWidth + 1)
  },
  unmounted(el) { el._ro?.disconnect() },
}
</script>

<style scoped>
.modal-overlay { z-index: var(--z-modal); }

/* 変更数インジケータ */
.edit-diff-count {
  font-size: 0.75rem;
  color: var(--success);
  font-weight: normal;
  margin-left: 6px;
}

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
.region-section ul li .country-ja { flex: 1 1 auto; white-space: nowrap; }
.region-section ul li:has(.plan-name) .country-ja { flex: 0 0 auto; }
.plan-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  color: var(--text-faint);
  text-align: right;
  cursor: default;
}
/* 溢れている（タップ可能な）項目だけ手がかりを表示 */
.plan-name.truncated {
  cursor: pointer;
  color: var(--accent);
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.plan-name.expanded {
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
  word-break: break-word;
}

.strikethrough-item {
  text-decoration-line: line-through;
  text-decoration-style: double;
  opacity: 0.45;
}

.skip-item {
  text-decoration: line-through;
  opacity: 0.35;
}

.planned-item .country-ja { color: var(--success); }

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
