import { defineConfig } from 'vite'

// GitHub Pages では /keep-g2/ をベースパスとして使用する。
// ローカル開発時は / を使用する。
// VITE_BASE_PATH 環境変数で上書き可能。
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
