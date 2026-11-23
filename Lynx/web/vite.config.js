import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [{
    name: 'lynx-beta-dev-alias',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html' || req.url === '/lynx-beta.html') {
          req.url = '/lynx-beta.source.html'
        }
        next()
      })
    },
  }],
  build: {
    rollupOptions: {
      input: resolve(process.cwd(), 'lynx-beta.source.html'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // REST API 代理到后端
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // WebSocket 代理到后端
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
