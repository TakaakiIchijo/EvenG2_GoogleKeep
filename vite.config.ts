import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  // VITE_BACKEND_URL が未設定の場合はビルド時に警告を出す
  if (mode === 'production' && !process.env.VITE_BACKEND_URL) {
    console.warn(
      '\n⚠️  WARNING: VITE_BACKEND_URL is not set.\n' +
      '   The app will fall back to http://localhost:8080 which will NOT work in production.\n' +
      '   Set VITE_BACKEND_URL in your Railway/Render dashboard and redeploy.\n'
    )
  }

  return {
    base: '/',
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
