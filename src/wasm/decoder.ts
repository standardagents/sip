/**
 * WASM JPEG Decoder with Scaled DCT Support
 *
 * Memory-efficient JPEG decoding using libjpeg-turbo's scaled DCT feature.
 * Decodes at 1/2, 1/4, or 1/8 scale directly during decompression.
 */

import type { Scanline } from '../types';
import type { SipWasmModule, DctScaleDenom } from './types';
import { getWasmModule, copyToWasm } from './loader';

/**
 * WASM-based JPEG decoder with scaled DCT support
 */
export class WasmJpegDecoder {
  private module: SipWasmModule;
  private decoder: number = 0;
  private dataPtr: number = 0;
  private width: number = 0;
  private height: number = 0;
  private outputWidth: number = 0;
  private outputHeight: number = 0;
  private scaleDenom: DctScaleDenom = 1;
  private rowBufferPtr: number = 0;
  private started: boolean = false;
  private finished: boolean = false;

  constructor() {
    this.module = getWasmModule();
  }

  /**
   * Initialize decoder with JPEG data
   */
  init(data: ArrayBuffer | Uint8Array): {
    width: number;
    height: number;
  } {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Create decoder
    this.decoder = this.module._sip_decoder_create();
    if (!this.decoder) {
      throw new Error('Failed to create JPEG decoder');
    }

    // Copy data to WASM memory
    this.dataPtr = copyToWasm(this.module, bytes);

    // Set source
    if (this.module._sip_decoder_set_source(this.decoder, this.dataPtr, bytes.length) !== 0) {
      this.dispose();
      throw new Error('Failed to set decoder source');
    }

    // Read header
    if (this.module._sip_decoder_read_header(this.decoder) !== 0) {
      this.dispose();
      throw new Error('Failed to read JPEG header');
    }

    this.width = this.module._sip_decoder_get_width(this.decoder);
    this.height = this.module._sip_decoder_get_height(this.decoder);
    this.outputWidth = this.width;
    this.outputHeight = this.height;

    return { width: this.width, height: this.height };
  }

  /**
   * Get original image dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Set DCT scale factor for decoding
   *
   * Must be called after init() and before start()
   *
   * @param scaleDenom - Scale denominator: 1, 2, 4, or 8
   *   1 = full size (default)
   *   2 = 1/2 size
   *   4 = 1/4 size
   *   8 = 1/8 size
   */
  setScale(scaleDenom: DctScaleDenom): { width: number; height: number } {
    if (!this.decoder) {
      throw new Error('Decoder not initialized');
    }
    if (this.started) {
      throw new Error('Cannot change scale after decoding started');
    }

    if (this.module._sip_decoder_set_scale(this.decoder, scaleDenom) !== 0) {
      throw new Error(`Invalid scale denominator: ${scaleDenom}`);
    }

    this.scaleDenom = scaleDenom;
    this.outputWidth = this.module._sip_decoder_get_output_width(this.decoder);
    this.outputHeight = this.module._sip_decoder_get_output_height(this.decoder);

    return { width: this.outputWidth, height: this.outputHeight };
  }

  /**
   * Get output dimensions (after any scaling)
   */
  getOutputDimensions(): { width: number; height: number } {
    return { width: this.outputWidth, height: this.outputHeight };
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

    if (this.module._sip_decoder_start(this.decoder) !== 0) {
      throw new Error('Failed to start decompression');
    }

    this.rowBufferPtr = this.module._sip_decoder_get_row_buffer(this.decoder);
    if (!this.rowBufferPtr) {
      throw new Error('Failed to get row buffer');
    }

    this.started = true;
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

    const result = this.module._sip_decoder_read_scanline(this.decoder);

    if (result === 0) {
      // Done
      this.finished = true;
      return null;
    }

    if (result < 0) {
      throw new Error('Failed to read scanline');
    }

    // Get scanline number (1-indexed in libjpeg, but we want 0-indexed)
    const y = this.module._sip_decoder_get_scanline(this.decoder) - 1;

    // Copy scanline data
    const rowSize = this.outputWidth * 3;
    const data = new Uint8Array(
      this.module.HEAPU8.buffer,
      this.rowBufferPtr,
      rowSize
    ).slice();

    return {
      data,
      width: this.outputWidth,
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

    const pixels = new Uint8Array(this.outputWidth * this.outputHeight * 3);
    const rowSize = this.outputWidth * 3;

    for (const scanline of this.readAllScanlines()) {
      pixels.set(scanline.data, scanline.y * rowSize);
    }

    return {
      pixels,
      width: this.outputWidth,
      height: this.outputHeight,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.decoder) {
      this.module._sip_decoder_destroy(this.decoder);
      this.decoder = 0;
    }

    if (this.dataPtr) {
      this.module._free(this.dataPtr);
      this.dataPtr = 0;
    }

    this.started = false;
    this.finished = false;
    this.rowBufferPtr = 0;
  }
}

/**
 * Calculate optimal DCT scale factor for a target size
 *
 * Returns the largest scale factor that keeps the output >= target size.
 *
 * @param srcWidth - Original image width
 * @param srcHeight - Original image height
 * @param targetWidth - Desired output width
 * @param targetHeight - Desired output height
 */
export function calculateOptimalScale(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): DctScaleDenom {
  const scales: DctScaleDenom[] = [8, 4, 2, 1];

  for (const scale of scales) {
    // JPEG DCT scaling rounds up: ceil(dimension / scale)
    const scaledWidth = Math.ceil(srcWidth / scale);
    const scaledHeight = Math.ceil(srcHeight / scale);

    if (scaledWidth >= targetWidth && scaledHeight >= targetHeight) {
      return scale;
    }
  }

  return 1;
}
