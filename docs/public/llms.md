# sip — Small Image Processor

> Ultra low memory WASM image processing for Cloudflare Workers.

This is the LLM-friendly markdown version of the sip documentation. The interactive site lives at <https://sip.standardagents.ai>. Source: <https://github.com/standardagents/sip>.

---

## What is sip?

sip is an image processing library built specifically for Cloudflare Workers. Workers have a 128 MB memory limit, and most image libraries blow through that the moment you decode a large photo. A 25 megapixel JPEG becomes ~100 MB of buffered pixels in memory.

sip avoids that by processing images one row at a time. It never holds the full decoded image in memory. For JPEG inputs it can even decode at a reduced resolution using DCT scaling, so a 6800px-wide photo might only decode at 850px internally.

The output is always JPEG. You give sip an image (JPEG, PNG, WebP, or AVIF), tell it the max dimensions and quality you want, and it gives you back a resized JPEG.

### Why sip?

Cloudflare already has built-in image processing, but it can still be useful to run transforms directly inside your own Worker or Durable Object. That can mean fewer bindings to manage, better isolation inside the code that already owns the request, and easier distribution when you want image processing packaged as part of your application instead of a separate service boundary.

---

## Installation

```bash
pnpm add @standardagents/sip
# or
npm install @standardagents/sip
# or
yarn add @standardagents/sip
# or
bun add @standardagents/sip
```

sip ships as ESM with TypeScript types included. The WASM module ships with the package — no extra build step required.

---

## API

Every function is a named export from `@standardagents/sip`. The high-level path is `transform` + `toResponse`. The lower-level primitives let you build custom pipelines.

### `ready(options?)`

Loads the WASM module. Call this once when your Worker starts up and cache the promise. In most Cloudflare Worker setups you can just call `ready()` with no arguments.

```typescript
import { ready } from '@standardagents/sip'

// Auto-detect (Workers, Node, browser)
await ready()

// Or pass a pre-compiled WebAssembly.Module explicitly
await ready({ wasm: compiledModule })

// Or pass raw WASM bytes
await ready({ wasm: wasmArrayBuffer })
```

### `inspect(input)`

Reads just enough bytes to determine format, dimensions, and alpha — without decoding the full image. Returns an `InspectResult` with `info` and a reusable `source` that can be passed into `transform()` or `decode()`.

```typescript
import { inspect } from '@standardagents/sip'

const { info, source } = await inspect(request)

info.format    // 'jpeg' | 'png' | 'webp' | 'avif'
info.width     // pixel width
info.height    // pixel height
info.hasAlpha  // boolean
```

Throws if the format is unrecognized. Useful for validating or rejecting images before doing the expensive work.

### `transform(input, options?)`

The main function. Takes any supported input, decodes it, resizes it, and encodes it as JPEG — all in one call. Returns an `EncodedImage`, which is an async iterable of JPEG chunks. Nothing actually runs until you start consuming it.

```typescript
import { transform } from '@standardagents/sip'

const image = transform(input, {
  width: 2048,   // max output width (aspect ratio preserved)
  height: 2048,  // max output height
  quality: 82,   // JPEG quality 1–100, defaults to 85
})

// image is an EncodedImage with .info and .stats promises
const info = await image.info
const stats = await image.stats
```

**Options (`TransformOptions`):**

| Option | Description |
|--------|-------------|
| `width?` | Max output width. Aspect ratio is always preserved. Never upscales. |
| `height?` | Max output height. Aspect ratio is always preserved. Never upscales. |
| `quality?` | JPEG quality, 1–100. Defaults to 85. |

### `decode(input)`

Decodes an image into a `PixelStream` — an async iterable that yields one row of RGB pixels at a time. Each row is a `Scanline` with `data` (a `Uint8Array` of width × 3 bytes), `width`, and `y`.

```typescript
import { decode } from '@standardagents/sip'

const pixels = decode(input)

const info = await pixels.info
// { width, height, originalFormat }

for await (const scanline of pixels) {
  scanline.data   // Uint8Array — RGB row (width * 3 bytes)
  scanline.width  // pixel width
  scanline.y      // row index
}
```

### `resize(stream, options)`

Takes a `PixelStream` and resizes it row by row using bilinear interpolation. Only keeps two rows in memory at a time. Returns a new `PixelStream`.

```typescript
import { decode, resize } from '@standardagents/sip'

const pixels = decode(input)
const resized = resize(pixels, { width: 800, height: 800 })

const info = await resized.info
// { width: 800, height: 600, originalFormat: 'jpeg' }
```

### `encodeJpeg(stream, options?)`

Takes a `PixelStream` and encodes it as JPEG. Returns an `EncodedImage` that yields chunks as they're ready.

```typescript
import { decode, encodeJpeg, resize } from '@standardagents/sip'

const pixels = decode(input)
const resized = resize(pixels, { width: 1024, height: 1024 })
const image = encodeJpeg(resized, { quality: 78 })
```

### `collect(image)`

Consumes an `EncodedImage` and gives you the full JPEG as an `ArrayBuffer`, along with output dimensions and memory stats. Use this when you need the bytes in memory (e.g. to store in R2). Use `toResponse()` when you just want to send the image back to the client.

```typescript
import { collect, transform } from '@standardagents/sip'

const image = transform(input, { width: 512, height: 512 })
const { data, info, stats } = await collect(image)

data   // ArrayBuffer — complete JPEG
info   // { width, height, mimeType, originalFormat }
stats  // { peakPipelineBytes, peakCodecBytes, bytesIn, bytesOut, ... }
```

### `toResponse(image, init?)`

Streams an `EncodedImage` straight into a `Response`. Sets the content type to `image/jpeg` for you. You can pass extra headers or a status code through the optional `ResponseInit`.

```typescript
import { toResponse, transform } from '@standardagents/sip'

const image = transform(request, { width: 1600, height: 1600 })

return toResponse(image, {
  headers: { 'Cache-Control': 'public, max-age=31536000' },
})
```

### `toReadableStream(image)`

Converts an `EncodedImage` into a standard `ReadableStream<Uint8Array>`. Useful if you need to pipe the output somewhere other than a `Response`.

```typescript
import { toReadableStream, transform } from '@standardagents/sip'

const image = transform(input, { width: 1024 })
const stream = toReadableStream(image)
```

### Types

| Type | Description |
|------|-------------|
| `ByteInput` | Anything sip can read from: `ArrayBuffer`, `Uint8Array`, `Blob`, `Request`, `Response`, `ReadableStream`, or `AsyncIterable<Uint8Array>`. |
| `ImageInfo` | `{ format, width, height, hasAlpha }` |
| `InputSource` | A handle returned by `inspect()`. Pass it to `transform()` or `decode()` so sip doesn't have to re-read the headers. |
| `InspectResult` | `{ info: ImageInfo, source: InputSource }` |
| `TransformOptions` | `{ width?, height?, quality? }` |
| `EncodedImage` | An async iterable of `Uint8Array` JPEG chunks with `.info` and `.stats` promises. |
| `EncodedImageInfo` | `{ width, height, mimeType, originalFormat }` |
| `PixelStream` | An async iterable of `Scanline` objects with an `.info` promise. |
| `Scanline` | `{ data: Uint8Array, width, y }` — one row of RGB pixels. |
| `TransformStats` | Memory and byte stats: `peakPipelineBytes`, `peakCodecBytes`, `bytesIn`, `bytesOut`, and more. |

---

## Format Support

sip can read four image formats. The output is always JPEG.

| Format | Decoder | Method | Notes |
|--------|---------|--------|-------|
| JPEG | libjpeg-turbo (WASM) | DCT scaling + scanline decode | Best path. Can decode large images at 1/2, 1/4, or 1/8 scale. |
| PNG | libspng (WASM) | Row-by-row decode | Decodes one row at a time. More efficient than a full pixel buffer. |
| WebP | @jsquash/webp | Full decode | Works, but decodes the whole image into memory first. Uses more RAM. |
| AVIF | @jsquash/avif | Full decode | Same as WebP — works but uses more memory than JPEG or PNG. |

---

## Example

A complete single-file Cloudflare Worker that serves an upload page and streams back the resized JPEG. This is the entire server — HTML, styles, and image processing in one file.

```typescript
import { inspect, ready, toResponse, transform } from '@standardagents/sip'
import sipWasm from '@standardagents/sip/dist/sip.wasm'

const HTML = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>sip image resizer</title>
  <style>
    body { font-family: system-ui; max-width: 640px; margin: 2rem auto;
           background: #0a0a0a; color: #fff; }
    form { margin-top: 1.5rem; background: #111; border: 1px solid #222;
           border-radius: 12px; overflow: hidden; }
    .fields { display: grid; grid-template-columns: repeat(3, 1fr);
              border-bottom: 1px solid #222; }
    label { padding: 0.75rem; border-right: 1px solid #222; font-size: 0.85rem; }
    label:last-child { border-right: none; }
    input[type="number"] { width: 100%; box-sizing: border-box; background: #000;
                           border: 1px solid #333; border-radius: 6px; color: #fff;
                           padding: 0.5rem; margin-top: 0.25rem; font: inherit; }
    .upload { padding: 0.75rem; border-bottom: 1px solid #222; }
    button { margin: 0.75rem; padding: 0.7rem 1rem; border: none;
             border-radius: 8px; background: #fff; color: #000;
             font-weight: 700; cursor: pointer; }
    img { width: 100%; margin-top: 1rem; border-radius: 12px; }
  </style>
</head><body>
  <h1>sip image resizer</h1>
  <form id="f">
    <div class="upload"><input id="file" type="file" accept="image/*" required></div>
    <div class="fields">
      <label>Width <input id="w" type="number" value="1024"></label>
      <label>Height <input id="h" type="number" value="1024"></label>
      <label>Quality <input id="q" type="number" value="82" min="1" max="100"></label>
    </div>
    <button>Resize</button>
  </form>
  <img id="out" hidden>
  <script>
    document.getElementById('f').onsubmit = async e => {
      e.preventDefault()
      const file = document.getElementById('file').files[0]
      if (!file) return
      const p = new URLSearchParams({
        width: document.getElementById('w').value,
        height: document.getElementById('h').value,
        quality: document.getElementById('q').value,
      })
      const res = await fetch('/api/process?' + p, {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
      })
      const blob = await res.blob()
      const img = document.getElementById('out')
      img.src = URL.createObjectURL(blob)
      img.hidden = false
    }
  </script>
</body></html>`

export default {
  async fetch(request: Request) {
    await ready({ wasm: sipWasm })
    const url = new URL(request.url)

    // GET / → serve upload page
    if (request.method === 'GET') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // POST /api/process → resize and stream back JPEG
    const { source } = await inspect(request)
    return toResponse(transform(source, {
      width:   Number(url.searchParams.get('width'))   || 1024,
      height:  Number(url.searchParams.get('height'))  || 1024,
      quality: Number(url.searchParams.get('quality')) || 82,
    }))
  },
}
```

A ready-to-deploy version of this worker lives at <https://github.com/standardagents/sip-worker-example>.

---

## Caveats

### Output is always JPEG

sip doesn't produce PNG, WebP, or AVIF output. If the input has transparency, it's discarded.

### WebP and AVIF use more memory

JPEG and PNG get the efficient scanline path. WebP and AVIF still need to decode the entire image into memory before sip can process it. They work fine, but they use significantly more RAM. Native WASM decoders for these formats are planned.

### Memory numbers in the demo

The interactive demo on <https://sip.standardagents.ai> reports the peak memory that sip itself used during processing. That's not the same as total Worker memory — the runtime, your code, and V8 overhead are separate.

---

## License

[MIT](https://github.com/standardagents/sip/blob/main/LICENSE) — Standard Agents
