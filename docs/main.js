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
  { id: 'example', label: 'Example' },
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
          Ultra low memory image processing for Cloudflare Workers.
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
              Upload an image or use the sample below. A Cloudflare Worker will
              process your image and report back the memory used for the operation.
            </p>
            <div class="demo">
              <label class="demo__input-area">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  data-testid="demo-file-input"
                  @change="${handleDemoFileSelect}"
                />
                <div class="demo__input-preview">
                  <img src="${() => state.demoInputUrl}" alt="Input image" />
                </div>
                <div class="demo__input-overlay">
                  <span>Select your own image</span>
                </div>
              </label>
              <div class="demo__statusbar" data-testid="demo-input-info">${() => state.demoInputInfo}</div>
              <div class="demo__controls">
                <div class="demo__field">
                  <label>Max width</label>
                  <input
                    type="number"
                    data-testid="demo-width-input"
                    value="${() => state.demoMaxWidth}"
                    @input="${(e) => { state.demoMaxWidth = e.target.value }}"
                  />
                </div>
                <div class="demo__field">
                  <label>Max height</label>
                  <input
                    type="number"
                    data-testid="demo-height-input"
                    value="${() => state.demoMaxHeight}"
                    @input="${(e) => { state.demoMaxHeight = e.target.value }}"
                  />
                </div>
                <div class="demo__field">
                  <label>Quality</label>
                  <input
                    type="number"
                    data-testid="demo-quality-input"
                    value="${() => state.demoQuality}"
                    min="1"
                    max="100"
                    @input="${(e) => { state.demoQuality = e.target.value }}"
                  />
                </div>
              </div>
              <div class="demo__error" data-testid="demo-error">${() => state.demoError}</div>
              <div class="demo__output-preview">
                <div class="demo__spinner" style="${() => state.demoProcessing ? '' : 'display:none'}">
                  <div class="spinner"></div>
                  <span>Processing on Cloudflare Worker...</span>
                </div>
                <div class="demo__run-prompt" style="${() => !state.demoProcessing && !state.demoHasResult ? '' : 'display:none'}">
                  <button
                    class="btn btn--primary demo__run-btn"
                    data-testid="demo-process-button"
                    @click="${processDemo}"
                  ><span class="demo__btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg></span><span>Process</span></button>
                </div>
                <img
                  data-testid="demo-output-image"
                  style="${() => state.demoHasResult ? '' : 'display:none'}"
                  src="${() => state.demoOutputUrl}"
                  alt="Processed output"
                />
              </div>
              <div class="demo__statusbar" data-testid="demo-output-info" style="${() => state.demoHasResult ? '' : 'display:none'}">${() => state.demoOutputInfo}</div>
            </div>
          </section>

          <section id="overview">
            <h2>What is sip?</h2>
            <p>
              sip is an image processing library built specifically for Cloudflare
              Workers. Workers have a hard 128 MB memory limit, and most image
              libraries blow through that the moment you decode a large photo.
              A 25 megapixel JPEG becomes ~100 MB of buffered pixels in memory.
            </p>
            <p>
              sip avoids that by processing images one row at a time. It never
              holds the full decoded image in memory. For JPEG inputs it can even
              decode at a reduced resolution using DCT scaling, so a 6800px-wide
              photo might only decode at 850px internally.
            </p>
            <p>
              The output is always JPEG. You give sip an image (JPEG, PNG, WebP,
              or AVIF), tell it the max dimensions and quality you want, and it
              gives you back a resized JPEG.
            </p>
          </section>

          <section id="install">
            <h2>Installation</h2>
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
              sip ships as ESM with TypeScript types included. You also need the
              WASM module loaded before processing — see <a href="#wasm">WASM Build</a>
              for setup.
            </p>
          </section>

          <section id="api">
            <h2>API</h2>
            <p>
              Everything is a named export from <code>@standardagents/sip</code>.
              Most use cases only need <code>transform</code> and
              <code>toResponse</code>. The rest are there when you need more
              control.
            </p>

            <article id="api-ready" class="api-entry">
              <h3>ready(options?)</h3>
              <p>
                Loads the WASM module. Call this once when your Worker starts up
                and cache the promise. You can pass a pre-compiled
                <code>WebAssembly.Module</code> or raw bytes, or let it use the
                global <code>__SIP_WASM_LOADER__</code>.
              </p>
              <div class="shiki-block" data-code="readySig"></div>
            </article>

            <article id="api-inspect" class="api-entry">
              <h3>inspect(input)</h3>
              <p>
                Reads just enough bytes to figure out the format, dimensions, and
                whether the image has alpha. Doesn't decode the whole thing. Returns
                the metadata plus a <code>source</code> you can pass into
                <code>transform</code> or <code>decode</code> later.
              </p>
              <div class="shiki-block" data-code="inspectSig"></div>
              <p>
                Useful when you want to validate or reject images before doing the
                expensive work. Throws if the format isn't recognized.
              </p>
            </article>

            <article id="api-transform" class="api-entry">
              <h3>transform(input, options?)</h3>
              <p>
                The main function. Takes any supported input, decodes it, resizes
                it, and encodes it as JPEG — all in one call. Returns an
                <code>EncodedImage</code>, which is an async iterable of JPEG
                chunks. Nothing actually runs until you start consuming it.
              </p>
              <div class="shiki-block" data-code="transformSig"></div>
              <h4>Options</h4>
              <div class="option-list">
                <div class="option">
                  <code>width?</code>
                  <span>Max output width. Aspect ratio is always preserved. Never upscales.</span>
                </div>
                <div class="option">
                  <code>height?</code>
                  <span>Max output height. Aspect ratio is always preserved. Never upscales.</span>
                </div>
                <div class="option">
                  <code>quality?</code>
                  <span>JPEG quality, 1–100. Defaults to 85.</span>
                </div>
              </div>
            </article>

            <article id="api-decode" class="api-entry">
              <h3>decode(input)</h3>
              <p>
                Decodes an image into a <code>PixelStream</code> — an async
                iterable that yields one row of RGB pixels at a time. Each row
                is a <code>Scanline</code> with <code>data</code> (a Uint8Array
                of width * 3 bytes), <code>width</code>, and <code>y</code>.
              </p>
              <div class="shiki-block" data-code="decodeSig"></div>
            </article>

            <article id="api-resize" class="api-entry">
              <h3>resize(stream, options)</h3>
              <p>
                Takes a <code>PixelStream</code> and resizes it row by row using
                bilinear interpolation. Only keeps two rows in memory at a time.
                Returns a new <code>PixelStream</code>.
              </p>
              <div class="shiki-block" data-code="resizeSig"></div>
            </article>

            <article id="api-encode" class="api-entry">
              <h3>encodeJpeg(stream, options?)</h3>
              <p>
                Takes a <code>PixelStream</code> and encodes it as JPEG. Returns
                an <code>EncodedImage</code> that yields chunks as they're ready.
              </p>
              <div class="shiki-block" data-code="encodeJpegSig"></div>
            </article>

            <article id="api-collect" class="api-entry">
              <h3>collect(image)</h3>
              <p>
                Consumes an <code>EncodedImage</code> and gives you the full JPEG
                as an <code>ArrayBuffer</code>, along with the output dimensions
                and memory stats. Use this when you need the bytes in memory
                (e.g. to store in R2). Use <code>toResponse</code> when you just
                want to send the image back to the client.
              </p>
              <div class="shiki-block" data-code="collectSig"></div>
            </article>

            <article id="api-toresponse" class="api-entry">
              <h3>toResponse(image, init?)</h3>
              <p>
                Streams an <code>EncodedImage</code> straight into a
                <code>Response</code>. Sets the content type to
                <code>image/jpeg</code> for you. You can pass extra headers
                or a status code through the optional <code>ResponseInit</code>.
              </p>
              <div class="shiki-block" data-code="toResponseSig"></div>
            </article>

            <article id="api-tostream" class="api-entry">
              <h3>toReadableStream(image)</h3>
              <p>
                Converts an <code>EncodedImage</code> into a standard
                <code>ReadableStream</code>. Useful if you need to pipe the
                output somewhere other than a Response.
              </p>
              <div class="shiki-block" data-code="toReadableStreamSig"></div>
            </article>

            <article id="api-types" class="api-entry">
              <h3>Types</h3>
              <div class="option-list">
                <div class="option">
                  <code>ByteInput</code>
                  <span>Anything sip can read from: ArrayBuffer, Uint8Array, Blob, Request, Response, ReadableStream, or AsyncIterable.</span>
                </div>
                <div class="option">
                  <code>ImageInfo</code>
                  <span>{ format, width, height, hasAlpha }</span>
                </div>
                <div class="option">
                  <code>InputSource</code>
                  <span>A handle returned by inspect(). Pass it to transform() or decode() so sip doesn't have to re-read the headers.</span>
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
                  <span>An async iterable of Uint8Array JPEG chunks with .info and .stats promises.</span>
                </div>
                <div class="option">
                  <code>EncodedImageInfo</code>
                  <span>{ width, height, mimeType, originalFormat }</span>
                </div>
                <div class="option">
                  <code>PixelStream</code>
                  <span>An async iterable of Scanline objects with an .info promise.</span>
                </div>
                <div class="option">
                  <code>Scanline</code>
                  <span>{ data: Uint8Array, width, y } — one row of RGB pixels.</span>
                </div>
                <div class="option">
                  <code>TransformStats</code>
                  <span>Memory and byte stats: peakPipelineBytes, peakCodecBytes, bytesIn, bytesOut, and more.</span>
                </div>
              </div>
            </article>
          </section>

          <section id="formats">
            <h2>Format Support</h2>
            <p>
              sip can read four image formats. The output is always JPEG.
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
                <span>DCT scaling + scanline decode</span>
                <span>Best path. Can decode large images at 1/2, 1/4, or 1/8 scale.</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">PNG</span>
                <span class="format-row__decoder">libspng</span>
                <span>Row-by-row decode</span>
                <span>Decodes one row at a time. More efficient than a full pixel buffer.</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">WebP</span>
                <span class="format-row__decoder">@jsquash/webp</span>
                <span>Full decode</span>
                <span>Works, but decodes the whole image into memory first. Uses more RAM.</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">AVIF</span>
                <span class="format-row__decoder">@jsquash/avif</span>
                <span>Full decode</span>
                <span>Same as WebP — works but uses more memory than JPEG or PNG.</span>
              </div>
            </div>
          </section>

          <section id="example">
            <h2>Example</h2>
            <p>
              A single-file Cloudflare Worker that serves an upload form and
              returns the resized image. Deploy it and you have a working
              image resizer.
            </p>
            <div class="shiki-block" data-code="fullExample"></div>
          </section>

          <section id="caveats">
            <h2>Caveats</h2>
            <h3>Output is always JPEG</h3>
            <p>
              sip doesn't produce PNG, WebP, or AVIF output. If the input has
              transparency, it's discarded.
            </p>
            <h3>WebP and AVIF use more memory</h3>
            <p>
              JPEG and PNG get the efficient scanline path. WebP and AVIF still
              need to decode the entire image into memory before sip can process
              it. They work fine, but they use significantly more RAM. Native
              WASM decoders for these formats are planned.
            </p>
            <h3>Memory numbers in the demo</h3>
            <p>
              The demo reports the peak memory that sip itself used during
              processing. That's not the same as total Worker memory — the
              runtime, your code, and V8 overhead are separate.
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
