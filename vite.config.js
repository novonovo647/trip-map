import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
        // index.html の内容ハッシュをリビジョンとして埋め込む
        // → デプロイごとに sw.js が変化し、ブラウザが SW 更新を検知できる
        manifestTransforms: [
          (manifestEntries) => {
            try {
              const content = readFileSync(resolve(__dirname, 'dist/index.html'))
              const hash = createHash('md5').update(content).digest('hex').slice(0, 8)
              const manifest = manifestEntries.map(entry =>
                entry.url === 'index.html' ? { ...entry, revision: hash } : entry
              )
              return { manifest, warnings: [] }
            } catch {
              return { manifest: manifestEntries, warnings: [] }
            }
          },
        ],
      },
    }),
    viteSingleFile(),
  ],
  base: './',
})
