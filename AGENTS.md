# @standardagents/sip

**S**mall **I**mage **P**rocessor - Ultra memory-efficient image processing for Cloudflare Workers.

This package now lives in the standalone `standardagents/sip` repository. It is
published independently and consumed by other Standard Agents packages via npm.

## Why This Exists

Cloudflare Workers: 128MB memory limit. A 25MP JPEG decoded = ~100MB raw pixels. Traditional libraries cause "Network connection lost" errors on large uploads.

**sip solution**: Scanline streaming + DCT scaling = <1MB peak memory for ANY size image.

## Architecture

```
Input (any format) → Decode (scanline) → Resize (2-row buffer) → Encode (scanline) → JPEG output
```

**Memory during 100MP image processing**: ~50KB (not 300MB).

## Format Support

| Format | Decoder | Method | Notes |
|--------|---------|--------|-------|
| **JPEG** | libjpeg-turbo (WASM) | DCT scaling + scanline | Best case: decode at 1/8 scale |
| **PNG** | libspng (WASM) | Row-by-row progressive | Full resolution decode, stream output |
| **WebP** | @jsquash/webp | Full decode | No WASM yet, higher memory |
| **AVIF** | @jsquash/avif | Full decode | No WASM yet, higher memory |

**Output**: Always JPEG (universal, good compression).

## File Structure

```
src/
├── index.ts              # Exports the public stream-first API
├── api.ts                # Main decode/resize/encode API surface
├── input.ts              # Byte input normalization + inspect()
├── probe.ts              # Format detection from magic bytes (no decode)
├── resize.ts             # Bilinear interpolation (2-row buffer)
├── encoder.ts            # WASM JPEG encoder wrapper
├── types.ts              # Shared types
├── decoders/
│   ├── simple.ts         # @jsquash fallback (WebP/AVIF only)
│   └── types.ts          # Decoder interface
└── wasm/
    ├── index.ts          # WASM module exports
    ├── loader.ts         # WASM loading (browser/Workers/Node)
    ├── decoder.ts        # WasmJpegDecoder class
    ├── png-decoder.ts    # WasmPngDecoder class
    ├── encoder.ts        # WasmJpegEncoder class
    └── types.ts          # WASM function signatures

wasm/
├── build.sh              # Emscripten build script
├── src/sip.c             # C bindings for libjpeg-turbo + libspng
└── libs/                 # Downloaded during build (not committed)
    ├── libjpeg-turbo-3.0.1/
    ├── libspng-0.7.4/
    └── miniz-2.2.0/

docs/
├── index.html            # Static docs shell
├── main.js               # Arrow app entrypoint
├── styles.css            # Docs site styling
└── vite.config.mjs       # Static site build config

scripts/
└── release.mjs           # Local release orchestration for stable and prerelease tags

.github/workflows/
└── publish.yml           # Tag-driven build, npm trusted publish, release notes

docs-dist/                # Generated static site output (gitignored)
```

## Docs Site

This repo ships a static docs site built with Arrow and Vite, plus a markdown
mirror for LLMs.

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

Use it for package-level docs and examples only. Keep it static, client-only, and
independent from the library build. The build output goes to `docs-dist/` and
should not be committed.

### Documentation lives in TWO places — keep them in sync

Whenever you change the API surface, examples, options, or any user-facing
docs content, you MUST update **both**:

1. `docs/main.js` — the interactive Arrow site at <https://sip.standardagents.ai>
2. `docs/public/llms.md` — the LLM-friendly markdown mirror served at `/llms.md`

The "Markdown docs" button in the hero links to `/llms.md`, so users (and LLMs)
will see whatever is in that file. If the two drift, agents will get stale or
contradicting information. Always update both in the same commit.

### SSR + hydration

The docs site is server-rendered at build time and hydrated on the client.

- `docs/main.js` — defines all components and `export`s the `App` factory.
  Module-level browser side effects (fetch, scroll handlers, etc.) are
  guarded behind `if (isBrowser)` so the file can be imported by Node.
- `docs/entry-server.js` — imports `App` and uses
  `renderToString` from `@arrow-js/ssr` to produce an HTML string. Inlines
  the shiki-highlighted code blocks too.
- `docs/scripts/prerender.mjs` — runs after `vite build` completes. Spins
  up Vite in middleware mode, calls `entry-server.renderPage()`, and
  patches the empty `<div id="app"></div>` in `docs-dist/client/index.html`
  with the rendered HTML.
- The client uses `hydrate()` from `@arrow-js/hydrate` instead of `render()`
  so reactive state attaches to the existing server-rendered nodes without
  re-creating them.

When adding new code-block keys to `docs/code-blocks.js`, the prerender step
will automatically inline them — no extra wiring needed. Just don't add
client-only side effects at module load that crash on the server (use the
`isBrowser` guard).

## Release Automation

Publishing is driven by tag pushes. npm releases use trusted publishing from
GitHub Actions, so there is no `NPM_TOKEN` in this repo or workflow.

```bash
pnpm verify              # CI-equivalent check: typecheck, build, docs, unit tests
pnpm verify:release      # Local release gate: rebuild WASM, then run verify
pnpm release             # Stable release from main
pnpm release:next        # Pre-release tag flow
pnpm release:dev         # Alternate pre-release tag flow
```

Rules:
- Stable releases must come from `main` and produce tags like `v1.2.3`
- Pre-releases use tags like `v1.2.4-next.231fa`
- Pre-release version bumps happen in a temporary commit that is pushed only by tag, then the local branch is restored to its original version
- The publish workflow only generates GitHub release notes for stable tags after a successful npm publish
- All commits in this repo should use Conventional Commits formatting

## WASM Build

**Prerequisites**: Emscripten SDK

```bash
# Install emsdk (once)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh

# Build WASM
pnpm build:wasm
```

**Output**: `dist/sip.js` + `dist/sip.wasm`

**What it builds**:
1. Downloads libjpeg-turbo, libspng, miniz to `wasm/libs/`
2. Compiles libjpeg-turbo with emcmake/emmake
3. Compiles sip.c + libspng + miniz with emcc
4. Outputs ES6 module with WASM

**Build flags** (in build.sh):
- `ALLOW_MEMORY_GROWTH=1` - Dynamic memory
- `INITIAL_MEMORY=2097152` - 2MB start
- `MAXIMUM_MEMORY=134217728` - 128MB cap
- `FILESYSTEM=0` - No virtual FS (smaller)
- `SPNG_USE_MINIZ` - Use miniz instead of zlib

## Key APIs

### ready(options?)
```typescript
await ready();
// or: await ready({ wasm: compiledModule });
```
Loads the WASM module. Call once per isolate and cache the promise.

### inspect(input)
```typescript
const { info, source } = await inspect(request);
// info: { format, width, height, hasAlpha }
```
Reads headers without decoding the full image and returns a reusable source.

### transform(input, options) + collect(image)
```typescript
const image = transform(source, {
  width: 2048,
  height: 2048,
  quality: 85,
});

const result = await collect(image);
// { data: ArrayBuffer, info, stats }
```
This is the main high-level flow for resize + JPEG encode.

## Memory Model

### DCT Scaling (JPEG only)
libjpeg-turbo decodes at reduced resolution during decompression:
- 1/8 scale: 6800px → 850px (decode uses 1/64th memory)
- sip auto-selects optimal scale based on target dimensions

### Scanline Processing
```
Source row 0 → resize buffer A
Source row 1 → resize buffer B
Interpolate A+B → output row → encode → discard
(rotate: A=B, read next into B)
```
Peak memory: 2 source rows + 1 output row = ~15KB for 2000px width.

### Why WebP/AVIF Use More Memory
No WASM decoders yet. @jsquash decodes full image to memory, then sip resizes scanline-by-scanline and encodes with WASM. Still better than alternatives, but not optimal.

## Critical Gotchas

### 1. WASM Must Be Built
JPEG/PNG processing **requires** WASM. No fallback. Will throw:
```
Error: SIP WASM module not available. Build with `pnpm build:wasm`
```

### 2. WASM Not Committed
`dist/sip.wasm` is gitignored. CI/CD must run `pnpm build:wasm`.

### 3. Output is Always JPEG
No PNG/WebP output. Simplifies encoder, universal compatibility.

### 4. maxBytes is Best-Effort
Retries with quality-10 until quality=45. If still over, resizes smaller. May slightly exceed target.

### 5. Aspect Ratio Preserved
Output fits within maxWidth×maxHeight box, maintaining aspect ratio.

### 6. No Alpha Channel
Output JPEG has no transparency. Alpha discarded during processing.

## Testing

```bash
pnpm test:unit     # All tests (probe tests always run)
pnpm build:wasm    # Build WASM first for full coverage
pnpm test:unit     # Now JPEG/PNG processing tests run
```

**Test fixtures**: `tests/fixtures/`
- `large.jpg` - 102MP test image (11375×8992)
- `sample.png`, `sample.webp`, `sample.avif` - 1000×667

Tests skip gracefully if WASM not built. CI should build WASM first.

## Extending

### Adding New Input Format
1. Add probe logic in `src/probe.ts` (magic bytes + dimension parsing)
2. Either:
   - Add WASM decoder (preferred): Update `wasm/build.sh`, `wasm/src/sip.c`, create `src/wasm/xxx-decoder.ts`
   - Add @jsquash fallback: Update `src/decoders/simple.ts`
3. Add streaming processor in `src/streaming.ts`
4. Update `src/pipeline.ts` to route format

### WASM Size Budget
Current: ~700KB (libjpeg-turbo + libspng + miniz). Each new codec adds ~100-300KB. Monitor with:
```bash
ls -la dist/sip.wasm
```

## Dependencies

**Runtime** (kept minimal):
- `@jsquash/webp` - WebP decode only
- `@jsquash/avif` - AVIF decode only

**Removed** (replaced with WASM):
- ~~@jsquash/jpeg~~ - Now libjpeg-turbo WASM
- ~~@jsquash/png~~ - Now libspng WASM
