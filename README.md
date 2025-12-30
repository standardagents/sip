# @standardagents/sip

**S**mall **I**mage **P**rocessor - Ultra memory-efficient image processing for Cloudflare Workers.

## Features

- **Format Detection**: Probe images for format and dimensions without decoding
- **Scanline Resize**: Memory-efficient bilinear interpolation using only 2 rows at a time
- **Multi-format Input**: JPEG, PNG, WebP, AVIF
- **JPEG Output**: Always outputs JPEG with configurable quality
- **Size Control**: Resize to target dimensions and/or file size
- **Streaming WASM** (optional): DCT-scaled JPEG decoding for <1MB peak memory on any image size

## Installation

```bash
pnpm add @standardagents/sip
```

## Usage

```typescript
import { sip } from '@standardagents/sip';

// Process an image
const result = await sip.process(imageBuffer, {
  maxWidth: 2048,
  maxHeight: 2048,
  maxBytes: 1.5 * 1024 * 1024, // 1.5MB target
  quality: 85,
});

console.log(result.width, result.height); // Output dimensions
console.log(result.mimeType); // 'image/jpeg'
console.log(result.originalFormat); // 'png', 'jpeg', etc.

// Get the output
const jpegBlob = new Blob([result.data], { type: 'image/jpeg' });
```

### Probe Only

Get image info without decoding:

```typescript
import { sip } from '@standardagents/sip';

const info = sip.probe(imageBuffer);
console.log(info.format); // 'jpeg' | 'png' | 'webp' | 'avif'
console.log(info.width, info.height);
console.log(info.hasAlpha);
```

## API

### `sip.process(input, options)`

Process an image: decode, resize, and encode to JPEG.

**Parameters:**
- `input: ArrayBuffer` - Input image data
- `options: ProcessOptions` - Processing options

**Options:**
- `maxWidth?: number` - Maximum output width (default: 4096)
- `maxHeight?: number` - Maximum output height (default: 4096)
- `maxBytes?: number` - Target output size in bytes (default: 1.5MB)
- `quality?: number` - JPEG quality 1-100 (default: 85)

**Returns:** `ProcessResult`
- `data: ArrayBuffer` - JPEG image data
- `width: number` - Output width
- `height: number` - Output height
- `mimeType: 'image/jpeg'` - Always JPEG
- `originalFormat: ImageFormat` - Original input format

### `sip.probe(input)`

Get format and dimensions without decoding.

**Parameters:**
- `input: ArrayBuffer | Uint8Array` - Image data

**Returns:** `ProbeResult`
- `format: 'jpeg' | 'png' | 'webp' | 'avif' | 'unknown'`
- `width: number`
- `height: number`
- `hasAlpha: boolean`

## Memory Efficiency

The library has two processing modes:

### Standard Mode (Default)

Uses `@jsquash/*` packages for decode/encode with scanline-based resize:
- Only 2 rows in memory during resize
- Full image decoded to memory first
- Works for images that fit in Worker memory (~128MB limit)

### Streaming WASM Mode (Optional)

For JPEG images when WASM is built, uses ultra-efficient streaming:
- **DCT Scaling**: Decode JPEG at 1/2, 1/4, or 1/8 scale directly during decompression
- **Scanline Processing**: Never holds the full image in memory
- **Peak Memory**: ~50KB for any image size

Memory comparison for a 25MP (6800x3900) image:

| Mode | Peak Memory |
|------|-------------|
| Standard (@jsquash) | ~107MB |
| Streaming WASM (1/4 scale) | ~50KB |

## Building WASM Module

The WASM module is optional. Without it, sip falls back to standard processing.

### Prerequisites

- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)
- CMake
- Make

### Build

```bash
# Install Emscripten (if not already)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh

# Build WASM
cd packages/sip
pnpm build:wasm
```

This downloads libjpeg-turbo, compiles it to WASM, and generates:
- `dist/sip.js` - Emscripten loader
- `dist/sip.wasm` - WebAssembly binary

### Using WASM

To enable streaming mode, register the WASM loader before processing:

```typescript
import { sip } from '@standardagents/sip';
import createSipModule from '@standardagents/sip/dist/sip.js';

// Register WASM loader (once at startup)
globalThis.__SIP_WASM_LOADER__ = async () => createSipModule();

// Now sip.process() will use streaming for JPEG
const result = await sip.process(jpegBuffer, { maxWidth: 2048 });
```

## Architecture

```
Input → [Probe] → [Decode*] → [Resize] → [Encode*] → Output
                     ↓           ↓           ↓
              WASM: DCT     Scanline    WASM: Scanline
              Scaling       Bilinear    JPEG Encode
```

*When WASM is available, decode and encode process one row at a time.

## License

UNLICENSED - Proprietary
