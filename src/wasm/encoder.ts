/**
 * WASM JPEG Encoder with Scanline Streaming
 *
 * Memory-efficient JPEG encoding that processes one scanline at a time.
 */

import type { Scanline } from '../types';
import type { SipWasmModule } from './types';
import { getWasmModule, copyFromWasm } from './loader';

/**
 * WASM-based JPEG encoder with scanline streaming
 */
export class WasmJpegEncoder {
  private module: SipWasmModule;
  private encoder: number = 0;
  private width: number = 0;
  private height: number = 0;
  private quality: number = 85;
  private rowBufferPtr: number = 0;
  private started: boolean = false;
  private finished: boolean = false;
  private currentLine: number = 0;

  constructor() {
    this.module = getWasmModule();
  }

  /**
   * Initialize encoder with output dimensions and quality
   *
   * @param width - Output image width
   * @param height - Output image height
   * @param quality - JPEG quality (1-100, default 85)
   */
  init(width: number, height: number, quality: number = 85): void {
    this.width = width;
    this.height = height;
    this.quality = Math.max(1, Math.min(100, quality));

    // Create encoder
    this.encoder = this.module._sip_encoder_create();
    if (!this.encoder) {
      throw new Error('Failed to create JPEG encoder');
    }

    // Initialize with dimensions and quality
    if (this.module._sip_encoder_init(this.encoder, width, height, this.quality) !== 0) {
      this.dispose();
      throw new Error('Failed to initialize encoder');
    }
  }

  /**
   * Start encoding
   */
  start(): void {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }
    if (this.started) {
      throw new Error('Encoding already started');
    }

    if (this.module._sip_encoder_start(this.encoder) !== 0) {
      throw new Error('Failed to start compression');
    }

    this.rowBufferPtr = this.module._sip_encoder_get_row_buffer(this.encoder);
    if (!this.rowBufferPtr) {
      throw new Error('Failed to get row buffer');
    }

    this.started = true;
    this.currentLine = 0;
  }

  /**
   * Write a scanline to the encoder
   *
   * @param scanline - Scanline with RGB data
   */
  writeScanline(scanline: Scanline): void {
    this.writeScanlineData(scanline.data);
  }

  /**
   * Write raw RGB data as a scanline
   *
   * @param data - RGB data (width * 3 bytes)
   */
  writeScanlineData(data: Uint8Array): void {
    if (!this.started || this.finished) {
      throw new Error('Encoder not ready for writing');
    }

    if (this.currentLine >= this.height) {
      throw new Error('All scanlines already written');
    }

    const expectedSize = this.width * 3;
    if (data.length !== expectedSize) {
      throw new Error(`Invalid scanline size: expected ${expectedSize}, got ${data.length}`);
    }

    // Copy data to WASM row buffer
    this.module.HEAPU8.set(data, this.rowBufferPtr);

    // Write the scanline
    if (this.module._sip_encoder_write_scanline(this.encoder) !== 1) {
      throw new Error('Failed to write scanline');
    }

    this.currentLine++;
  }

  /**
   * Get current scanline number
   */
  getCurrentLine(): number {
    return this.currentLine;
  }

  /**
   * Finish encoding and get output
   *
   * @returns JPEG data as ArrayBuffer
   */
  finish(): ArrayBuffer {
    if (!this.started) {
      throw new Error('Encoding not started');
    }

    if (this.currentLine !== this.height) {
      throw new Error(`Incomplete image: wrote ${this.currentLine}/${this.height} scanlines`);
    }

    if (this.module._sip_encoder_finish(this.encoder) !== 0) {
      throw new Error('Failed to finish encoding');
    }

    this.finished = true;

    // Get output data
    const outputPtr = this.module._sip_encoder_get_output(this.encoder);
    const outputSize = this.module._sip_encoder_get_output_size(this.encoder);

    if (!outputPtr || !outputSize) {
      throw new Error('No output data');
    }

    // Copy output to new buffer
    const output = copyFromWasm(this.module, outputPtr, outputSize);
    return output.buffer as ArrayBuffer;
  }

  /**
   * Encode a full RGB buffer to JPEG
   *
   * @param pixels - RGB pixel data (width * height * 3 bytes)
   * @returns JPEG data as ArrayBuffer
   */
  encodeAll(pixels: Uint8Array): ArrayBuffer {
    if (pixels.length !== this.width * this.height * 3) {
      throw new Error(`Invalid pixel data size: expected ${this.width * this.height * 3}, got ${pixels.length}`);
    }

    this.start();

    const rowSize = this.width * 3;
    for (let y = 0; y < this.height; y++) {
      const rowData = pixels.subarray(y * rowSize, (y + 1) * rowSize);
      this.writeScanlineData(rowData);
    }

    return this.finish();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.encoder) {
      this.module._sip_encoder_destroy(this.encoder);
      this.encoder = 0;
    }

    this.started = false;
    this.finished = false;
    this.rowBufferPtr = 0;
    this.currentLine = 0;
  }
}
