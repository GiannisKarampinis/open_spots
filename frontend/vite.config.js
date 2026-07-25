import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendOrigin = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'
const mediaOrigin = process.env.VITE_MEDIA_ORIGIN || 'http://127.0.0.1'
const backendProxy = {
  target: backendOrigin,
  changeOrigin: true,
}
const mediaProxy = {
  target: mediaOrigin,
  changeOrigin: true,
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': backendProxy,
      '/static': backendProxy,
      '/media': mediaProxy,
    },
  },
})
