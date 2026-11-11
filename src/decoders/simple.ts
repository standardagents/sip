import type { ImageFormat, Scanline } from '../types';
import type { Decoder } from './types';

type CodecWasmBinary = ArrayBuffer | Uint8Array | WebAssembly.Module;

/**
 * Detect Cloudflare Workers/workerd runtime even when node compat is enabled.
 */
function isCloudflareWorker(): boolean {
  const cacheStorage = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return typeof cacheStorage !== 'undefined' && typeof cacheStorage.default !== 'undefined';
}

function getPreloadedCodecBinary(format: 'avif' | 'webp'): CodecWasmBinary | null {
  const globalValue = (globalThis as Record<string, unknown>).__SIP_CODEC_WASM__;
  if (!globalValue || typeof globalValue !== 'object') {
    return null;
  }

  const formatValue = (globalValue as Record<string, unknown>)[format];
  if (
    formatValue instanceof ArrayBuffer ||
    formatValue instanceof Uint8Array ||
    formatValue instanceof WebAssembly.Module
  ) {
    return formatValue;
  }

  return null;
}

/**
 * Check if running in Node.js environment
 */
function isNode(): boolean {
  if (isCloudflareWorker()) {
    return false;
  }

  return typeof process !== 'undefined' &&
         process.versions != null &&
         process.versions.node != null;
}

async function initCodecWithBinary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initFn: (module: WebAssembly.Module) => Promise<any>,
  wasmSource: CodecWasmBinary
): Promise<void> {
  if (wasmSource instanceof WebAssembly.Module) {
    await initFn(wasmSource);
    return;
  }

  let buffer: ArrayBuffer;

  if (wasmSource instanceof Uint8Array) {
    const copy = new Uint8Array(wasmSource.byteLength);
    copy.set(wasmSource);
    buffer = copy.buffer;
  } else {
    buffer = wasmSource;
  }

  const wasmModule = await WebAssembly.compile(buffer);
  await initFn(wasmModule);
}

/**
 * Initialize a @jsquash codec for Node.js by loading its WASM module
 */
async function initCodecForNode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initFn: (module: WebAssembly.Module) => Promise<any>,
  wasmPath: string
): Promise<void> {
  // Dynamic module names prevent esbuild/wrangler from resolving these
  // at bundle time. Only Node.js reaches this function at runtime.
  const fsModule = 'fs/promises';
  const moduleModule = 'module';
  const { readFile } = await import(/* @vite-ignore */ fsModule);
  const { createRequire } = await import(/* @vite-ignore */ moduleModule);
  const require = createRequire(import.meta.url);

  // Resolve the WASM file path from the package
  const resolvedPath = require.resolve(wasmPath);
  const wasmBuffer = await readFile(resolvedPath);
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  await initFn(wasmModule);
}

/**
 * Simple decoder for WebP and AVIF formats
 *
 * This decoder handles formats that don't have native WASM support yet.
 * For JPEG and PNG, use the native WASM decoders which are more memory efficient.
 *
 * Works with:
 * - WebP via external @jsquash/webp
 * - AVIF via external @jsquash/avif
 *
 * Supports both Node.js and browser/Workers environments.
 */
export class SimpleDecoder implements Decoder {
  readonly format: ImageFormat;
  readonly supportsScanline = false;
  readonly supportsScaledDecode = false;

  private data: ArrayBuffer;
  private width = 0;
  private height = 0;
  private hasAlpha = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private decodeFn: ((data: ArrayBuffer) => Promise<any>) | null = null;

  constructor(format: ImageFormat, data: ArrayBuffer) {
    this.format = format;
    this.data = data;
  }

  async init(data: ArrayBuffer): Promise<{ width: number; height: number; hasAlpha: boolean }> {
    this.data = data;

    // Get decoder function based on format
    // In Node.js, we need to manually initialize the WASM modules
    // The init function is on the submodule (e.g. @jsquash/webp/decode.js)
    // Note: JPEG and PNG use native WASM decoders, not this fallback
    switch (this.format) {
      case 'avif': {
        const { default: decode, init } = await import('@jsquash/avif/decode.js');
        const preloaded = getPreloadedCodecBinary('avif');
        if (preloaded) {
          await initCodecWithBinary(init, preloaded);
        } else if (isNode()) {
          await initCodecForNode(init, '@jsquash/avif/codec/dec/avif_dec.wasm');
        }
        this.decodeFn = decode;
        this.hasAlpha = true; // AVIF may have alpha
        break;
      }
      case 'webp': {
        const { default: decode, init } = await import('@jsquash/webp/decode.js');
        const preloaded = getPreloadedCodecBinary('webp');
        if (preloaded) {
          await initCodecWithBinary(init, preloaded);
        } else if (isNode()) {
          await initCodecForNode(init, '@jsquash/webp/codec/dec/webp_dec.wasm');
        }
        this.decodeFn = decode;
        this.hasAlpha = true; // WebP may have alpha
        break;
      }
      case 'jpeg':
      case 'png':
        throw new Error(
          `${this.format.toUpperCase()} requires native WASM decoder. ` +
          'Build the WASM module with `pnpm build:wasm` in the @standardagents/sip repo root.'
        );
      default:
        throw new Error(`Unsupported format for SimpleDecoder: ${this.format}`);
    }

    // Decode to get dimensions (unfortunately this decodes the whole thing)
    // For a more efficient probe, use the probe() function first
    const imageData = await this.decodeFn(this.data);
    if (!imageData) {
      throw new Error(`Failed to decode ${this.format} image`);
    }
    this.width = imageData.width;
    this.height = imageData.height;

    return {
      width: this.width,
      height: this.height,
      hasAlpha: this.hasAlpha,
    };
  }

  async decode(_scaleFactor?: number): Promise<{
    pixels: Uint8Array;
    width: number;
    height: number;
  }> {
    if (!this.decodeFn) {
      throw new Error('Decoder not initialized. Call init() first.');
    }

    // Decode the image
    const imageData = await this.decodeFn(this.data);
    this.width = imageData.width;
    this.height = imageData.height;

    // Convert RGBA to RGB
    const rgba = new Uint8Array(imageData.data.buffer);
    const rgb = new Uint8Array(this.width * this.height * 3);

    let srcIdx = 0;
    let dstIdx = 0;
    const pixelCount = this.width * this.height;

    for (let i = 0; i < pixelCount; i++) {
      rgb[dstIdx++] = rgba[srcIdx++]; // R
      rgb[dstIdx++] = rgba[srcIdx++]; // G
      rgb[dstIdx++] = rgba[srcIdx++]; // B
      srcIdx++; // Skip A
    }

    return {
      pixels: rgb,
      width: this.width,
      height: this.height,
    };
  }

  dispose(): void {
    // Clean up references
    this.decodeFn = null;
  }
}

/**
 * Create a decoder for the given format
 */
export async function createDecoder(
  format: ImageFormat,
  data: ArrayBuffer
): Promise<Decoder> {
  const decoder = new SimpleDecoder(format, data);
  await decoder.init(data);
  return decoder;
}
