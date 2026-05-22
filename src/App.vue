<template>
  <WorldMap />
  <Teleport to="body">
    <div v-if="needRefresh" class="update-banner">
      <span>新しいバージョンがあります</span>
      <button @click="updateServiceWorker()">更新</button>
    </div>
  </Teleport>
</template>

<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'
import WorldMap from './components/WorldMap.vue'

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(r) {
    // 60分ごとに新バージョンを確認
    r && setInterval(() => { r.update() }, 60 * 60 * 1000)
  },
})
</script>

<style scoped>
.update-banner {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  left: 50%;
  transform: translateX(-50%);
  background: #16213e;
  border: 1px solid #4a90d9;
  color: #eee;
  padding: 12px 18px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 0.9rem;
  z-index: 9999;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}

.update-banner button {
  background: #4a90d9;
  color: #fff;
  border: none;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: bold;
}
</style>
