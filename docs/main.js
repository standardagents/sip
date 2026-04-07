import { component, html, reactive } from '@arrow-js/core'
import { render } from '@arrow-js/framework'
import highlighted from 'virtual:highlighted-code'
import sampleImageUrl from './sample.png'
import sipLogoUrl from './sip.png'
import './styles.css'

const state = reactive({
  installTool: 'pnpm',
  stars: '',
  demoMaxWidth: '1024',
  demoMaxHeight: '1024',
  demoQuality: '82',
  demoError: '',
  demoInputInfo: 'Sample image ready. Upload your own or process this one as a raw request body.',
  demoOutputInfo: '',
  demoInputUrl: sampleImageUrl,
  demoOutputUrl: '',
  demoProcessing: false,
  demoHasResult: false,
})

fetch('https://api.github.com/repos/standardagents/sip')
  .then((r) => r.json())
  .then((data) => {
    if (data.stargazers_count != null && data.stargazers_count >= 50) {
      state.stars =
        data.stargazers_count >= 1000
          ? (data.stargazers_count / 1000).toFixed(1) + 'k'
          : String(data.stargazers_count)
    }
  })
  .catch(() => {})

const installCommands = {
  pnpm: 'pnpm add @standardagents/sip',
  npm: 'npm install @standardagents/sip',
  yarn: 'yarn add @standardagents/sip',
  bun: 'bun add @standardagents/sip',
}

const pmLogos = {
  pnpm: '<svg viewBox="0 0 24 24" fill="#f9ad00"><rect x="0" y="0" width="7" height="7"/><rect x="8.5" y="0" width="7" height="7"/><rect x="17" y="0" width="7" height="7"/><rect x="17" y="8.5" width="7" height="7"/><rect x="0" y="17" width="7" height="7"/><rect x="8.5" y="17" width="7" height="7"/><rect x="17" y="17" width="7" height="7"/><rect x="8.5" y="8.5" width="7" height="7"/></svg>',
  npm: '<svg viewBox="0 0 24 24" fill="#cb3837"><path d="M0 0v24h24V0H0zm19.2 19.2H12V7.2H7.2v12H4.8V4.8h14.4v14.4z"/></svg>',
  yarn: '<svg viewBox="0 0 24 24" fill="#2c8ebb"><path d="M12 0C5.375 0 0 5.375 0 12s5.375 12 12 12 12-5.375 12-12S18.625 0 12 0zm5.768 15.51c-.357.148-.624.162-.9.094-.898-.246-1.416-1.26-2.1-1.8-.06-.048-.12-.078-.18-.078-.102 0-.162.084-.222.27-.24.738-.462.87-.87 1.11-.27.156-.744.312-1.386.42-1.002.168-1.53-.18-1.764-.39-.102-.09-.108-.228-.018-.33.09-.102.228-.108.33-.018.168.15.588.414 1.392.27.564-.096.966-.228 1.176-.354.306-.18.426-.27.612-.84.09-.27.24-.714.636-.786.192-.036.378.042.546.168.576.432.984 1.314 1.704 1.518.144.036.27.036.45-.036.354-.15.582-.21.906-.276-.984-.858-1.554-1.716-1.776-2.244-.15-.36-.264-.714-.33-.93-.228-.054-.516-.168-.792-.432-.528-.504-.618-1.11-.618-1.416 0-.18.012-.306.024-.378.03-.168.066-.306.15-.546.054-.156.126-.336.186-.51.03-.09.066-.186.09-.264-.168-.324-.33-.756-.33-1.248 0-.42.186-.69.342-.81.264-.198.534-.084.72.042.12.084.234.186.336.306.228-.27.504-.492.81-.654.408-.222.75-.264 1.038-.264.048 0 .102 0 .15.006.528.03 1.02.264 1.386.648.432.456.66 1.074.66 1.746 0 .198-.018.402-.06.612.576.312.936.792 1.02 1.416.048.33-.024.69-.198 1.02-.06.114-.138.222-.228.318.048.108.084.21.084.318 0 .162-.066.306-.162.396z"/></svg>',
  bun: '<svg viewBox="0 0 24 24" fill="#fbf0df"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM8.5 8.5c.828 0 1.5.895 1.5 2s-.672 2-1.5 2S7 11.605 7 10.5s.672-2 1.5-2zm7 0c.828 0 1.5.895 1.5 2s-.672 2-1.5 2-1.5-.895-1.5-2 .672-2 1.5-2zM7.5 15s1.5 2.5 4.5 2.5 4.5-2.5 4.5-2.5"/></svg>',
}

const stats = [
  { value: 'Raw stream', label: 'Use request bodies directly instead of buffering uploads in userland.' },
  { value: '128 MB safe', label: 'Designed for Cloudflare Workers memory limits.' },
  { value: '4 formats', label: 'JPEG, PNG, WebP, and AVIF inputs. Output is always JPEG.' },
]

const tocItems = [
  { id: 'demo', label: 'Demo' },
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Installation' },
  { id: 'api', label: 'API' },
  { id: 'api-ready', label: 'ready()', indent: true },
  { id: 'api-inspect', label: 'inspect()', indent: true },
  { id: 'api-transform', label: 'transform()', indent: true },
  { id: 'api-decode', label: 'decode()', indent: true },
  { id: 'api-resize', label: 'resize()', indent: true },
  { id: 'api-encode', label: 'encodeJpeg()', indent: true },
  { id: 'api-collect', label: 'collect()', indent: true },
  { id: 'api-toresponse', label: 'toResponse()', indent: true },
  { id: 'api-tostream', label: 'toReadableStream()', indent: true },
  { id: 'api-types', label: 'Types', indent: true },
  { id: 'formats', label: 'Format Support' },
  { id: 'wasm', label: 'WASM Build' },
  { id: 'examples', label: 'Examples' },
  { id: 'caveats', label: 'Caveats' },
]

function injectHighlightedCode() {
  for (const [key, markup] of Object.entries(highlighted)) {
    const el = document.querySelector(`[data-code="${key}"]`)
    if (el) el.innerHTML = markup
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

let pendingFile = null

function clearOutputUrl() {
  if (state.demoOutputUrl && state.demoOutputUrl.startsWith('blob:')) {
    URL.revokeObjectURL(state.demoOutputUrl)
  }
  state.demoOutputUrl = ''
}

function handleDemoFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return

  if (state.demoInputUrl && state.demoInputUrl.startsWith('blob:')) {
    URL.revokeObjectURL(state.demoInputUrl)
  }

  state.demoInputUrl = URL.createObjectURL(file)
  pendingFile = file
  state.demoInputInfo = `Selected: ${(file.type || 'unknown').replace('image/', '').toUpperCase()} — ${formatBytes(file.size)}`
  state.demoHasResult = false
  state.demoOutputInfo = ''
  state.demoError = ''
  clearOutputUrl()
}

async function getDemoFile() {
  if (pendingFile) {
    return pendingFile
  }

  const res = await fetch(state.demoInputUrl)
  if (!res.ok) {
    throw new Error('Could not load the sample image')
  }
  const blob = await res.blob()
  return new File([blob], 'sample.png', { type: blob.type || 'image/png' })
}

function getDocsBaseUrl() {
  const { origin, pathname } = window.location

  if (pathname === '/' || pathname.endsWith('/')) {
    return new URL(pathname, origin)
  }

  const lastSlash = pathname.lastIndexOf('/')
  const lastSegment = pathname.slice(lastSlash + 1)

  if (lastSegment.includes('.')) {
    return new URL(pathname.slice(0, lastSlash + 1) || '/', origin)
  }

  return new URL(`${pathname}/`, origin)
}

async function processDemo() {
  state.demoError = ''
  state.demoHasResult = false
  state.demoProcessing = true

  try {
    const file = await getDemoFile()
    const url = new URL('api/process', getDocsBaseUrl())
    url.searchParams.set('width', state.demoMaxWidth)
    url.searchParams.set('height', state.demoMaxHeight)
    url.searchParams.set('quality', state.demoQuality)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
      },
      body: file,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Processing failed' }))
      state.demoError = err.error || 'Processing failed'
      state.demoProcessing = false
      return
    }

    const blob = await res.blob()
    const inputWidth = Number(res.headers.get('X-Input-Width'))
    const inputHeight = Number(res.headers.get('X-Input-Height'))
    const inputBytes = Number(res.headers.get('X-Input-Bytes'))
    const inputFormat = res.headers.get('X-Input-Format') || 'unknown'
    const outputWidth = Number(res.headers.get('X-Output-Width'))
    const outputHeight = Number(res.headers.get('X-Output-Height'))
    const outputBytes = Number(res.headers.get('X-Output-Bytes'))
    const peakPipeline = Number(res.headers.get('X-Peak-Pipeline-Bytes'))
    const peakCodec = Number(res.headers.get('X-Peak-Codec-Bytes'))
    const processingMs = Number(res.headers.get('X-Elapsed-Ms'))
    const notes = (res.headers.get('X-Stats-Notes') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    state.demoInputInfo = `Input: ${inputFormat.toUpperCase()} ${inputWidth}\u00d7${inputHeight} — ${formatBytes(inputBytes)}`
    state.demoOutputInfo = `Output: JPEG ${outputWidth}\u00d7${outputHeight} — ${formatBytes(outputBytes)} — peak SIP memory ${formatBytes(peakPipeline)}${peakCodec ? ` (codec share ${formatBytes(peakCodec)})` : ''} — ${processingMs}ms${notes.length ? ` — ${notes.join(', ')}` : ''}`
    state.demoProcessing = false
    state.demoHasResult = true

    clearOutputUrl()
    state.demoOutputUrl = URL.createObjectURL(blob)
  } catch (err) {
    state.demoError = err instanceof Error ? err.message : 'Network error'
    state.demoProcessing = false
  }
}

const StatCard = component((props) => html`
  <div class="stat">
    <span class="stat__value">${() => props.value}</span>
    <span class="stat__label">${() => props.label}</span>
  </div>
`)

const TocLink = component((props) => html`
  <a
    href="${() => '#' + props.id}"
    class="${() => props.indent ? 'toc__link toc__link--indent' : 'toc__link'}"
  >${() => props.label}</a>
`)

const App = component(() => html`
  <main class="page">
    <nav class="nav">
      <a href="#" class="nav__brand">
        <img src="${sipLogoUrl}" alt="sip" />
        <span>sip</span>
      </a>
      <a
        href="https://github.com/standardagents/sip"
        class="nav__github"
        target="_blank"
        rel="noopener"
      >
        <span class="gh-star">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
          <span>${() => state.stars}</span>
        </span>
        <span>GitHub</span>
      </a>
    </nav>

    <div class="shell">
      <section class="hero">
        <img src="${sipLogoUrl}" alt="sip" class="hero__banner" />
        <h1 class="hero__title">
          <span class="hero__title-line">Small Image</span>
          <span class="hero__title-accent">Processor</span>
        </h1>
        <p class="hero__sub">
          Stream-first image processing for Cloudflare Workers. Pass a raw
          request body through the pipeline, resize it, and return JPEG without
          turning every request into a giant ArrayBuffer by accident.
        </p>
        <div class="hero__actions">
          <a href="#install" class="btn btn--primary">Get started</a>
          <a
            href="https://github.com/standardagents/sip"
            class="btn btn--stars"
            target="_blank"
            rel="noopener"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
            <span>Star on GitHub</span>
            <span class="btn__count">${() => state.stars}</span>
          </a>
        </div>
      </section>

      <section class="stats">
        ${stats.map((s) => StatCard(s))}
      </section>

      <div class="docs">
        <aside class="toc">
          <div class="toc__inner">
            <span class="toc__heading">On this page</span>
            ${tocItems.map((item) => TocLink(item))}
          </div>
        </aside>

        <div class="content">
          <section id="demo">
            <h2>Try it</h2>
            <p>
              Upload an image or use the sample below. The docs worker posts the
              file itself as the request body, then reports measured SIP peak
              memory for the transform.
            </p>
            <p>
              The headline number is <strong>peak SIP memory</strong>, meaning the
              maximum memory SIP itself needed while processing the image. The
              smaller codec number is just a breakdown for the decoder/encoder part
              of that total, not a separate user-facing metric.
            </p>
            <div class="demo">
              <label class="demo__input-area">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  @change="${handleDemoFileSelect}"
                />
                <div class="demo__input-preview">
                  <img src="${() => state.demoInputUrl}" alt="Input image" />
                </div>
                <div class="demo__input-overlay">
                  <span>Select your own image</span>
                </div>
              </label>
              <div class="demo__statusbar">${() => state.demoInputInfo}</div>
              <div class="demo__controls">
                <div class="demo__field">
                  <label>Max width</label>
                  <input
                    type="number"
                    value="${() => state.demoMaxWidth}"
                    @input="${(e) => { state.demoMaxWidth = e.target.value }}"
                  />
                </div>
                <div class="demo__field">
                  <label>Max height</label>
                  <input
                    type="number"
                    value="${() => state.demoMaxHeight}"
                    @input="${(e) => { state.demoMaxHeight = e.target.value }}"
                  />
                </div>
                <div class="demo__field">
                  <label>Quality</label>
                  <input
                    type="number"
                    value="${() => state.demoQuality}"
                    min="1"
                    max="100"
                    @input="${(e) => { state.demoQuality = e.target.value }}"
                  />
                </div>
              </div>
              <div class="demo__error">${() => state.demoError}</div>
              <div class="demo__output-preview">
                <div class="demo__spinner" style="${() => state.demoProcessing ? '' : 'display:none'}">
                  <div class="spinner"></div>
                  <span>Processing on Cloudflare Worker...</span>
                </div>
                <div class="demo__run-prompt" style="${() => !state.demoProcessing && !state.demoHasResult ? '' : 'display:none'}">
                  <button
                    class="btn btn--primary demo__run-btn"
                    @click="${processDemo}"
                  ><span class="demo__btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg></span><span>Process</span></button>
                </div>
                <img
                  style="${() => state.demoHasResult ? '' : 'display:none'}"
                  src="${() => state.demoOutputUrl}"
                  alt="Processed output"
                />
              </div>
              <div class="demo__statusbar" style="${() => state.demoHasResult ? '' : 'display:none'}">${() => state.demoOutputInfo}</div>
            </div>
          </section>

          <section id="overview">
            <h2>Overview</h2>
            <p>
              Cloudflare Workers have a 128 MB memory ceiling. The real goal is
              not only making the math inside the library efficient, but also
              making the Worker integration efficient: a raw
              <code>request.body</code> should be able to flow through the image
              pipeline without first being fully buffered in userland.
            </p>
            <p>
              sip now has a simpler order: <code>ready()</code> loads the WASM
              path, <code>inspect()</code> reads headers and returns a reusable
              source, <code>transform()</code> is the convenience path, and
              <code>toResponse()</code> or <code>collect()</code> decide whether
              the output stays streamed or becomes a full buffer.
            </p>
            <p>The Worker-first pipeline:</p>
            <div class="shiki-block" data-code="pipeline"></div>
            <h3>Key capabilities</h3>
            <ul>
              <li><strong>Raw upload path</strong> — pass <code>request.body</code> or a full <code>Request</code> directly into the transform pipeline.</li>
              <li><strong>Reusable inspection</strong> — <code>inspect()</code> returns both metadata and a reusable source for the later decode step.</li>
              <li><strong>Explicit buffering</strong> — <code>collect()</code> still exists, but it is a deliberate opt-in instead of the default shape.</li>
            </ul>
          </section>

          <section id="install">
            <h2>Installation</h2>
            <p>sip is published as a standalone npm package.</p>
            <div class="install-bar" id="install-bar">
              <div class="install-tabs">
                ${Object.keys(installCommands).map((tool) => html`
                  <button
                    type="button"
                    class="${() =>
                      state.installTool === tool
                        ? 'install-tab install-tab--active'
                        : 'install-tab'}"
                    @click="${() => { state.installTool = tool }}"
                    title="${tool}"
                    data-pm="${tool}"
                  ></button>
                `)}
              </div>
              <div class="install-cmd">
                <code>${() => installCommands[state.installTool]}</code>
              </div>
            </div>
            <p>
              The package ships as ESM with TypeScript declarations. The JPEG and
              PNG fast paths also need the SIP WASM loader registered once per isolate.
            </p>
          </section>

          <section id="api">
            <h2>API</h2>
            <p>
              Every function is a named export from <code>@standardagents/sip</code>.
              The high-level path is <code>transform</code> + <code>toResponse</code>.
              The lower-level primitives let you build custom pipelines.
            </p>

            <article id="api-ready" class="api-entry">
              <h3>ready(options?)</h3>
              <p>
                Load the WASM module. Call once per isolate and await before the first
                request. Accepts an optional <code>wasm</code> property with a
                pre-compiled <code>WebAssembly.Module</code> or raw
                <code>ArrayBuffer</code>. Without it, uses the global
                <code>__SIP_WASM_LOADER__</code>.
              </p>
              <div class="shiki-block" data-code="readySig"></div>
            </article>

            <article id="api-inspect" class="api-entry">
              <h3>inspect(input)</h3>
              <p>
                Read header bytes to determine format, dimensions, and alpha without
                decoding the full image. Returns an <code>InspectResult</code> with
                <code>info</code> and a reusable <code>source</code> that can be
                passed to <code>transform</code> or <code>decode</code>.
              </p>
              <div class="shiki-block" data-code="inspectSig"></div>
              <p>
                Throws if the format is unrecognized. For streamed inputs the source
                buffers only the header bytes internally — the rest streams on
                <code>open()</code>.
              </p>
            </article>

            <article id="api-transform" class="api-entry">
              <h3>transform(input, options?)</h3>
              <p>
                One-shot decode, resize, and JPEG encode. Returns an
                <code>EncodedImage</code> — an <code>AsyncIterable&lt;Uint8Array&gt;</code>
                with <code>.info</code> and <code>.stats</code> promises. Nothing
                runs until you consume the iterable.
              </p>
              <div class="shiki-block" data-code="transformSig"></div>
              <h4>TransformOptions</h4>
              <div class="option-list">
                <div class="option">
                  <code>width?</code>
                  <span>Max output width. Aspect ratio preserved. Never upscales.</span>
                </div>
                <div class="option">
                  <code>height?</code>
                  <span>Max output height. Aspect ratio preserved. Never upscales.</span>
                </div>
                <div class="option">
                  <code>quality?</code>
                  <span>JPEG quality 1–100. Defaults to 85.</span>
                </div>
              </div>
            </article>

            <article id="api-decode" class="api-entry">
              <h3>decode(input)</h3>
              <p>
                Decode any supported format into a <code>PixelStream</code> — an
                <code>AsyncIterable&lt;Scanline&gt;</code> that yields one RGB row
                at a time. Each scanline has <code>data</code> (Uint8Array, width * 3),
                <code>width</code>, and <code>y</code>.
              </p>
              <div class="shiki-block" data-code="decodeSig"></div>
            </article>

            <article id="api-resize" class="api-entry">
              <h3>resize(stream, options)</h3>
              <p>
                Resize a <code>PixelStream</code> using scanline-based bilinear
                interpolation. Only keeps two rows in memory at a time. Returns a
                new <code>PixelStream</code> with updated dimensions.
              </p>
              <div class="shiki-block" data-code="resizeSig"></div>
            </article>

            <article id="api-encode" class="api-entry">
              <h3>encodeJpeg(stream, options?)</h3>
              <p>
                Encode a <code>PixelStream</code> to JPEG, yielding output chunks as
                they become available. Returns an <code>EncodedImage</code>.
              </p>
              <div class="shiki-block" data-code="encodeJpegSig"></div>
            </article>

            <article id="api-collect" class="api-entry">
              <h3>collect(image)</h3>
              <p>
                Consume an <code>EncodedImage</code> and return the complete JPEG as
                an <code>ArrayBuffer</code> along with <code>info</code> and
                <code>stats</code>. This buffers the full output — use
                <code>toResponse</code> when streaming is preferred.
              </p>
              <div class="shiki-block" data-code="collectSig"></div>
            </article>

            <article id="api-toresponse" class="api-entry">
              <h3>toResponse(image, init?)</h3>
              <p>
                Stream an <code>EncodedImage</code> directly into a
                <code>Response</code> body. Sets <code>Content-Type: image/jpeg</code>
                automatically. Pass additional headers or status via the optional
                <code>ResponseInit</code>.
              </p>
              <div class="shiki-block" data-code="toResponseSig"></div>
            </article>

            <article id="api-tostream" class="api-entry">
              <h3>toReadableStream(image)</h3>
              <p>
                Convert an <code>EncodedImage</code> to a standard
                <code>ReadableStream&lt;Uint8Array&gt;</code> for use with any
                streaming API.
              </p>
              <div class="shiki-block" data-code="toReadableStreamSig"></div>
            </article>

            <article id="api-types" class="api-entry">
              <h3>Types</h3>
              <div class="option-list">
                <div class="option">
                  <code>ByteInput</code>
                  <span>Union of all accepted input types: ArrayBuffer, Uint8Array, Blob, Request, Response, ReadableStream, or AsyncIterable.</span>
                </div>
                <div class="option">
                  <code>ImageInfo</code>
                  <span>{ format, width, height, hasAlpha } — returned by inspect().</span>
                </div>
                <div class="option">
                  <code>InputSource</code>
                  <span>Reusable handle returned by inspect(). Pass to transform() or decode() to avoid re-reading headers.</span>
                </div>
                <div class="option">
                  <code>InspectResult</code>
                  <span>{ info: ImageInfo, source: InputSource }</span>
                </div>
                <div class="option">
                  <code>TransformOptions</code>
                  <span>{ width?, height?, quality? }</span>
                </div>
                <div class="option">
                  <code>EncodedImage</code>
                  <span>AsyncIterable&lt;Uint8Array&gt; with .info and .stats promises. Returned by transform() and encodeJpeg().</span>
                </div>
                <div class="option">
                  <code>EncodedImageInfo</code>
                  <span>{ width, height, mimeType: 'image/jpeg', originalFormat }</span>
                </div>
                <div class="option">
                  <code>PixelStream</code>
                  <span>AsyncIterable&lt;Scanline&gt; with .info promise. Returned by decode() and resize().</span>
                </div>
                <div class="option">
                  <code>Scanline</code>
                  <span>{ data: Uint8Array, width: number, y: number } — one RGB row (width * 3 bytes).</span>
                </div>
                <div class="option">
                  <code>TransformStats</code>
                  <span>{ peakPipelineBytes, peakCodecBytes, peakBufferedInputBytes, peakBufferedOutputBytes, bytesIn, bytesOut, notes }</span>
                </div>
              </div>
            </article>
          </section>

          <section id="formats">
            <h2>Format Support</h2>
            <p>
              sip accepts four input formats and always outputs JPEG. The paths
              are not all equal today, and the docs should reflect that.
            </p>
            <div class="format-grid">
              <div class="format-grid__header">
                <span>Format</span>
                <span>Decoder</span>
                <span>Method</span>
                <span>Notes</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">JPEG</span>
                <span class="format-row__decoder">libjpeg-turbo</span>
                <span>DCT scaling + incremental scanline decode</span>
                <span>Best low-memory path and the main sub-1 MB target.</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">PNG</span>
                <span class="format-row__decoder">libspng</span>
                <span>Row-oriented decode + streamed JPEG encode</span>
                <span>More memory-efficient than a full pixel buffer, but not as strong as JPEG yet.</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">WebP</span>
                <span class="format-row__decoder">@jsquash/webp</span>
                <span>Buffered decode fallback</span>
                <span>Supported in Workers and tests, but higher memory than JPEG or PNG.</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">AVIF</span>
                <span class="format-row__decoder">@jsquash/avif</span>
                <span>Buffered decode fallback</span>
                <span>Supported, higher memory, and a clear candidate for a native decoder later.</span>
              </div>
            </div>
            <p>
              Output is always JPEG. There is no PNG, WebP, or AVIF encoder in
              the current public surface.
            </p>
          </section>

          <section id="wasm">
            <h2>WASM Build</h2>
            <p>
              The low-memory JPEG and PNG paths require the SIP WASM artifacts
              built from C with Emscripten.
            </p>
            <p>
              Output lands in <code>dist/sip.js</code> and <code>dist/sip.wasm</code>.
              CI and release flows should rebuild them before publish.
            </p>
            <div class="shiki-block" data-code="build"></div>
          </section>

          <section id="examples">
            <h2>Examples</h2>

            <h3>Worker fetch handler</h3>
            <p>Stream a raw request body through sip and return the JPEG directly:</p>
            <div class="shiki-block" data-code="exampleWorker"></div>

            <h3>Validate before processing</h3>
            <p>Use <code>inspect()</code> to check dimensions before committing to a transform:</p>
            <div class="shiki-block" data-code="exampleValidate"></div>

            <h3>Manual pipeline with R2</h3>
            <p>Use the lower-level primitives when you need control over each step:</p>
            <div class="shiki-block" data-code="exampleManual"></div>
          </section>

          <section id="caveats">
            <h2>Caveats</h2>
            <h3>Peak memory shown on this site</h3>
            <p>
              The demo shows SIP's measured processing memory. That is useful and
              intentional, but it is not the same thing as total isolate RSS.
            </p>
            <h3>What buffers and what does not</h3>
            <p>
              <code>request.formData()</code>, <code>request.arrayBuffer()</code>,
              and <code>collect()</code> all buffer. If your goal is the low-memory
              Worker path, prefer <code>request.body</code> into
              <code>transform()</code> and <code>toResponse()</code>.
            </p>
            <h3>Output is always JPEG</h3>
            <p>
              Alpha is discarded during processing. If you need PNG/WebP/AVIF output,
              that is outside the current scope of the library.
            </p>
            <h3>WebP and AVIF use more memory today</h3>
            <p>
              WebP and AVIF still use fallback decoders rather than native SIP
              streaming decoders. They are supported and tested, but they do not
              currently match the JPEG memory profile.
            </p>
          </section>
        </div>
      </div>
    </div>

    <footer class="footer">
      <div class="shell">
        <div class="footer__inner">
          <span>@standardagents/sip</span>
          <a
            href="https://github.com/standardagents/sip"
            target="_blank"
            rel="noopener"
          >GitHub</a>
        </div>
      </div>
    </footer>
  </main>
`)

const root = document.querySelector('#app')
if (!root) throw new Error('Missing #app root')
render(root, App())

requestAnimationFrame(() => {
  injectHighlightedCode()
  for (const [pm, svg] of Object.entries(pmLogos)) {
    const btn = document.querySelector(`[data-pm="${pm}"]`)
    if (btn) btn.innerHTML = svg
  }
})
