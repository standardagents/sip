import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import shikiPlugin from './shiki-plugin.js'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: './',
  root: rootDir,
  plugins: [
    shikiPlugin(),
    cloudflare({
      configPath: resolve(rootDir, 'wrangler.jsonc'),
    }),
  ],
  build: {
    emptyOutDir: true,
    outDir: resolve(rootDir, '../docs-dist'),
  },
})
