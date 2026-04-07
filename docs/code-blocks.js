export const codeBlocks = {
  pipeline: {
    lang: 'text',
    code: `Input (any format) → Decode (scanline) → Resize (2-row buffer) → Encode (scanline) → JPEG output`,
  },
  probe: {
    lang: 'typescript',
    code: `
import { probe } from '@standardagents/sip'

const info = probe(imageBuffer)
// info.format  — 'jpeg' | 'png' | 'webp' | 'avif' | 'unknown'
// info.width   — pixel width
// info.height  — pixel height
// info.hasAlpha — boolean
`,
  },
  process: {
    lang: 'typescript',
    code: `
import { sip } from '@standardagents/sip'

const result = await sip.process(imageBuffer, {
  maxWidth: 2048,
  maxHeight: 2048,
  maxBytes: 1.5 * 1024 * 1024,
  quality: 85,
})

// result.data           — ArrayBuffer (JPEG)
// result.width          — output width
// result.height         — output height
// result.mimeType       — 'image/jpeg'
// result.originalFormat — input format detected
`,
  },
  streamingApi: {
    lang: 'typescript',
    code: `
import { processJpegStreaming, processPngStreaming } from '@standardagents/sip'

// Process JPEG with explicit streaming pipeline
const result = await processJpegStreaming(jpegBuffer, {
  maxWidth: 2048,
  maxBytes: 1.5 * 1024 * 1024,
  quality: 85,
})

// Process PNG with streaming pipeline
const pngResult = await processPngStreaming(pngBuffer, {
  maxWidth: 1600,
})
`,
  },
  initStreaming: {
    lang: 'typescript',
    code: `
import { initStreaming } from '@standardagents/sip'

const available = await initStreaming()
// true if WASM loaded successfully
`,
  },
  emsdk: {
    lang: 'shell',
    code: `
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
`,
  },
  wasmBuild: {
    lang: 'shell',
    code: `
pnpm build:wasm    # compile libjpeg-turbo + libspng + sip bindings
pnpm build         # bundle the TypeScript library
pnpm test:unit     # verify everything works
`,
  },
  registerLoader: {
    lang: 'typescript',
    code: `
import createSipModule from '@standardagents/sip/dist/sip.js'

globalThis.__SIP_WASM_LOADER__ = async () => createSipModule()
await initStreaming()
`,
  },
  exampleUpload: {
    lang: 'typescript',
    code: `
import { initStreaming, sip } from '@standardagents/sip'
import createSipModule from '@standardagents/sip/dist/sip.js'

globalThis.__SIP_WASM_LOADER__ = async () => createSipModule()
await initStreaming()

export default {
  async fetch(request: Request, env: Env) {
    const body = await request.arrayBuffer()
    const result = await sip.process(body, {
      maxWidth: 2048,
      maxHeight: 2048,
      maxBytes: 1.5 * 1024 * 1024,
      quality: 85,
    })

    // Store in R2
    await env.BUCKET.put('uploads/' + crypto.randomUUID(), result.data, {
      httpMetadata: { contentType: result.mimeType },
    })

    return Response.json({
      width: result.width,
      height: result.height,
      bytes: result.data.byteLength,
    })
  },
}
`,
  },
  exampleThumb: {
    lang: 'typescript',
    code: `
export default {
  async fetch(request: Request, env: Env) {
    const original = await env.BUCKET.get(request.url)
    if (!original) return new Response('Not found', { status: 404 })

    const body = await original.arrayBuffer()
    const thumb = await sip.process(body, {
      maxWidth: 640,
      maxHeight: 640,
      maxBytes: 160_000,
      quality: 78,
    })

    return new Response(thumb.data, {
      headers: {
        'Content-Type': thumb.mimeType,
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  },
}
`,
  },
  exampleValidate: {
    lang: 'typescript',
    code: `
import { probe, sip } from '@standardagents/sip'

export default {
  async fetch(request: Request) {
    const body = await request.arrayBuffer()
    const info = probe(body)

    if (info.format === 'unknown') {
      return Response.json({ error: 'Unsupported format' }, { status: 415 })
    }

    // Skip processing if already within bounds
    if (info.width <= 800 && info.height <= 800) {
      return new Response(body, {
        headers: { 'Content-Type': 'image/' + info.format },
      })
    }

    const result = await sip.process(body, { maxWidth: 800 })
    return new Response(result.data, {
      headers: { 'Content-Type': result.mimeType },
    })
  },
}
`,
  },
  exampleDO: {
    lang: 'typescript',
    code: `
import { initStreaming, sip } from '@standardagents/sip'
import createSipModule from '@standardagents/sip/dist/sip.js'

// Initialize once per isolate
globalThis.__SIP_WASM_LOADER__ = async () => createSipModule()
await initStreaming()

export class ImageProcessor implements DurableObject {
  async fetch(request: Request) {
    const body = await request.arrayBuffer()

    const [full, thumb] = await Promise.all([
      sip.process(body, { maxWidth: 2048, quality: 85 }),
      sip.process(body, { maxWidth: 200, quality: 70 }),
    ])

    // Store both variants
    await this.ctx.storage.put('full', full.data)
    await this.ctx.storage.put('thumb', thumb.data)

    return Response.json({ ok: true })
  }
}
`,
  },
}
