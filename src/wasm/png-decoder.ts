/**
 * WASM PNG Decoder with Row-by-Row Processing
 *
 * Memory-efficient PNG decoding using libspng's progressive API.
 * Decodes one row at a time to minimize memory usage.
 */

import type { Scanline } from '../types';
import type { SipWasmModule } from './types';
import { getWasmModule, copyToWasm } from './loader';

/**
 * WASM-based PNG decoder with row-by-row decoding
 */
export class WasmPngDecoder {
  private module: SipWasmModule;
  private decoder: number = 0;
  private dataPtr: number = 0;
  private width: number = 0;
  private height: number = 0;
  private hasAlpha: boolean = false;
  private rowBufferPtr: number = 0;
  private started: boolean = false;
  private finished: boolean = false;
  private currentRow: number = 0;

  constructor() {
    this.module = getWasmModule();
  }

  /**
   * Initialize decoder with PNG data
   */
  init(data: ArrayBuffer | Uint8Array): {
    width: number;
    height: number;
    hasAlpha: boolean;
  } {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Create decoder
    this.decoder = this.module._sip_png_decoder_create();
    if (!this.decoder) {
      throw new Error('Failed to create PNG decoder');
    }

    // Copy data to WASM memory
    this.dataPtr = copyToWasm(this.module, bytes);

    // Set source
    if (this.module._sip_png_decoder_set_source(this.decoder, this.dataPtr, bytes.length) !== 0) {
      this.dispose();
      throw new Error('Failed to set PNG decoder source');
    }

    // Read header
    if (this.module._sip_png_decoder_read_header(this.decoder) !== 0) {
      this.dispose();
      throw new Error('Failed to read PNG header');
    }

    this.width = this.module._sip_png_decoder_get_width(this.decoder);
    this.height = this.module._sip_png_decoder_get_height(this.decoder);
    this.hasAlpha = this.module._sip_png_decoder_has_alpha(this.decoder) !== 0;

    return { width: this.width, height: this.height, hasAlpha: this.hasAlpha };
  }

  /**
   * Get image dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Check if image has alpha channel
   */
  getHasAlpha(): boolean {
    return this.hasAlpha;
  }

  /**
   * Start decoding
   */
  start(): void {
    if (!this.decoder) {
      throw new Error('Decoder not initialized');
    }
    if (this.started) {
      throw new Error('Decoding already started');
    }

    if (this.module._sip_png_decoder_start(this.decoder) !== 0) {
      throw new Error('Failed to start PNG decompression');
    }

    this.rowBufferPtr = this.module._sip_png_decoder_get_row_buffer(this.decoder);
    if (!this.rowBufferPtr) {
      throw new Error('Failed to get row buffer');
    }

    this.started = true;
    this.currentRow = 0;
  }

  /**
   * Read next scanline
   *
   * @returns Scanline object or null if no more scanlines
   */
  readScanline(): Scanline | null {
    if (!this.started || this.finished) {
      return null;
    }

    if (this.currentRow >= this.height) {
      this.finished = true;
      return null;
    }

    const result = this.module._sip_png_decoder_read_row(this.decoder);

    if (result < 0) {
      throw new Error('Failed to read PNG row');
    }

    // Copy scanline data (RGB = 3 bytes per pixel)
    const rowSize = this.width * 3;
    const data = new Uint8Array(
      this.module.HEAPU8.buffer,
      this.rowBufferPtr,
      rowSize
    ).slice();

    const y = this.currentRow;
    this.currentRow++;

    // Check if done after reading this row
    if (result === 0 || this.currentRow >= this.height) {
      this.finished = true;
    }

    return {
      data,
      width: this.width,
      y,
    };
  }

  /**
   * Read all remaining scanlines
   *
   * @yields Scanline objects
   */
  *readAllScanlines(): Generator<Scanline> {
    let scanline: Scanline | null;
    while ((scanline = this.readScanline()) !== null) {
      yield scanline;
    }
  }

  /**
   * Decode entire image to RGB buffer
   *
   * @returns Full RGB pixel buffer
   */
  decodeAll(): { pixels: Uint8Array; width: number; height: number } {
    if (!this.started) {
      this.start();
    }

    const pixels = new Uint8Array(this.width * this.height * 3);
    const rowSize = this.width * 3;

    for (const scanline of this.readAllScanlines()) {
      pixels.set(scanline.data, scanline.y * rowSize);
    }

    return {
      pixels,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.decoder) {
      this.module._sip_png_decoder_destroy(this.decoder);
      this.decoder = 0;
    }

    if (this.dataPtr) {
      this.module._free(this.dataPtr);
      this.dataPtr = 0;
    }

    this.started = false;
    this.finished = false;
    this.rowBufferPtr = 0;
    this.currentRow = 0;
  }
}
