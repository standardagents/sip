/**
 * WASM JPEG Decoder with incremental input support.
 *
 * The low-memory Worker path feeds compressed bytes into libjpeg-turbo as the
 * request body arrives, then reads scaled scanlines as soon as the decoder can
 * produce them.
 */

import type { Scanline } from '../types';
import type { SipWasmModule, DctScaleDenom } from './types';
import { copyToWasm, getWasmModule } from './loader';

type StepResult = 'ready' | 'needMore';
type ScanlineStep = Scanline | null | 'needMore';

export class WasmJpegDecoder {
  private readonly module: SipWasmModule;
  private decoder = 0;
  private width = 0;
  private height = 0;
  private outputWidth = 0;
  private outputHeight = 0;
  private rowBufferPtr = 0;
  private started = false;
  private finished = false;

  constructor() {
    this.module = getWasmModule();
    this.decoder = this.module._sip_decoder_create();
    if (!this.decoder) {
      throw new Error('Failed to create JPEG decoder');
    }
  }

  pushInput(data: Uint8Array, isFinal = false): void {
    if (data.byteLength === 0 && !isFinal) {
      return;
    }

    let ptr = 0;
    try {
      ptr = data.byteLength > 0 ? copyToWasm(this.module, data) : 0;
      if (this.module._sip_decoder_push_input(this.decoder, ptr, data.byteLength, isFinal ? 1 : 0) !== 0) {
        throw new Error('Failed to feed JPEG bytes into decoder');
      }
    } finally {
      if (ptr) {
        this.module._free(ptr);
      }
    }
  }

  /**
   * Compatibility helper for full-buffer callers.
   */
  init(data: ArrayBuffer | Uint8Array): { width: number; height: number } {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let ptr = 0;
    try {
      ptr = copyToWasm(this.module, bytes);
      if (this.module._sip_decoder_set_source(this.decoder, ptr, bytes.byteLength) !== 0) {
        throw new Error('Failed to set buffered JPEG source');
      }
    } finally {
      if (ptr) {
        this.module._free(ptr);
      }
    }

    const header = this.readHeaderStep();
    if (header !== 'ready') {
      throw new Error('Incomplete JPEG header');
    }

    return { width: this.width, height: this.height };
  }

  readHeaderStep(): StepResult {
    const result = this.module._sip_decoder_read_header(this.decoder);
    if (result === 1) {
      return 'needMore';
    }
    if (result !== 0) {
      throw new Error('Failed to read JPEG header');
    }

    this.width = this.module._sip_decoder_get_width(this.decoder);
    this.height = this.module._sip_decoder_get_height(this.decoder);
    this.outputWidth = this.width;
    this.outputHeight = this.height;
    return 'ready';
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  setScale(scaleDenom: DctScaleDenom): { width: number; height: number } {
    if (this.module._sip_decoder_set_scale(this.decoder, scaleDenom) !== 0) {
      throw new Error(`Invalid scale denominator: ${scaleDenom}`);
    }

    this.outputWidth = this.module._sip_decoder_get_output_width(this.decoder);
    this.outputHeight = this.module._sip_decoder_get_output_height(this.decoder);
    return { width: this.outputWidth, height: this.outputHeight };
  }

  getOutputDimensions(): { width: number; height: number } {
    return { width: this.outputWidth, height: this.outputHeight };
  }

  start(): void {
    const step = this.startStep();
    if (step !== 'ready') {
      throw new Error('JPEG decoder needs more input before starting');
    }
  }

  startStep(): StepResult {
    if (this.started) {
      return 'ready';
    }

    const result = this.module._sip_decoder_start(this.decoder);
    if (result === 1) {
      return 'needMore';
    }
    if (result !== 0) {
      throw new Error('Failed to start JPEG decompression');
    }

    this.rowBufferPtr = this.module._sip_decoder_get_row_buffer(this.decoder);
    if (!this.rowBufferPtr) {
      throw new Error('Failed to get JPEG decoder row buffer');
    }

    this.started = true;
    return 'ready';
  }

  readScanline(): Scanline | null {
    const result = this.readScanlineStep();
    if (result === 'needMore') {
      throw new Error('JPEG decoder needs more input');
    }
    return result;
  }

  readScanlineStep(): ScanlineStep {
    if (!this.started || this.finished) {
      return null;
    }

    const result = this.module._sip_decoder_read_scanline(this.decoder);
    if (result === 2) {
      return 'needMore';
    }
    if (result === 0) {
      this.finished = true;
      return null;
    }
    if (result !== 1) {
      throw new Error('Failed to read JPEG scanline');
    }

    const rowSize = this.outputWidth * 3;
    const data = new Uint8Array(this.module.HEAPU8.buffer, this.rowBufferPtr, rowSize).slice();
    const y = this.module._sip_decoder_get_scanline(this.decoder) - 1;

    return { data, width: this.outputWidth, y };
  }

  finishStep(): StepResult {
    const result = this.module._sip_decoder_finish(this.decoder);
    if (result === 1) {
      return 'needMore';
    }
    if (result !== 0) {
      throw new Error('Failed to finish JPEG decompression');
    }

    return 'ready';
  }

  getBufferedInputSize(): number {
    return this.module._sip_decoder_get_buffered_input_size(this.decoder);
  }

  getRowBufferSize(): number {
    return this.module._sip_decoder_get_working_size(this.decoder);
  }

  dispose(): void {
    if (this.decoder) {
      this.module._sip_decoder_destroy(this.decoder);
      this.decoder = 0;
    }

    this.rowBufferPtr = 0;
    this.started = false;
    this.finished = false;
  }
}

/**
 * Calculate optimal DCT scale factor for a target size.
 */
export function calculateOptimalScale(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number
): DctScaleDenom {
  const scales: DctScaleDenom[] = [8, 4, 2, 1];

  for (const scale of scales) {
    const scaledWidth = Math.ceil(srcWidth / scale);
    const scaledHeight = Math.ceil(srcHeight / scale);

    if (scaledWidth >= targetWidth && scaledHeight >= targetHeight) {
      return scale;
    }
  }

  return 1;
}
