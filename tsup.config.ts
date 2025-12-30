import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: false, // Don't clean - WASM files are built separately
  external: [
    '@cloudflare/workers-types',
    'cloudflare:workers',
    // WASM image processing - must be external
    '@jsquash/avif',
    '@jsquash/jpeg',
    '@jsquash/png',
  ],
  sourcemap: true,
  splitting: false,
  treeshake: true,
})
