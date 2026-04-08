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
import sipWasm from '@standardagents/sip/dist/sip.wasm'

// Preferred in Workers and bundlers that can import the .wasm asset
await ready({ wasm: sipWasm })

// Or pass a pre-compiled WebAssembly.Module explicitly
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
import { inspect, ready, toResponse, transform } from '@standardagents/sip'
import sipWasm from '@standardagents/sip/dist/sip.wasm'

// HTML trimmed for brevity.
// Full deployable starter: github.com/standardagents/sip-worker-example
const HTML = '<!doctype html>...'

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    await ready({ wasm: sipWasm })

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    if (request.method !== 'POST' || url.pathname !== '/api/process') {
      return new Response('Not found', { status: 404 })
    }

    const { info, source } = await inspect(request)
    if (info.format !== 'jpeg' && info.format !== 'png') {
      return new Response('This example worker accepts JPEG and PNG inputs only.', {
        status: 415,
      })
    }
    const image = transform(source, {
      width: Number(url.searchParams.get('width')) || 1024,
      height: Number(url.searchParams.get('height')) || 1024,
      quality: Number(url.searchParams.get('quality')) || 82,
    })

    return toResponse(image)
  },
}
`,
  },
}
