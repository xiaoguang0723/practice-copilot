import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'electron/main.ts' },
      rollupOptions: { external: ['better-sqlite3', 'uiohook-napi'] }
    }
  },
  preload: {
    build: {
      lib: { entry: 'electron/preload.ts' },
      rollupOptions: {
        output: { entryFileNames: 'preload.cjs', format: 'cjs' }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: { input: resolve(import.meta.dirname, 'src/index.html') }
    },
    plugins: [react()],
    root: 'src'
  }
})
