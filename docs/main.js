import { component, html, reactive } from '@arrow-js/core'
import { render } from '@arrow-js/framework'
import highlighted from 'virtual:highlighted-code'
import './styles.css'

const state = reactive({
  installTool: 'pnpm',
  stars: '',
  // Demo state
  demoMaxWidth: '1024',
  demoMaxHeight: '1024',
  demoQuality: '85',
  demoError: '',
  demoInputInfo: '',
  demoOutputInfo: '',
  demoInputUrl: '/sample.png',
  demoOutputUrl: '',
  demoProcessing: false,
  demoHasResult: false,
})

// Fetch GitHub star count
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

// SVG logos for package managers (white/light versions)
const pmLogos = {
  pnpm: '<svg viewBox="0 0 24 24" fill="#f9ad00"><rect x="0" y="0" width="7" height="7"/><rect x="8.5" y="0" width="7" height="7"/><rect x="17" y="0" width="7" height="7"/><rect x="17" y="8.5" width="7" height="7"/><rect x="0" y="17" width="7" height="7"/><rect x="8.5" y="17" width="7" height="7"/><rect x="17" y="17" width="7" height="7"/><rect x="8.5" y="8.5" width="7" height="7"/></svg>',
  npm: '<svg viewBox="0 0 24 24" fill="#cb3837"><path d="M0 0v24h24V0H0zm19.2 19.2H12V7.2H7.2v12H4.8V4.8h14.4v14.4z"/></svg>',
  yarn: '<svg viewBox="0 0 24 24" fill="#2c8ebb"><path d="M12 0C5.375 0 0 5.375 0 12s5.375 12 12 12 12-5.375 12-12S18.625 0 12 0zm5.768 15.51c-.357.148-.624.162-.9.094-.898-.246-1.416-1.26-2.1-1.8-.06-.048-.12-.078-.18-.078-.102 0-.162.084-.222.27-.24.738-.462.87-.87 1.11-.27.156-.744.312-1.386.42-1.002.168-1.53-.18-1.764-.39-.102-.09-.108-.228-.018-.33.09-.102.228-.108.33-.018.168.15.588.414 1.392.27.564-.096.966-.228 1.176-.354.306-.18.426-.27.612-.84.09-.27.24-.714.636-.786.192-.036.378.042.546.168.576.432.984 1.314 1.704 1.518.144.036.27.036.45-.036.354-.15.582-.21.906-.276-.984-.858-1.554-1.716-1.776-2.244-.15-.36-.264-.714-.33-.93-.228-.054-.516-.168-.792-.432-.528-.504-.618-1.11-.618-1.416 0-.18.012-.306.024-.378.03-.168.066-.306.15-.546.054-.156.126-.336.186-.51.03-.09.066-.186.09-.264-.168-.324-.33-.756-.33-1.248 0-.42.186-.69.342-.81.264-.198.534-.084.72.042.12.084.234.186.336.306.228-.27.504-.492.81-.654.408-.222.75-.264 1.038-.264.048 0 .102 0 .15.006.528.03 1.02.264 1.386.648.432.456.66 1.074.66 1.746 0 .198-.018.402-.06.612.576.312.936.792 1.02 1.416.048.33-.024.69-.198 1.02-.06.114-.138.222-.228.318.048.108.084.21.084.318 0 .162-.066.306-.162.396z"/></svg>',
  bun: '<svg viewBox="0 0 24 24" fill="#fbf0df"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM8.5 8.5c.828 0 1.5.895 1.5 2s-.672 2-1.5 2S7 11.605 7 10.5s.672-2 1.5-2zm7 0c.828 0 1.5.895 1.5 2s-.672 2-1.5 2-1.5-.895-1.5-2 .672-2 1.5-2zM7.5 15s1.5 2.5 4.5 2.5 4.5-2.5 4.5-2.5"/></svg>',
}

const stats = [
  { value: '<1 MB', label: 'Peak memory on large JPEG processing' },
  { value: '128 MB safe', label: 'Built for Cloudflare Workers limits' },
  { value: '4 formats', label: 'JPEG, PNG, WebP*, AVIF* input support' },
]

const tocItems = [
  { id: 'demo', label: 'Demo' },
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Installation' },
  { id: 'api', label: 'API' },
  { id: 'api-probe', label: 'probe()', indent: true },
  { id: 'api-process', label: 'sip.process()', indent: true },
  { id: 'api-streaming', label: 'processJpegStreaming()', indent: true },
  { id: 'api-init', label: 'initStreaming()', indent: true },
  { id: 'formats', label: 'Format Support' },
  { id: 'wasm', label: 'WASM Build' },
  { id: 'examples', label: 'Examples' },
  { id: 'caveats', label: 'Caveats' },
]

/**
 * After the app mounts, inject highlighted code into all
 * placeholder elements. This avoids shipping shiki to the client.
 */
function injectHighlightedCode() {
  for (const [key, markup] of Object.entries(highlighted)) {
    const el = document.querySelector(`[data-code="${key}"]`)
    if (el) el.innerHTML = markup
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

// Store file outside reactive state so it doesn't get proxied
let pendingFile = null

function handleDemoFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (state.demoInputUrl && state.demoInputUrl.startsWith('blob:')) {
    URL.revokeObjectURL(state.demoInputUrl)
  }
  state.demoInputUrl = URL.createObjectURL(file)
  pendingFile = file
  // Clear previous result
  state.demoHasResult = false
  state.demoOutputInfo = ''
  state.demoError = ''
  if (state.demoOutputUrl && state.demoOutputUrl.startsWith('blob:')) {
    URL.revokeObjectURL(state.demoOutputUrl)
  }
  state.demoOutputUrl = ''
}

async function processDemo() {
  let file = pendingFile

  // If no pending file, fetch the sample image
  if (!file) {
    const res = await fetch(state.demoInputUrl)
    const blob = await res.blob()
    file = new File([blob], 'sample.png', { type: blob.type })
  }

  state.demoError = ''
  state.demoHasResult = false
  state.demoProcessing = true

  const formData = new FormData()
  formData.append('image', file)
  formData.append('maxWidth', state.demoMaxWidth)
  formData.append('maxHeight', state.demoMaxHeight)
  formData.append('quality', state.demoQuality)

  try {
    const res = await fetch('/api/process', { method: 'POST', body: formData })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Processing failed' }))
      state.demoError = err.error || 'Processing failed'
      state.demoProcessing = false
      return
    }

    const blob = await res.blob()

    const inputW = res.headers.get('X-Input-Width')
    const inputH = res.headers.get('X-Input-Height')
    const inputFmt = res.headers.get('X-Input-Format')
    const inputBytes = Number(res.headers.get('X-Input-Bytes'))
    const outputW = res.headers.get('X-Output-Width')
    const outputH = res.headers.get('X-Output-Height')
    const outputBytes = Number(res.headers.get('X-Output-Bytes'))
    const theoreticalMem = Number(res.headers.get('X-Theoretical-Memory'))
    const sipMem = Number(res.headers.get('X-Sip-Peak-Memory'))
    const processingMs = res.headers.get('X-Processing-Ms')
    const streaming = res.headers.get('X-Streaming')

    state.demoInputInfo = `Input: ${inputFmt?.toUpperCase()} ${inputW}\u00d7${inputH} \u2014 ${formatBytes(inputBytes)}`
    state.demoOutputInfo = `Output: JPEG ${outputW}\u00d7${outputH} \u2014 used ${formatBytes(sipMem)} of memory vs ${formatBytes(theoreticalMem)} without sip \u2014 ${processingMs}ms`
    state.demoProcessing = false
    state.demoHasResult = true

    if (state.demoOutputUrl && state.demoOutputUrl.startsWith('blob:')) {
      URL.revokeObjectURL(state.demoOutputUrl)
    }
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
        <img src="./sip.png" alt="sip" />
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
        <img src="./sip.png" alt="sip" class="hero__banner" />
        <h1 class="hero__title">
          <span class="hero__title-line">Small Image</span>
          <span class="hero__title-accent">Processor</span>
        </h1>
        <p class="hero__sub">
          Ultra memory-efficient image processing for Cloudflare Workers.
          Probe, resize, and encode images with less than 1 MB peak RAM.
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
        <div class="hero__pipeline">
          <span class="hero__pipeline-step">Input</span>
          <span class="hero__pipeline-step">Probe</span>
          <span class="hero__pipeline-step hero__pipeline-step--active">Decode</span>
          <span class="hero__pipeline-step hero__pipeline-step--active">Resize</span>
          <span class="hero__pipeline-step hero__pipeline-step--active">Encode</span>
          <span class="hero__pipeline-step">JPEG</span>
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
              Process an image on a Cloudflare Worker. Pick your own or use the
              sample below.
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
              Cloudflare Workers have a 128 MB memory ceiling. A 25 megapixel JPEG
              decoded into raw pixels consumes roughly 100 MB, which is enough to crash
              the request. sip solves this with scanline streaming and DCT scaling so
              peak memory stays under 1 MB regardless of input size.
            </p>
            <p>The processing pipeline:</p>
            <div class="shiki-block" data-code="pipeline"></div>
            <h3>Key capabilities</h3>
            <ul>
              <li><strong>Probe without decoding</strong> — read format, dimensions, and alpha from magic bytes alone.</li>
              <li><strong>Two-row resize buffer</strong> — bilinear interpolation using only the minimum rows needed. Memory stays flat.</li>
              <li><strong>WASM streaming</strong> — libjpeg-turbo DCT downscaling and scanline processing for oversized uploads.</li>
              <li><strong>Automatic quality fallback</strong> — retries with lower quality and smaller dimensions to meet byte budgets.</li>
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
              The package ships as ESM with TypeScript declarations. WASM artifacts for
              the streaming JPEG/PNG path are built separately — see
              <a href="#wasm">WASM Build</a> below.
            </p>
          </section>

          <section id="api">
            <h2>API</h2>
            <p>
              The public surface is intentionally narrow: three entrypoints that cover
              inspection, processing, and WASM warm-up.
            </p>

            <article id="api-probe" class="api-entry">
              <h3>probe(input)</h3>
              <p>
                Inspect an image's format, dimensions, and alpha support by reading
                magic bytes and header data. No full decode is performed.
              </p>
              <div class="shiki-block" data-code="probe"></div>
              <p>
                Fast enough to run before validation or routing decisions. Accepts
                <code>ArrayBuffer</code> or <code>Uint8Array</code>.
              </p>
            </article>

            <article id="api-process" class="api-entry">
              <h3>sip.process(input, options)</h3>
              <p>
                Decode, resize, and encode to JPEG in a single call. This is the
                main entrypoint for image processing.
              </p>
              <div class="shiki-block" data-code="process"></div>
              <h4>Options</h4>
              <div class="option-list">
                <div class="option">
                  <code>maxWidth</code>
                  <span>Maximum output width in pixels. Aspect ratio is preserved.</span>
                </div>
                <div class="option">
                  <code>maxHeight</code>
                  <span>Maximum output height in pixels. Aspect ratio is preserved.</span>
                </div>
                <div class="option">
                  <code>maxBytes</code>
                  <span>Target file size. sip retries with lower quality (down to 45) then smaller dimensions.</span>
                </div>
                <div class="option">
                  <code>quality</code>
                  <span>JPEG quality from 1 to 100. Defaults to 85.</span>
                </div>
              </div>
            </article>

            <article id="api-streaming" class="api-entry">
              <h3>processJpegStreaming(input, options)</h3>
              <p>
                Process a JPEG using the ultra-efficient WASM scanline pipeline directly.
                Unlike <code>sip.process()</code> which auto-detects format and selects the
                best path, this function targets the JPEG streaming path explicitly.
                A <code>processPngStreaming()</code> equivalent is also exported.
              </p>
              <div class="shiki-block" data-code="streamingApi"></div>
              <p>
                Both functions use DCT scaling and scanline-by-scanline processing internally
                so peak memory stays under 1 MB. The streaming is about memory-efficient
                <em>processing</em> — the result is still a complete <code>ArrayBuffer</code>,
                not a readable stream.
              </p>
            </article>

            <article id="api-init" class="api-entry">
              <h3>initStreaming()</h3>
              <p>
                Pre-warm the WASM streaming path. Optional but useful for paying startup cost
                early, for example during a Workers fetch handler warm-up.
              </p>
              <div class="shiki-block" data-code="initStreaming"></div>
              <p>
                Returns a boolean indicating whether the streaming path is available.
                If WASM is not built or the loader is not registered, returns false
                and sip falls back to the @jsquash path.
              </p>
            </article>
          </section>

          <section id="formats">
            <h2>Format Support</h2>
            <p>
              sip accepts four input formats and always outputs JPEG. The WASM decoders
              (JPEG and PNG) provide the best memory profile. WebP and AVIF fall back to
              full-decode via @jsquash.
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
                <span>DCT scaling + scanline</span>
                <span>Decode at 1/8 scale for huge savings</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">PNG</span>
                <span class="format-row__decoder">libspng</span>
                <span>Row-by-row progressive</span>
                <span>Full resolution decode, stream output</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">WebP</span>
                <span class="format-row__decoder">@jsquash/webp</span>
                <span>Full decode</span>
                <span>No WASM yet — higher memory</span>
              </div>
              <div class="format-row">
                <span class="format-row__format">AVIF</span>
                <span class="format-row__decoder">@jsquash/avif</span>
                <span>Full decode</span>
                <span>No WASM yet — higher memory</span>
              </div>
            </div>
            <p>
              Output is always JPEG. There is no PNG or WebP encoder — this simplifies
              the output path and provides universal compatibility.
            </p>
          </section>

          <section id="wasm">
            <h2>WASM Build</h2>
            <p>
              The streaming JPEG and PNG path requires WASM artifacts compiled from C
              via Emscripten. The package works without them (falling back to @jsquash),
              but the WASM path is where sip gets its real leverage.
            </p>
            <h3>Prerequisites</h3>
            <p>Install the Emscripten SDK:</p>
            <div class="shiki-block" data-code="emsdk"></div>
            <h3>Build</h3>
            <div class="shiki-block" data-code="wasmBuild"></div>
            <p>
              Output lands in <code>dist/sip.js</code> and <code>dist/sip.wasm</code>.
              The WASM file is gitignored — CI must run <code>pnpm build:wasm</code>
              before publishing.
            </p>
            <h3>Registering the loader</h3>
            <p>
              To activate the streaming path at runtime, register a global WASM loader
              before calling initStreaming:
            </p>
            <div class="shiki-block" data-code="registerLoader"></div>
          </section>

          <section id="examples">
            <h2>Examples</h2>
            <p>
              All examples target Cloudflare Workers. sip is designed to run in this
              environment where the 128 MB memory ceiling makes traditional image
              libraries impractical.
            </p>

            <h3>Upload handler with R2 storage</h3>
            <p>Process user uploads and store normalized images in R2:</p>
            <div class="shiki-block" data-code="exampleUpload"></div>

            <h3>On-the-fly thumbnail generation</h3>
            <p>Generate thumbnails from R2 originals with aggressive caching:</p>
            <div class="shiki-block" data-code="exampleThumb"></div>

            <h3>Validate and passthrough</h3>
            <p>Probe first, skip processing when the image is already small enough:</p>
            <div class="shiki-block" data-code="exampleValidate"></div>

            <h3>Durable Object with multiple variants</h3>
            <p>Generate full-size and thumbnail variants inside a Durable Object:</p>
            <div class="shiki-block" data-code="exampleDO"></div>
          </section>

          <section id="caveats">
            <h2>Caveats</h2>
            <h3>WebP and AVIF memory usage</h3>
            <p>
              sip currently uses <a href="https://github.com/nicktomlin/nicktomlin.github.io">@jsquash</a>
              to decode WebP and AVIF inputs. Unlike the JPEG and PNG paths which stream
              through WASM scanline-by-scanline, @jsquash performs a full in-memory decode
              of the entire image before sip can begin processing.
            </p>
            <p>
              This means WebP and AVIF inputs will consume significantly more memory than
              JPEG or PNG inputs of the same dimensions. For very large WebP/AVIF images
              in a 128 MB Workers environment, this can still cause memory pressure.
            </p>
            <p>
              Replacing @jsquash with dedicated WASM streaming decoders for WebP and AVIF
              is on the roadmap. When implemented, these formats will achieve the same
              sub-1 MB peak memory profile that JPEG and PNG already have.
            </p>
            <h3>Output is always JPEG</h3>
            <p>
              sip does not support PNG, WebP, or AVIF output. All processed images are
              encoded as JPEG. This keeps the encoder path simple and universally compatible,
              but means alpha channels are discarded during processing.
            </p>
            <h3>maxBytes is best-effort</h3>
            <p>
              The byte budget option retries encoding with progressively lower quality
              (down to 45) and then falls back to smaller dimensions. The final output
              may slightly exceed the target in edge cases.
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

// Inject syntax-highlighted code and PM logos after mount
requestAnimationFrame(() => {
  injectHighlightedCode()
  for (const [pm, svg] of Object.entries(pmLogos)) {
    const btn = document.querySelector(`[data-pm="${pm}"]`)
    if (btn) btn.innerHTML = svg
  }
})
