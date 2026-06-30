import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'scanner-worker': resolve(__dirname, 'src/main/scanner-worker.ts'),
        },
        external: ['electron'],
      },
    },
  },
  preload: {
    build: {
      minify: 'terser',
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts'), external: ['electron'] },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer') } },
    build: {
      minify: 'terser',
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules/three')) return 'three'
            if (id.includes('@react-three')) return 'r3f'
            if (id.includes('lucide-react')) return 'icons'
          },
        },
      },
    },
  },
})
