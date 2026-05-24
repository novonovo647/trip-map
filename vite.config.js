import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'

const BUILD_TS = Date.now()

export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile(),
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
