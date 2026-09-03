import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  appType: 'mpa',
  build: {
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        work: resolve(__dirname, 'work/index.html'),
      },
    },
  },
})
