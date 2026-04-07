export const codeBlocks = {
  pipeline: {
    lang: 'text',
    code: `
request.body -> inspect() -> transform -> Response
`,
  },

  // --- API signatures ---

  readySig: {
    lang: 'typescript',
    code: `
import { ready } from '@standardagents/sip'

// Auto-detect WASM loader (uses globalThis.__SIP_WASM_LOADER__)
await ready()

// Or pass a pre-compiled WebAssembly.Module
await ready({ wasm: compiledModule })

// Or pass raw WASM bytes
await ready({ wasm: wasmArrayBuffer })
`,
  },
  inspectSig: {
    lang: 'typescript',
    code: `
import { inspect } from '@standardagents/sip'

// Accepts any ByteInput: Request, Response, ReadableStream,
// ArrayBuffer, Uint8Array, Blob, or AsyncIterable<Uint8Array>
const { info, source } = await inspect(request)

info.format    // 'jpeg' | 'png' | 'webp' | 'avif'
info.width     // pixel width
info.height    // pixel height
info.hasAlpha  // boolean
`,
  },
  transformSig: {
    lang: 'typescript',
    code: `
import { transform } from '@standardagents/sip'

// One-shot: decode → resize → encode as JPEG
const image = transform(input, {
  width: 2048,   // max output width (aspect ratio preserved)
  height: 2048,  // max output height
  quality: 82,   // JPEG quality 1–100
})

// image is an EncodedImage (AsyncIterable<Uint8Array>)
// with .info and .stats promises
`,
  },
  decodeSig: {
    lang: 'typescript',
    code: `
import { decode } from '@standardagents/sip'

const pixels = decode(input)  // PixelStream (AsyncIterable<Scanline>)

const info = await pixels.info
// { width, height, originalFormat }

for await (const scanline of pixels) {
  scanline.data   // Uint8Array — RGB row (width * 3 bytes)
  scanline.width  // pixel width
  scanline.y      // row index
}
`,
  },
  resizeSig: {
    lang: 'typescript',
    code: `
import { decode, resize } from '@standardagents/sip'

const pixels = decode(input)
const resized = resize(pixels, { width: 800, height: 800 })

// resized is a new PixelStream with updated dimensions
const info = await resized.info
// { width: 800, height: 600, originalFormat: 'jpeg' }
`,
  },
  encodeJpegSig: {
    lang: 'typescript',
    code: `
import { decode, encodeJpeg, resize } from '@standardagents/sip'

const pixels = decode(input)
const resized = resize(pixels, { width: 1024, height: 1024 })
const image = encodeJpeg(resized, { quality: 78 })

// image is an EncodedImage (AsyncIterable<Uint8Array>)
`,
  },
  collectSig: {
    lang: 'typescript',
    code: `
import { collect, transform } from '@standardagents/sip'

const image = transform(input, { width: 512, height: 512 })
const { data, info, stats } = await collect(image)

data   // ArrayBuffer — complete JPEG
info   // { width, height, mimeType, originalFormat }
stats  // { peakPipelineBytes, peakCodecBytes, bytesIn, bytesOut, ... }
`,
  },
  toResponseSig: {
    lang: 'typescript',
    code: `
import { toResponse, transform } from '@standardagents/sip'

const image = transform(request, { width: 1600, height: 1600 })

// Streams JPEG chunks directly into the Response body
return toResponse(image, {
  headers: { 'Cache-Control': 'public, max-age=31536000' },
})
`,
  },
  toReadableStreamSig: {
    lang: 'typescript',
    code: `
import { toReadableStream, transform } from '@standardagents/sip'

const image = transform(input, { width: 1024 })
const stream = toReadableStream(image) // ReadableStream<Uint8Array>
`,
  },

  // --- Example ---

  fullExample: {
    lang: 'typescript',
    code: `
import { collect, inspect, ready, toResponse, transform } from '@standardagents/sip'
import createSipModule from '@standardagents/sip/dist/sip.js'
import sipWasm from '@standardagents/sip/dist/sip.wasm'

globalThis.__SIP_WASM_LOADER__ = async () =>
  createSipModule({
    instantiateWasm(imports, receiveInstance) {
      WebAssembly.instantiate(sipWasm, imports).then((instance) => {
        receiveInstance(instance)
      })
      return {}
    },
  })

let boot: Promise<void> | undefined

const HTML = \`<!doctype html>
<html><head><meta charset="utf-8"><title>sip demo</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 2rem auto; }
  img { max-width: 100%; margin-top: 1rem; }
  input, button { margin-top: 1rem; }
</style></head><body>
<h1>sip image resizer</h1>
<form method="post" enctype="multipart/form-data">
  <input type="file" name="image" accept="image/*" required>
  <button type="submit">Resize</button>
</form>
</body></html>\`

export default {
  async fetch(request: Request) {
    boot ??= ready()
    await boot

    if (request.method === 'GET') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const form = await request.formData()
    const file = form.get('image')
    if (!file || !(file instanceof File)) {
      return new Response('No image uploaded', { status: 400 })
    }

    const { info } = await inspect(file)
    const image = transform(file, { width: 1024, height: 1024, quality: 82 })
    const result = await collect(image)

    return new Response(result.data, {
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Original': \`\${info.format} \${info.width}x\${info.height}\`,
        'X-Output': \`jpeg \${result.info.width}x\${result.info.height}\`,
      },
    })
  },
}
`,
  },
}
