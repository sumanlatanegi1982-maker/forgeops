import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // TrueForge runs on :8790 by default. Proxy /api to it so the browser
    // can talk to TrueForge without CORS headaches during development.
    proxy: {
      '/api': {
        target: process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790',
        changeOrigin: true,
      },
    },
  },
})
