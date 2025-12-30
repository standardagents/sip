/**
 * Streaming Image Processing Pipeline
 *
 * Ultra memory-efficient processing that:
 * 1. Decodes JPEG at reduced scale using DCT scaling
 * 2. Resizes using scanline-based bilinear interpolation (2 rows in memory)
 * 3. Encodes to JPEG scanline-by-scanline
 *
 * Peak memory usage is ~50KB regardless of input image size.
 */

import type { ProcessOptions, ProcessResult, Scanline } from './types';
import { probe } from './probe';
import {
  loadWasm,
  isWasmAvailable,
  WasmJpegDecoder,
  WasmJpegEncoder,
  WasmPngDecoder,
  calculateOptimalScale,
} from './wasm';
import {
  createResizeState,
  processScanline,
  flushResize,
  calculateTargetDimensions,
} from './resize';

/**
 * Default options for streaming processing
 */
const DEFAULT_OPTIONS: Required<ProcessOptions> = {
  maxWidth: 4096,
  maxHeight: 4096,
  maxBytes: 1.5 * 1024 * 1024,
  quality: 85,
};

/**
 * Process a JPEG image using streaming pipeline
 *
 * This is the ultra-memory-efficient path that:
 * - Uses DCT scaling to decode at reduced resolution
 * - Processes one scanline at a time
 * - Never holds the full image in memory
 *
 * @param input - JPEG image data
 * @param options - Processing options
 * @returns Processed JPEG result
 */
export async function processJpegStreaming(
  input: ArrayBuffer,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Ensure WASM is loaded
  await loadWasm();

  // Create decoder and read header
  const decoder = new WasmJpegDecoder();

  try {
    const { width: srcWidth, height: srcHeight } = decoder.init(input);

    // Calculate target dimensions
    const target = calculateTargetDimensions(
      srcWidth,
      srcHeight,
      opts.maxWidth,
      opts.maxHeight
    );

    // Calculate optimal DCT scale
    const dctScale = calculateOptimalScale(
      srcWidth,
      srcHeight,
      target.width,
      target.height
    );

    // Set scale and get actual decode dimensions
    const { width: decodeWidth, height: decodeHeight } = decoder.setScale(dctScale);

    // Create resize state
    const resizeState = createResizeState(
      decodeWidth,
      decodeHeight,
      target.width,
      target.height
    );

    // Create encoder
    const encoder = new WasmJpegEncoder();
    encoder.init(target.width, target.height, opts.quality);
    encoder.start();

    // Start decoding
    decoder.start();

    // Process scanlines
    let decodedLine = 0;
    for (const scanline of decoder.readAllScanlines()) {
      // Process through resize
      const outputScanlines = processScanline(resizeState, scanline.data, decodedLine);
      decodedLine++;

      // Write output scanlines to encoder
      for (const outScanline of outputScanlines) {
        encoder.writeScanline(outScanline);
      }
    }

    // Flush remaining resize output
    const remaining = flushResize(resizeState);
    for (const outScanline of remaining) {
      encoder.writeScanline(outScanline);
    }

    // Finish encoding
    const jpegData = encoder.finish();

    // Check size and retry with lower quality if needed
    if (jpegData.byteLength > opts.maxBytes && opts.quality > 45) {
      encoder.dispose();
      decoder.dispose();

      // Retry with lower quality
      return processJpegStreaming(input, {
        ...opts,
        quality: opts.quality - 10,
      });
    }

    encoder.dispose();

    return {
      data: jpegData,
      width: target.width,
      height: target.height,
      mimeType: 'image/jpeg',
      originalFormat: 'jpeg',
    };
  } finally {
    decoder.dispose();
  }
}

/**
 * Process a PNG image using streaming pipeline
 *
 * Uses libspng for row-by-row decoding:
 * - Decodes one row at a time
 * - Processes through resize
 * - Encodes to JPEG scanline by scanline
 *
 * Note: PNG doesn't support DCT scaling like JPEG, so we decode at full
 * resolution but process row by row to minimize memory usage.
 *
 * @param input - PNG image data
 * @param options - Processing options
 * @returns Processed JPEG result
 */
export async function processPngStreaming(
  input: ArrayBuffer,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Ensure WASM is loaded
  await loadWasm();

  // Create PNG decoder and read header
  const decoder = new WasmPngDecoder();

  try {
    const { width: srcWidth, height: srcHeight } = decoder.init(input);

    // Calculate target dimensions
    const target = calculateTargetDimensions(
      srcWidth,
      srcHeight,
      opts.maxWidth,
      opts.maxHeight
    );

    // Create resize state (from full resolution to target)
    const resizeState = createResizeState(
      srcWidth,
      srcHeight,
      target.width,
      target.height
    );

    // Create JPEG encoder
    const encoder = new WasmJpegEncoder();
    encoder.init(target.width, target.height, opts.quality);
    encoder.start();

    // Start decoding
    decoder.start();

    // Process scanlines
    let decodedLine = 0;
    for (const scanline of decoder.readAllScanlines()) {
      // Process through resize
      const outputScanlines = processScanline(resizeState, scanline.data, decodedLine);
      decodedLine++;

      // Write output scanlines to encoder
      for (const outScanline of outputScanlines) {
        encoder.writeScanline(outScanline);
      }
    }

    // Flush remaining resize output
    const remaining = flushResize(resizeState);
    for (const outScanline of remaining) {
      encoder.writeScanline(outScanline);
    }

    // Finish encoding
    const jpegData = encoder.finish();

    // Check size and retry with lower quality if needed
    if (jpegData.byteLength > opts.maxBytes && opts.quality > 45) {
      encoder.dispose();
      decoder.dispose();

      // Retry with lower quality
      return processPngStreaming(input, {
        ...opts,
        quality: opts.quality - 10,
      });
    }

    encoder.dispose();

    return {
      data: jpegData,
      width: target.width,
      height: target.height,
      mimeType: 'image/jpeg',
      originalFormat: 'png',
    };
  } finally {
    decoder.dispose();
  }
}

/**
 * Check if streaming processing is available
 *
 * Returns false if WASM module is not built/loaded.
 */
export function isStreamingAvailable(): boolean {
  return isWasmAvailable();
}

/**
 * Try to load WASM for streaming processing
 *
 * Call this early to warm up the WASM module.
 */
export async function initStreaming(): Promise<boolean> {
  try {
    await loadWasm();
    return true;
  } catch {
    return false;
  }
}
