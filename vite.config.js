import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: false, // public/manifest.json をそのまま使用
      workbox: {
        globPatterns: ['**/*.{html,json,png,ico,svg}'],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB（singlefile のため）
      },
    }),
    viteSingleFile(),
  ],
  base: './',
})
