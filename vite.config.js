import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createPNG, drawFavicon } = require('./scripts/gen-icons.cjs')

const BUILD_TS = Date.now()
const FAVICON_SIZE = 32

export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile(),
    {
      // favicon を data URI で index.html に埋め込む（単一ファイル配布と整合）
      name: 'inject-favicon',
      transformIndexHtml() {
        const png = createPNG(FAVICON_SIZE, FAVICON_SIZE, drawFavicon)
        const href = `data:image/png;base64,${png.toString('base64')}`
        return [{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', href }, injectTo: 'head' }]
      },
    },
    {
      // ビルド時に dist/version.json を生成（SW非依存バージョンチェック用）
      name: 'gen-version',
      apply: 'build',
      closeBundle() {
        fs.writeFileSync('dist/version.json', JSON.stringify({ v: BUILD_TS }))
      },
    },
  ],
  base: './',
  define: {
    __APP_BUILD__: JSON.stringify(BUILD_TS),
  },
})
