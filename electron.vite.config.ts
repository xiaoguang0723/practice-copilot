import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'electron/main.ts' }
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
      rollupOptions: { input: 'src/index.html' }
    },
    plugins: [react()],
    root: 'src'
  }
})
