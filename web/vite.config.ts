/// <reference types="vitest/config" />

import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/readyz': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /\/node_modules\/react(-dom)?\//, priority: 10 },
            { name: 'router', test: /\/node_modules\/react-router\//, priority: 9 },
            { name: 'query', test: /\/node_modules\/@tanstack\/react-query/, priority: 8 },
            { name: 'state', test: /\/node_modules\/zustand/, priority: 7 },
            { name: 'shiki', test: /\/src\/lib\/shiki\.bundle\.ts$/, priority: 5 },
            { name: 'motion', test: /\/node_modules\/motion\//, priority: 4 },
            { name: 'radix', test: /\/node_modules\/(@radix-ui|radix-ui)\//, priority: 3 },
            { name: 'ai', test: /\/node_modules\/ai\//, priority: 2 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['node_modules', '.git', 'dist'],
  },
})
