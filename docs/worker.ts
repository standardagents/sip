// @ts-nocheck - workerd loads generated wasm assets dynamically
import avifDecoderWasm from '@jsquash/avif/codec/dec/avif_dec.wasm'
import webpDecoderWasm from '@jsquash/webp/codec/dec/webp_dec.wasm'
import { collect, inspect, ready, transform } from '@standardagents/sip'

interface Env {
  ASSETS: Fetcher
  WAITLIST_API_TOKEN?: string
}

const WAITLIST_API = 'https://agents.standardagentbuilder.com/api/waitlist'

const EXPOSE_HEADERS = [
  'X-Input-Format',
  'X-Input-Width',
  'X-Input-Height',
  'X-Input-Bytes',
  'X-Output-Width',
  'X-Output-Height',
  'X-Output-Bytes',
  'X-Peak-Pipeline-Bytes',
  'X-Peak-Codec-Bytes',
  'X-Peak-Buffered-Input-Bytes',
  'X-Peak-Buffered-Output-Bytes',
  'X-Elapsed-Ms',
  'X-Stats-Notes',
].join(', ')

globalThis.__SIP_CODEC_WASM__ = {
  avif: avifDecoderWasm,
  webp: webpDecoderWasm,
}

function getTransformOptions(url: URL) {
  return {
    width: Number(url.searchParams.get('width')) || undefined,
    height: Number(url.searchParams.get('height')) || undefined,
    quality: Number(url.searchParams.get('quality')) || undefined,
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/api/early-access')) {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Use POST.' }, { status: 405 })
      }
      return handleEarlyAccess(request, env)
    }

    if (!url.pathname.endsWith('/api/process')) {
      return env.ASSETS.fetch(request)
    }

    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Use POST with a raw image body.' },
        { status: 405 }
      )
    }

    await ready()
    return handleProcess(request, url)
  },
} satisfies ExportedHandler<Env>

async function handleEarlyAccess(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { name?: string; email?: string }
    if (!body?.name || !body?.email) {
      return Response.json({ error: 'Name and email required' }, { status: 400 })
    }

    if (!env.WAITLIST_API_TOKEN) {
      console.error('[early-access] WAITLIST_API_TOKEN is not set')
      return Response.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const res = await fetch(WAITLIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.WAITLIST_API_TOKEN}`,
      },
      body: JSON.stringify({
        email: body.email,
        name: body.name,
        source: 'sip-docs',
      }),
    })

    if (!res.ok) {
      console.error(`[early-access] upstream status=${res.status}`)
      return Response.json({ error: 'Waitlist API error' }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[early-access] error:', err)
    return Response.json({ error: 'Failed to submit' }, { status: 500 })
  }
}

async function handleProcess(request: Request, url: URL): Promise<Response> {
  const startedAt = performance.now()

  try {
    const contentLength = Number(request.headers.get('content-length') || 0)
    const { info, source } = await inspect(request)
    const image = transform(source, getTransformOptions(url))
    const result = await collect(image)
    const elapsedMs = Math.round(performance.now() - startedAt)

    return new Response(result.data, {
      headers: {
        'Content-Type': result.info.mimeType,
        'Cache-Control': 'no-store',
        'Access-Control-Expose-Headers': EXPOSE_HEADERS,
        'X-Input-Format': info.format,
        'X-Input-Width': String(info.width),
        'X-Input-Height': String(info.height),
        'X-Input-Bytes': String(result.stats.bytesIn || contentLength),
        'X-Output-Width': String(result.info.width),
        'X-Output-Height': String(result.info.height),
        'X-Output-Bytes': String(result.stats.bytesOut),
        'X-Peak-Pipeline-Bytes': String(result.stats.peakPipelineBytes),
        'X-Peak-Codec-Bytes': String(result.stats.peakCodecBytes),
        'X-Peak-Buffered-Input-Bytes': String(result.stats.peakBufferedInputBytes),
        'X-Peak-Buffered-Output-Bytes': String(result.stats.peakBufferedOutputBytes),
        'X-Elapsed-Ms': String(elapsedMs),
        'X-Stats-Notes': result.stats.notes.join(','),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed'
    const status = /Unsupported image format/i.test(message) ? 415 : 500

    return Response.json({ error: message }, { status })
  }
}
