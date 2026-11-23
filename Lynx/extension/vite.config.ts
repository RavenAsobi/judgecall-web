import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import vue from '@vitejs/plugin-vue'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    vue(),
    crx({ manifest }),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    minify: false,
  },
})
