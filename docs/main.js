import { component, html, reactive } from '@arrow-js/core'
import { render } from '@arrow-js/framework'
import highlighted from 'virtual:highlighted-code'
const sampleImageUrl = '/sample.jpg'
const sipLogoUrl = '/sip-logo.svg'
import './styles.css'

const state = reactive({
  installTool: 'pnpm',
  installCopied: false,
  stars: '',
  activeSection: 'demo',
  activeTopSection: 'demo',
  demoMaxWidth: '250',
  demoMaxHeight: '250',
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
  pnpm: '/logo-pnpm.svg',
  npm: '/logo-npm.svg',
  yarn: '/logo-yarn.svg',
  bun: '/logo-bun.svg',
}

const exampleRepoUrl = 'https://github.com/standardagents/sip-worker-example'
const exampleSourceUrl = 'https://github.com/standardagents/sip-worker-example/blob/main/src/index.ts'
const exampleDeployUrl =
  'https://deploy.workers.cloudflare.com/?url=' + encodeURIComponent(exampleRepoUrl)

function copyInstallCmd() {
  const text = installCommands[state.installTool]
  navigator.clipboard.writeText(text).then(() => {
    state.installCopied = true
    setTimeout(() => { state.installCopied = false }, 1500)
  })
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

const topTocItems = tocItems.filter((item) => !item.indent)

function getTopTocId(id) {
  const idx = tocItems.findIndex((i) => i.id === id)
  if (idx < 0) return id
  if (!tocItems[idx].indent) return id
  for (let i = idx - 1; i >= 0; i--) {
    if (!tocItems[i].indent) return tocItems[i].id
  }
  return id
}

function scrollMobileTocIntoView(id) {
  requestAnimationFrame(() => {
    const container = document.querySelector('.mobile-toc__inner')
    const link = container?.querySelector(`[data-mobile-toc-id="${id}"]`)
    if (!container || !link) return
    const containerRect = container.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()
    const delta = linkRect.left - containerRect.left - (containerRect.width - linkRect.width) / 2
    container.scrollBy({ left: delta, behavior: 'smooth' })
  })
}

function initScrollSpy() {
  const sections = tocItems
    .map((item) => ({ id: item.id, el: document.getElementById(item.id) }))
    .filter((s) => s.el)

  if (!sections.length) return

  const applyActive = (id) => {
    if (!id || state.activeSection === id) return
    state.activeSection = id
    const topId = getTopTocId(id)
    if (state.activeTopSection !== topId) {
      state.activeTopSection = topId
      scrollMobileTocIntoView(topId)
    }
  }

  const update = () => {
    const doc = document.documentElement
    const scrollY = window.scrollY || doc.scrollTop
    const viewportW = window.innerWidth || doc.clientWidth
    const viewportH = window.innerHeight || doc.clientHeight
    const activationLine = viewportW <= 860 ? 180 : 110

    let activeId = sections[0].id
    for (const section of sections) {
      const top = section.el.getBoundingClientRect().top
      if (top - activationLine <= 0) {
        activeId = section.id
      } else {
        break
      }
    }

    const atBottom = scrollY + viewportH >= doc.scrollHeight - 4
    if (atBottom) {
      activeId = sections[sections.length - 1].id
    }

    applyActive(activeId)
  }

  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }

  update()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
}

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
let demoRequestVersion = 0
let demoAbortController = null

function clearOutputUrl() {
  if (state.demoOutputUrl && state.demoOutputUrl.startsWith('blob:')) {
    URL.revokeObjectURL(state.demoOutputUrl)
  }
  state.demoOutputUrl = ''
}

function resetDemoResult() {
  state.demoHasResult = false
  state.demoOutputInfo = ''
  clearOutputUrl()
}

function invalidateDemoResult() {
  demoRequestVersion += 1
  if (demoAbortController) {
    demoAbortController.abort()
    demoAbortController = null
  }
  state.demoProcessing = false
  state.demoError = ''
  resetDemoResult()
}

function updateDemoOption(key, value) {
  state[key] = value
  invalidateDemoResult()
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
  invalidateDemoResult()
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
  return new File([blob], 'sample.jpg', { type: blob.type || 'image/jpeg' })
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
  const requestVersion = ++demoRequestVersion
  if (demoAbortController) {
    demoAbortController.abort()
  }
  const abortController = new AbortController()
  demoAbortController = abortController
  state.demoError = ''
  resetDemoResult()
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
      signal: abortController.signal,
    })

    if (requestVersion !== demoRequestVersion) {
      return
    }

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

    if (requestVersion !== demoRequestVersion) {
      return
    }

    state.demoInputInfo = `Input: ${inputFormat.toUpperCase()} ${inputWidth}\u00d7${inputHeight} — ${formatBytes(inputBytes)}`
    state.demoOutputInfo = `Output: JPEG ${outputWidth}\u00d7${outputHeight} — ${formatBytes(outputBytes)} — peak SIP memory ${formatBytes(peakPipeline)}${peakCodec ? ` (codec share ${formatBytes(peakCodec)})` : ''} — ${processingMs}ms${notes.length ? ` — ${notes.join(', ')}` : ''}`
    state.demoProcessing = false
    state.demoHasResult = true

    clearOutputUrl()
    state.demoOutputUrl = URL.createObjectURL(blob)
  } catch (err) {
    if (requestVersion !== demoRequestVersion) {
      return
    }
    if (err instanceof Error && err.name === 'AbortError') {
      state.demoProcessing = false
      return
    }
    state.demoError = err instanceof Error ? err.message : 'Network error'
    state.demoProcessing = false
  } finally {
    if (demoAbortController === abortController) {
      demoAbortController = null
    }
  }
}

const StatCard = component((props) => html`
  <div class="stat">
    <span class="stat__value">${() => props.value}</span>
    <span class="stat__label">${() => props.label}</span>
  </div>
`)

const SignupCallout = component(() => {
  const cs = reactive({
    phase: 'idle',
    errorMsg: '',
  })

  function submit(e) {
    e.preventDefault()
    const form = e.target
    const name = form.querySelector('[name="name"]').value.trim()
    const email = form.querySelector('[name="email"]').value.trim()
    if (!name || !email) return

    cs.phase = 'loading'
    cs.errorMsg = ''

    fetch('/api/early-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Something went wrong. Please try again.')
        }
        cs.phase = 'success'
      })
      .catch((err) => {
        cs.phase = 'error'
        cs.errorMsg = err instanceof Error ? err.message : 'Something went wrong.'
      })
  }

  return html`
    <div class="sa-callout">
      <div class="sa-callout-inner">
        <div class="sa-callout-header">
          <a href="https://standardagents.ai" target="_blank" rel="noopener" class="sa-logo-link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 981.45 150" fill="currentColor" class="sa-logo"><path d="M44.06,0v44.08H0v105.92h105.93v-44.07h44.07V0H44.06ZM19.09,130.91c-16.47-16.47-5.29-54.45,24.96-85.18v60.2h60.23c-30.73,30.27-68.71,41.47-85.2,24.98ZM105.93,104.29v-60.21h-60.21C76.46,13.8,114.42,2.6,130.91,19.09c16.51,16.49,5.31,54.47-24.98,85.2Z"/><g><path d="M203.01,112.34c-8.14,0-16.05-1.81-17.52-2.03-.79.68-1.36,2.03-1.47,2.26h-3.84c-.45-3.84-1.58-14.58-2.26-18.98l3.5-.68,3.73,5.31c3.62,5.2,10.17,7.46,18.87,7.46,10.85,0,16.84-4.18,16.84-13.56,0-10.51-10.51-14.01-19.1-16.72-11.87-3.73-22.6-7.46-22.6-22.94,0-9.38,8.14-20.23,23.28-20.23,3.84,0,6.67.56,9.04,1.13s4.29,1.36,6.44,1.58c.34,0,2.15-1.58,2.37-1.69h2.6l2.94,16.95-4.29.45-2.71-4.97c-2.15-3.96-7.91-7.57-16.5-7.57s-14.24,4.07-14.24,12.54c0,8.93,8.7,11.64,18.08,14.8,11.98,4.07,24.3,8.81,24.3,24.63,0,12.32-11.75,22.26-27.46,22.26Z"/><path d="M276.01,63.52h-19.55v34.02c0,3.28.45,4.52,1.24,5.42,1.24,1.36,3.16,2.37,5.31,2.37,4.97,0,8.93-2.03,12.09-3.73v4.75c-2.83,2.26-10.51,6.21-14.92,6.21-7.46,0-13.9-3.73-13.9-10.06,0-2.71.45-10.06.45-20.91v-17.18l-6.44-1.58v-2.03c3.28-2.83,9.38-8.7,14.01-13.56h2.71s-.45,7.57-.57,10.28h20.68l-1.13,5.99Z"/><path d="M323.35,112.56c-3.16,0-7.01-.79-8.25-4.75-5.2,2.15-11.53,4.52-17.4,4.52-8.93,0-14.24-4.97-14.24-13.11,0-6.55,2.26-10.62,10.96-12.88,5.54-1.47,12.09-2.37,20.12-3.5v-7.8c0-1.24,0-2.6-.34-4.75-.79-5.2-6.44-7.68-10.85-7.68-2.37,0-4.63.68-6.67,2.03-1.69,1.13-2.26,2.37-2.26,4.18l-8.36,2.03c-.23-.57-.34-1.13-.34-1.81,0-2.15,1.69-4.29,3.62-5.76,2.26-1.81,4.52-3.28,7.34-4.52,3.39-1.58,7.91-3.16,12.32-3.16,3.96,0,7.23,1.02,9.72,2.6,2.6,1.69,4.29,4.18,4.86,7.57.34,1.92.34,4.18.34,7.35v26.56c0,4.52,2.37,6.33,5.31,6.33s4.97-1.24,6.89-2.71l.9,3.5c-4.41,3.05-8.93,5.76-13.67,5.76ZM314.54,87.25c-7.01.79-11.41,1.58-16.61,2.94-4.52,1.13-5.65,3.05-5.65,6.67,0,5.2,3.5,9.72,9.49,9.72,4.18,0,8.48-1.47,12.77-3.05v-16.27Z"/><path d="M376.35,110.76v-2.94l2.37-.79c2.49-.79,2.94-2.71,2.94-5.08v-24.18c0-5.2-.45-9.04-2.94-11.3-1.7-1.58-4.18-2.37-7.01-2.37-3.28,0-5.99.79-8.7,1.81-2.49.9-4.75,2.03-6.1,2.83v33.45c0,3.5.68,3.73,3.73,4.29l5.31.9v3.39h-23.96v-2.94l2.49-.79c2.49-.79,2.71-2.37,2.71-5.08v-30.51c0-3.5-.45-4.75-2.15-5.99l-2.6-1.92v-1.92l12.66-6.67,1.81.68v8.93c2.83-2.03,12.54-8.59,19.32-8.59,8.48,0,15.14,5.65,15.14,14.35v31.87c0,3.5.79,3.84,3.73,4.29l5.54.9v3.39h-24.3Z"/><path d="M447.65,113.92l-1.13-.9-.68-6.89c-4.52,2.6-10.85,6.33-17.74,6.33-13.33,0-21.58-10.74-21.58-26.22s11.75-29.16,29.27-29.16c3.39,0,8.02.79,10.06,1.36v-13.56c0-4.29-.9-5.65-2.83-6.78l-2.6-1.47v-1.81l13.67-7.8,2.26.79s-.79,8.81-.79,12.77v62.38c0,2.49,1.02,4.07,3.5,4.07.34,0,.68,0,1.13-.11l4.41-.68v4.18l-16.95,3.5ZM445.84,66.91c-4.07-2.15-7.91-3.62-13.56-3.62-9.83,0-16.16,3.62-16.16,17.63s5.31,24.41,17.06,24.41c4.41,0,9.27-1.24,12.66-2.49v-35.94Z"/><path d="M512.51,112.56c-3.16,0-7.01-.79-8.25-4.75-5.2,2.15-11.53,4.52-17.4,4.52-8.93,0-14.24-4.97-14.24-13.11,0-6.55,2.26-10.62,10.96-12.88,5.54-1.47,12.09-2.37,20.12-3.5v-7.8c0-1.24,0-2.6-.34-4.75-.79-5.2-6.44-7.68-10.85-7.68-2.37,0-4.63.68-6.67,2.03-1.69,1.13-2.26,2.37-2.26,4.18l-8.36,2.03c-.23-.57-.34-1.13-.34-1.81,0-2.15,1.69-4.29,3.62-5.76,2.26-1.81,4.52-3.28,7.34-4.52,3.39-1.58,7.91-3.16,12.32-3.16,3.96,0,7.23,1.02,9.72,2.6,2.6,1.69,4.29,4.18,4.86,7.57.34,1.92.34,4.18.34,7.35v26.56c0,4.52,2.37,6.33,5.31,6.33s4.97-1.24,6.89-2.71l.9,3.5c-4.41,3.05-8.93,5.76-13.67,5.76ZM503.7,87.25c-7.01.79-11.41,1.58-16.61,2.94-4.52,1.13-5.65,3.05-5.65,6.67,0,5.2,3.5,9.72,9.49,9.72,4.18,0,8.48-1.47,12.77-3.05v-16.27Z"/><path d="M564.49,68.94h-.23c-1.47-.79-3.73-1.92-3.73-1.92-2.03-1.02-3.62-1.58-5.08-1.58-1.7,0-3.39.79-5.42,2.37l-3.96,3.05v31.3c0,3.05,1.58,3.5,3.73,3.84l8.14,1.36v3.39h-26.78v-2.94l2.49-.68c2.49-.68,2.71-2.6,2.71-5.2v-29.04c0-3.62-.11-5.31-2.03-7.01l-2.71-2.37v-1.92l12.66-6.67,1.81.68v10.17c1.7-1.7,9.27-7.68,9.27-7.68,2.71-2.26,4.29-3.16,5.54-3.16,1.36,0,2.26,1.13,3.84,3.73l2.03,3.5c-.57,2.03-1.58,5.09-2.26,6.78Z"/><path d="M611.95,113.92l-1.13-.9-.68-6.89c-4.52,2.6-10.85,6.33-17.74,6.33-13.33,0-21.58-10.74-21.58-26.22s11.75-29.16,29.27-29.16c3.39,0,8.02.79,10.06,1.36v-13.56c0-4.29-.9-5.65-2.83-6.78l-2.6-1.47v-1.81l13.67-7.8,2.26.79s-.79,8.81-.79,12.77v62.38c0,2.49,1.02,4.07,3.5,4.07.34,0,.68,0,1.13-.11l4.41-.68v4.18l-16.95,3.5ZM610.14,66.91c-4.07-2.15-7.91-3.62-13.56-3.62-9.83,0-16.16,3.62-16.16,17.63s5.31,24.41,17.06,24.41c4.41,0,9.27-1.24,12.66-2.49v-35.94Z"/><path d="M688.79,110.76v-3.28c2.71-.23,3.96-1.13,3.96-3.39,0-1.02-.23-2.26-.79-3.84l-5.42-14.58h-29.38l-4.41,11.3c-.79,1.92-1.02,3.5-1.02,4.75,0,2.83,1.7,4.41,6.67,5.99v3.05h-20.57v-3.05c3.96-1.02,7.01-7.91,8.36-11.19l18.08-43.06c3.28-7.68,5.31-13.22,8.36-20.45h4.63c1.02,3.62,4.63,12.66,6.44,17.18l19.78,49.95c1.24,3.28,3.96,6.67,7.91,7.35v3.28h-22.6ZM672.06,48.6l-12.77,31.3h25.09l-12.32-31.3Z"/><path d="M759.86,62.84c2.37,3.05,3.73,7.01,3.73,11.53,0,9.27-6.67,18.31-18.87,21.7-1.02.23-3.28.68-6.44,1.58-1.36.34-2.71.79-3.84,1.24-1.47.68-2.37,1.58-2.37,2.6,0,1.58,1.7,2.49,3.5,3.05,1.36.34,2.71.57,6.89.57h11.98c10.28,0,15.71,3.5,15.71,10.74,0,10.85-14.13,20.45-32.32,20.45-14.01,0-20-4.07-20-10.85,0-4.86,5.2-9.72,13.22-12.54-3.62-.79-8.7-3.5-8.7-7.68,0-4.75,6.33-7.35,11.08-9.38-8.02-1.58-13.56-9.61-13.56-17.18,0-12.77,10.85-23.51,23.51-23.51,3.39,0,6.78.9,9.72,2.37h18.53v5.31h-11.75ZM753.42,113.35h-11.75c-7.23,0-14.69,4.07-14.69,8.93,0,5.76,7.01,7.68,14.8,7.68,9.83,0,21.02-2.71,21.02-11.3,0-3.39-3.39-5.31-9.38-5.31ZM739.64,61.48c-6.78,0-11.53,4.18-11.53,11.19,0,8.25,5.65,18.42,14.8,18.42,8.02,0,11.98-6.22,11.98-13,0-8.7-5.99-16.61-15.26-16.61Z"/><path d="M799.08,112.56c-13.9,0-22.38-10.28-22.38-26.44,0-14.13,8.36-30.17,24.97-30.17,10.51,0,18.08,8.14,21.02,16.39l1.47.68v3.05l-38.2,9.04c1.02,10.62,7.23,21.02,19.55,21.02,4.63,0,11.41-2.37,17.18-6.55l1.58,4.29c-7.57,6.78-18.08,8.7-25.2,8.7ZM799.64,60.69c-7.35,0-13.9,8.02-13.9,20.23l26.78-7.01c-1.81-7.12-6.44-13.22-12.88-13.22Z"/><path d="M866.42,110.76v-2.94l2.37-.79c2.49-.79,2.94-2.71,2.94-5.08v-24.18c0-5.2-.45-9.04-2.94-11.3-1.7-1.58-4.18-2.37-7.01-2.37-3.28,0-5.99.79-8.7,1.81-2.49.9-4.75,2.03-6.1,2.83v33.45c0,3.5.68,3.73,3.73,4.29l5.31.9v3.39h-23.96v-2.94l2.49-.79c2.49-.79,2.71-2.37,2.71-5.08v-30.51c0-3.5-.45-4.75-2.15-5.99l-2.6-1.92v-1.92l12.66-6.67,1.81.68v8.93c2.83-2.03,12.54-8.59,19.32-8.59,8.48,0,15.14,5.65,15.14,14.35v31.87c0,3.5.79,3.84,3.73,4.29l5.54.9v3.39h-24.3Z"/><path d="M931.96,63.52h-19.55v34.02c0,3.28.45,4.52,1.24,5.42,1.24,1.36,3.16,2.37,5.31,2.37,4.97,0,8.93-2.03,12.09-3.73v4.75c-2.83,2.26-10.51,6.21-14.92,6.21-7.46,0-13.9-3.73-13.9-10.06,0-2.71.45-10.06.45-20.91v-17.18l-6.44-1.58v-2.03c3.28-2.83,9.38-8.7,14.01-13.56h2.71s-.45,7.57-.57,10.28h20.68l-1.13,5.99Z"/><path d="M957.38,112c-4.07,0-8.14-.68-12.09-1.24h-4.97l-.57-14.92,3.84-.45,1.36,4.52c1.7,5.76,6.55,7.01,11.87,7.01,4.97,0,12.88-1.24,12.88-7.57,0-4.29-3.28-6.67-7.68-8.7-3.5-1.58-7.01-2.83-10.62-4.52-5.88-2.83-10.85-6.78-10.85-14.8s7.91-15.37,20.91-15.37c3.5,0,6.89.56,10.28,1.36l3.05,12.66-4.18,1.24c-2.03-5.2-4.86-9.49-12.32-9.49-4.29,0-10.51,2.15-10.51,7.35,0,4.29,3.62,6.44,8.36,8.47,3.28,1.36,6.67,2.49,10.51,4.41,5.76,2.83,10.62,6.78,10.62,14.46,0,10.51-10.28,15.6-19.89,15.6Z"/></g></svg>
          </a><span class="sa-callout-badge">Early Access</span>
        </div>
        <p class="sa-callout-desc">
          From the team behind
          <a href="https://formkit.com" target="_blank" rel="noopener">FormKit</a>,
          <a href="https://arrow-js.com" target="_blank" rel="noopener">ArrowJS</a>,
          <a href="https://dmux.ai" target="_blank" rel="noopener">dmux</a>,
          <a href="https://tempo.formkit.com" target="_blank" rel="noopener">Tempo</a>,
          and
          <a href="https://auto-animate.formkit.com" target="_blank" rel="noopener">AutoAnimate</a>
          &mdash; Standard Agents is an open standard for creating
          domain-specific agents you can distribute and compose together to form
          safe, efficient, and effective agents. Join the early access list.
        </p>
        <div class="${() => cs.phase === 'success' ? 'sa-callout-form-wrap sa-hidden' : 'sa-callout-form-wrap'}">
          <form class="sa-callout-form" @submit="${submit}">
            <input type="text" name="name" placeholder="Name" required class="sa-callout-input" />
            <input type="email" name="email" placeholder="Email" required class="sa-callout-input" />
            <button type="submit" class="sa-callout-submit" disabled="${() => cs.phase === 'loading'}">
              <span class="${() => cs.phase === 'loading' ? 'sa-hidden' : ''}">Request Early Access</span>
              <svg class="${() => cs.phase === 'loading' ? 'sa-spinner' : 'sa-spinner sa-hidden'}" viewBox="0 0 20 20" width="16" height="16" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2.5" opacity="0.25"></circle><path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path></svg>
            </button>
          </form>
          <p class="${() => cs.phase === 'error' ? 'sa-callout-error' : 'sa-callout-error sa-hidden'}">${() => cs.errorMsg}</p>
        </div>
        <div class="${() => cs.phase === 'success' ? 'sa-callout-success' : 'sa-callout-success sa-hidden'}">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5"></circle><path d="M6 10.5l2.5 2.5 5.5-5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          <span>You're on the list! We'll be in touch.</span>
        </div>
      </div>
    </div>
  `
})

const TocLink = component((props) => html`
  <a
    href="${() => '#' + props.id}"
    class="${() => {
      let cls = 'toc__link'
      if (props.indent) cls += ' toc__link--indent'
      if (state.activeSection === props.id) cls += ' toc__link--active'
      return cls
    }}"
  >${() => props.label}</a>
`)

const MobileTocLink = component((props) => html`
  <a
    href="${() => '#' + props.id}"
    data-mobile-toc-id="${() => props.id}"
    class="${() =>
      state.activeTopSection === props.id
        ? 'mobile-toc__link mobile-toc__link--active'
        : 'mobile-toc__link'}"
  >${() => props.label}</a>
`)

const App = component(() => html`
  <main class="page">
    <nav class="nav">
      <a href="#" class="nav__brand">
        <img src="/favicon.svg" alt="sip" class="nav__icon" />
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

    <nav class="mobile-toc" aria-label="Page sections">
      <div class="mobile-toc__inner">
        ${topTocItems.map((item) => MobileTocLink(item))}
      </div>
    </nav>

    <div class="shell">
      <section class="hero">
        <img src="${sipLogoUrl}" alt="sip" class="hero__banner" />
        <h1 class="hero__title">
          <span class="hero__title-line">Small Image</span>
          <span class="hero__title-accent">Processor</span>
        </h1>
        <p class="hero__sub">
          Ultra low memory WASM image processing for Cloudflare Workers.
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
            <a class="deploy-button" href="${exampleDeployUrl}" target="_blank" rel="noreferrer">
              <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
            </a>
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
                    @input="${(e) => { updateDemoOption('demoMaxWidth', e.target.value) }}"
                  />
                </div>
                <div class="demo__field">
                  <label>Max height</label>
                  <input
                    type="number"
                    data-testid="demo-height-input"
                    value="${() => state.demoMaxHeight}"
                    @input="${(e) => { updateDemoOption('demoMaxHeight', e.target.value) }}"
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
                    @input="${(e) => { updateDemoOption('demoQuality', e.target.value) }}"
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
              Workers. Workers have a 128 MB memory limit, and most image
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
            <h3>Why sip?</h3>
            <p>
              Cloudflare already has built-in image processing, but it can still
              be useful to run transforms directly inside your own Worker or
              Durable Object. That can mean fewer bindings to manage, better
              isolation inside the code that already owns the request, and easier
              distribution when you want image processing packaged as part of
              your application instead of a separate service boundary.
            </p>
            ${SignupCallout()}
          </section>

          <section id="install">
            <h2>Installation</h2>
            <div class="install-bar">
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
                  ><img src="${pmLogos[tool]}" alt="${tool}" /></button>
                `)}
              </div>
              <div class="install-cmd" @click="${copyInstallCmd}">
                <code>${() => installCommands[state.installTool]}</code>
              </div>
              <button
                class="install-copy"
                title="Copy to clipboard"
                @click="${copyInstallCmd}"
              >
                <svg style="${() => state.installCopied ? 'display:none' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg style="${() => state.installCopied ? '' : 'display:none'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
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
                <code>WebAssembly.Module</code> or raw bytes if you need to
                override the default loader. In Workers and workerd, the normal
                pattern is just <code>await ready()</code>.
              </p>
              <p>
                The workerd build wires up the bundled WASM for you, and
                <code>ready()</code> is idempotent, so calling it directly in
                your request handler is fine.
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
              A single-file Cloudflare Worker that serves an upload page and
              returns the resized JPEG with metadata headers for the demo UI. The deploy button uses the dedicated
              <code>standardagents/sip-worker-example</code> template repo so it avoids
              Cloudflare's monorepo import edge cases.
            </p>
            <div class="example__actions">
              <a class="btn" href="https://example-sip.formkit.workers.dev/" target="_blank" rel="noopener">Demo Worker</a>
              <a class="btn" href="${exampleSourceUrl}" target="_blank" rel="noreferrer">View source</a>
              <a class="deploy-button" href="${exampleDeployUrl}" target="_blank" rel="noreferrer">
                <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
              </a>
            </div>
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
  initScrollSpy()
})
