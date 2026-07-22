<template>
  <Teleport to="body">
    <div class="list-overlay" @click.self="$emit('close')">
      <div class="list-panel set-detail-panel">
        <div class="list-header">
          <h2>{{ setName }}</h2>
          <div class="list-header-actions">
            <span v-if="grandTotal > 0" class="set-grand-total">総額 {{ formatYen(grandTotal) }}</span>
            <button v-if="canEdit" class="edit-mode-btn" @click="$emit('edit')">✎ 編集</button>
            <button class="close-btn" @click="$emit('close')">✕</button>
          </div>
        </div>
        <div class="set-detail-body">
          <div v-for="(plan, j) in plans" :key="j" class="plan-detail" :style="{ borderLeftColor: plan.color }">
            <h3 class="plan-detail-toggle" :style="{ color: plan.color }" @click="toggle(j)">
              <span class="plan-toggle-icon">{{ openPlans[j] ? '▾' : '▸' }}</span>
              {{ plan.label }}{{ plan.nights ? `（${plan.nights}泊）` : '' }}
            </h3>
            <div v-show="openPlans[j]">
              <!-- タイムライン: 都市 / 移動エントリー混在 -->
              <div class="city-stops">
                <template v-for="(item, k) in plan.cities" :key="k">
                  <!-- 移動エントリー -->
                  <div v-if="item._type === 'transport'" class="stop-leg">
                    <span class="stop-leg-arrow">↓</span>
                    <span class="stop-leg-mode">{{ modeEmoji(item.mode) }}</span>
                    <a v-if="item.url" :href="item.url" target="_blank" rel="noopener" class="stop-leg-link">{{ item.transport }}</a>
                    <span v-else-if="item.transport" class="stop-leg-text">{{ item.transport }}</span>
                    <span v-if="item.price" class="stop-leg-price">{{ formatYen(item.price) }}</span>
                    <span v-if="item.memo" class="stop-memo" v-html="memoHtml(item.memo)"></span>
                  </div>
                  <!-- 都市エントリー（直前が都市なら矢印を補完） -->
                  <template v-else>
                    <div v-if="k > 0 && plan.cities[k-1]._type === 'city'" class="stop-leg">
                      <span class="stop-leg-arrow">↓</span>
                    </div>
                    <div class="city-stop">
                      <div class="stop-header">
                        <span class="stop-name">{{ item.name }}</span>
                        <span v-if="item.nights" class="stop-nights">{{ item.nights }}泊</span>
                        <span v-if="item.memo" class="stop-memo" v-html="memoHtml(item.memo)"></span>
                      </div>
                      <ul v-if="item.hotels && item.hotels.length" class="stop-hotels">
                        <li v-for="(hotel, hi) in item.hotels" :key="hi">
                          <a v-if="hotel.url" :href="hotel.url" target="_blank" rel="noopener">{{ hotel.name }}</a>
                          <span v-else>{{ hotel.name }}</span>
                          <span v-if="hotel.nights" class="stop-hotel-meta">{{ hotel.nights }}泊</span>
                          <span v-if="hotel.price" class="stop-hotel-meta">{{ formatYen(hotel.price) }}</span>
                          <span v-if="hotel.memo" class="spot-memo spot-memo-block" v-html="memoHtml(hotel.memo)"></span>
                        </li>
                      </ul>
                      <ul v-if="item.spots && item.spots.length" class="stop-spots">
                        <li v-for="(spot, si) in item.spots" :key="si">
                          <a v-if="spot.url" :href="spot.url" target="_blank" rel="noopener">{{ spot.name }}</a>
                          <span v-else>{{ spot.name }}</span>
                          <span v-if="spot.memo" class="spot-memo spot-memo-block" v-html="memoHtml(spot.memo)"></span>
                        </li>
                      </ul>
                    </div>
                  </template>
                </template>
              </div>
              <div class="plan-countries">{{ plan.countries.map(c => getCountryJa(c)).join('・') }}</div>
              <div v-if="planCost(plan).total > 0" class="plan-total">
                <span class="plan-total-label">総額</span>
                <span class="plan-total-value">{{ formatYen(planCost(plan).total) }}</span>
                <span v-if="planCost(plan).transport && planCost(plan).hotel" class="plan-total-breakdown">（移動 {{ formatYen(planCost(plan).transport) }}・宿泊 {{ formatYen(planCost(plan).hotel) }}）</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { memoHtml, formatYen } from '../utils/text.js'
import { modeEmoji } from '../utils/transport.js'

const props = defineProps({
  setName:     { type: String,   default: '' },
  plans:       { type: Array,    default: () => [] },
  getCountryJa:{ type: Function, default: (c) => c },
  canEdit:     { type: Boolean,  default: false },
})

defineEmits(['close', 'edit'])

const openPlans = ref([])
watch(() => props.plans, (list) => { openPlans.value = list.map(() => true) }, { immediate: true })

function toggle(j) { openPlans.value[j] = !openPlans.value[j] }

// コースの料金合計（移動＋宿泊）を集計する。
function planCost(plan) {
  let transport = 0, hotel = 0
  for (const item of plan.cities) {
    if (item._type === 'transport') {
      if (item.price) transport += Number(item.price) || 0
    } else if (item._type === 'city') {
      for (const h of (item.hotels || [])) {
        if (h.price) hotel += Number(h.price) || 0
      }
    }
  }
  return { transport, hotel, total: transport + hotel }
}

// セット全体（全コース）の総額
const grandTotal = computed(() =>
  props.plans.reduce((acc, p) => acc + planCost(p).total, 0)
)
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

/* セット詳細モーダル */
.set-detail-panel {
  max-width: 520px;
}

.set-detail-body {
  overflow-y: auto;
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(82vh - 60px);
}

.plan-detail {
  border-left: 3px solid;
  padding-left: 12px;
}

.plan-detail-toggle {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 4px;
}

.plan-detail-toggle:hover {
  opacity: 0.85;
}

.plan-toggle-icon {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.plan-detail h3 {
  font-size: 0.9rem;
  margin: 0 0 8px;
}

/* 都市タイムライン */
.city-stops {
  display: flex;
  flex-direction: column;
  margin-bottom: 6px;
}

.city-stop {
  display: flex;
  flex-direction: column;
}

.stop-leg {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0 2px 4px;
}

.stop-leg-arrow {
  color: var(--text-faint);
  font-size: 0.75rem;
  line-height: 1;
}

.stop-leg-mode {
  font-size: 0.85rem;
  line-height: 1;
  flex-shrink: 0;
}

.stop-leg-link,
.stop-leg-text {
  font-size: 0.72rem;
  color: var(--accent);
}

.stop-leg-link {
  text-decoration: underline dotted;
}

.stop-leg-link:hover {
  color: var(--accent-hover);
}

.stop-leg-price {
  font-size: 0.72rem;
  color: var(--success);
  font-weight: 600;
}

.stop-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 0;
}

.stop-name {
  font-size: 0.82rem;
  color: var(--text);
  font-weight: 500;
}

.stop-nights {
  font-size: 0.7rem;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 5px;
  border-radius: 3px;
}

.stop-spots {
  list-style: none;
  margin: 2px 0 2px 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stop-spots li {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.stop-spots li::before {
  content: '📍 ';
  font-size: 0.65rem;
}

.stop-spots a {
  color: var(--accent);
  text-decoration: underline dotted;
}

.stop-spots a:hover {
  color: var(--accent-hover);
}

.stop-hotels {
  list-style: none;
  margin: 2px 0 2px 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stop-hotels li {
  font-size: 0.72rem;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 5px;
}

.stop-hotels li::before {
  content: '🏨 ';
  font-size: 0.65rem;
}

.stop-hotels a {
  color: var(--accent);
  text-decoration: underline dotted;
}

.stop-hotels a:hover {
  color: var(--accent-hover);
}

.stop-hotel-meta {
  font-size: 0.68rem;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 0 5px;
  border-radius: 3px;
}

.stop-memo {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 1px 0;
  padding: 0;
}

.spot-memo {
  font-size: 0.68rem;
  color: var(--text-faint);
  font-style: italic;
  margin-left: 4px;
}

.spot-memo-block {
  display: block;
  margin-left: 0;
  margin-top: 1px;
}

.plan-countries {
  font-size: 0.75rem;
  color: var(--accent);
  margin-top: 2px;
}

.set-grand-total {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--success);
  background: var(--success-soft);
  padding: 2px 10px;
  border-radius: 12px;
  white-space: nowrap;
}
.plan-total {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 0.8rem;
}
.plan-total-label { color: var(--text-muted); }
.plan-total-value { color: var(--success); font-weight: 600; }
.plan-total-breakdown { color: var(--text-faint); font-size: 0.72rem; }
</style>
