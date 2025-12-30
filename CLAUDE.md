# @standardagents/sip

**S**mall **I**mage **P**rocessor - Ultra memory-efficient image processing for Cloudflare Workers.

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
├── index.ts              # Exports: sip, probe, initStreaming
├── probe.ts              # Format detection from magic bytes (no decode)
├── pipeline.ts           # Main sip.process() orchestration
├── streaming.ts          # WASM streaming processors
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
    └── miniz-3.0.2/
```

## WASM Build

**Prerequisites**: Emscripten SDK

```bash
# Install emsdk (once)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh

# Build WASM
cd packages/sip
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

### probe(data)
```typescript
const info = probe(imageBuffer);
// { format: 'jpeg'|'png'|'webp'|'avif'|'unknown', width, height, hasAlpha }
```
Reads magic bytes + dimensions from header. No full decode. Fast.

### sip.process(data, options)
```typescript
const result = await sip.process(imageBuffer, {
  maxWidth: 2048,      // Max output width
  maxHeight: 2048,     // Max output height
  maxBytes: 1572864,   // 1.5MB target (retries with lower quality)
  quality: 85,         // JPEG quality 1-100
});
// { data: ArrayBuffer, width, height, mimeType: 'image/jpeg', originalFormat }
```

### initStreaming()
```typescript
const available = await initStreaming();
// true if WASM loaded successfully
```
Call early to warm up WASM. Not required but reduces first-call latency.

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
