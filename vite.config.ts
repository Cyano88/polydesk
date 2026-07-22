import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const apiProxyOrigin = process.env.POLYDESK_API_PROXY_ORIGIN?.trim() || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': apiProxyOrigin,
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
