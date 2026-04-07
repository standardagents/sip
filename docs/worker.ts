// @ts-nocheck — dist/sip.js is an Emscripten build, not typed
import createSipModule from '../dist/sip.js'
import sipWasm from '../dist/sip.wasm'
import { process as sipProcess } from '../src/pipeline'
import { probe } from '../src/probe'
import { initStreaming } from '../src/streaming'
import { getWasmModule, isWasmAvailable } from '../src/wasm/loader'

interface Env {
  ASSETS: Fetcher
}

// Register the WASM loader that uses the statically imported WASM module
globalThis.__SIP_WASM_LOADER__ = async () => {
  return createSipModule({
    instantiateWasm(
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance) => void
    ) {
      WebAssembly.instantiate(sipWasm, imports).then((instance) => {
        receiveInstance(instance)
      })
      return {}
    },
  })
}

let streamingReady = false

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/process' && request.method === 'POST') {
      return handleProcess(request)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

async function handleProcess(request: Request): Promise<Response> {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null
    const maxWidth = Number(formData.get('maxWidth')) || 2048
    const maxHeight = Number(formData.get('maxHeight')) || 2048
    const quality = Number(formData.get('quality')) || 85

    if (!file) {
      return Response.json({ error: 'No image provided' }, { status: 400 })
    }

    const inputBuffer = await file.arrayBuffer()
    const inputBytes = inputBuffer.byteLength

    const probeInfo = probe(inputBuffer)
    if (probeInfo.format === 'unknown') {
      return Response.json({ error: 'Unsupported image format' }, { status: 415 })
    }

    // Theoretical memory: full RGBA decode of original dimensions
    const theoreticalMemory = probeInfo.width * probeInfo.height * 4

    if (!streamingReady) {
      streamingReady = await initStreaming()
    }

    // Measure actual WASM memory before processing
    let wasmMemBefore = 0
    if (isWasmAvailable()) {
      wasmMemBefore = getWasmModule().HEAPU8.buffer.byteLength
    }

    const startTime = performance.now()
    const result = await sipProcess(inputBuffer, { maxWidth, maxHeight, quality })
    const elapsed = performance.now() - startTime

    // Measure actual WASM memory after processing (WASM memory only grows, so
    // the post-processing size reflects the peak allocation during the call)
    let sipPeakMemory = theoreticalMemory
    if (isWasmAvailable()) {
      const wasmMemAfter = getWasmModule().HEAPU8.buffer.byteLength
      sipPeakMemory = wasmMemAfter
    }

    return new Response(result.data, {
      headers: {
        'Content-Type': result.mimeType,
        'X-Input-Width': String(probeInfo.width),
        'X-Input-Height': String(probeInfo.height),
        'X-Input-Format': probeInfo.format,
        'X-Input-Bytes': String(inputBytes),
        'X-Output-Width': String(result.width),
        'X-Output-Height': String(result.height),
        'X-Output-Bytes': String(result.data.byteLength),
        'X-Theoretical-Memory': String(theoreticalMemory),
        'X-Sip-Peak-Memory': String(sipPeakMemory),
        'X-Processing-Ms': String(Math.round(elapsed)),
        'X-Streaming': String(streamingReady),
        'Access-Control-Expose-Headers': 'X-Input-Width, X-Input-Height, X-Input-Format, X-Input-Bytes, X-Output-Width, X-Output-Height, X-Output-Bytes, X-Theoretical-Memory, X-Sip-Peak-Memory, X-Processing-Ms, X-Streaming',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
