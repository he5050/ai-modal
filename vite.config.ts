import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror')) {
            return 'codemirror'
          }
          if (id.includes('prettier/standalone')) {
            return 'prettier-core'
          }
          if (id.includes('prettier/plugins/markdown')) {
            return 'prettier-markdown'
          }
          if (
            id.includes('prettier/plugins/babel') ||
            id.includes('@babel/parser')
          ) {
            return 'prettier-babel'
          }
          if (id.includes('prettier/plugins/estree')) {
            return 'prettier-estree'
          }
          if (
            id.includes('prettier/plugins/yaml') ||
            id.includes('yaml-unist-parser') ||
            id.includes('js-yaml')
          ) {
            return 'prettier-yaml'
          }
          if (id.includes('smol-toml')) {
            return 'toml-vendor'
          }
          if (id.includes('@tauri-apps')) {
            return 'tauri'
          }
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor'
          }
          if (id.includes('animejs') || id.includes('lucide-react')) {
            return 'ui-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
})
