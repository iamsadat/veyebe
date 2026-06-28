import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'scanner-worker': resolve(__dirname, 'src/main/scanner-worker.ts'),
        },
      },
    },
  },
  preload: { build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } } },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer') } },
    build: { rollupOptions: { input: resolve(__dirname, 'index.html') } },
  },
})
