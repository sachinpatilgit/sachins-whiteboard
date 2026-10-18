import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built app can be served from any subpath.
  base: './',
  server: {
    watch: {
      // Research notes and screenshots; not part of the app.
      ignored: ['**/.verify/**'],
    },
  },
})
