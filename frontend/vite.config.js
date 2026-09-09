import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    // Le moteur d'inférence (ai_engine, Flask) est servi sous le même origin
    // qu'en production : le frontend appelle /api/... sans question de CORS.
    proxy: {
      // Export CSV et API Laravel : plus spécifique que /api, donc en premier.
      '/api/export': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        // Le flux MJPEG reste ouvert : un délai trop court le couperait.
        timeout: 0,
      },
    },
  },
})
