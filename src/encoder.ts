import type { Encoder } from './decoders/types';
import { loadWasm, WasmJpegEncoder } from './wasm';

/**
 * JPEG encoder using native WASM (libjpeg-turbo)
 *
 * This encoder uses the native WASM module for efficient JPEG encoding.
 * It supports both full-buffer and scanline-by-scanline encoding.
 */
export class NativeEncoder implements Encoder {
  readonly supportsScanline = true;

  private width = 0;
  private height = 0;
  private quality = 85;
  private wasmEncoder: WasmJpegEncoder | null = null;

  async init(width: number, height: number, quality: number): Promise<void> {
    this.width = width;
    this.height = height;
    this.quality = quality;

    // Ensure WASM is loaded
    await loadWasm();

    // Create encoder
    this.wasmEncoder = new WasmJpegEncoder();
    this.wasmEncoder.init(width, height, quality);
  }

  async encode(pixels: Uint8Array): Promise<ArrayBuffer> {
    if (!this.wasmEncoder) {
      throw new Error('Encoder not initialized. Call init() first.');
    }

    return this.wasmEncoder.encodeAll(pixels);
  }

  dispose(): void {
    if (this.wasmEncoder) {
      this.wasmEncoder.dispose();
      this.wasmEncoder = null;
    }
  }
}

/**
 * Create a JPEG encoder
 *
 * Uses native WASM (libjpeg-turbo) for efficient encoding.
 * The WASM module must be built before use.
 */
export async function createEncoder(
  width: number,
  height: number,
  quality: number
): Promise<Encoder> {
  const encoder = new NativeEncoder();
  await encoder.init(width, height, quality);
  return encoder;
}
